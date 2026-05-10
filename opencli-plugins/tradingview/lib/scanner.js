/**
 * TradingView scanner API helpers.
 *
 * Both the spot quote and the full options chain are served by POST
 * endpoints under scanner.tradingview.com:
 *   POST /global/scan2?label-product=symbols-options    → spot quotes
 *   POST /options/scan2?label-product=symbols-options   → full chain
 *
 * Auth comes from the user's TradingView desktop session — we run the fetch
 * from the page context (via `page.evaluate`) so cookies are attached.
 *
 * Responses use TradingView's compressed form:
 *   { totalCount, fields: [...], symbols: [{ s, f: [...] }, ...], time }
 *
 * Field positions are read from `fields` per response — never hard-code
 * indices; the wire format can drift.
 */

import { parseOpraSymbol, expirationToIso, daysToExpiry, buildTvSymbol } from './symbols.js';

const SCANNER_BASE = 'https://scanner.tradingview.com';

/** Fields requested for the spot-quote endpoint. */
const QUOTE_FIELDS = ['close', 'change', 'change_abs', 'currency', 'description'];

/** Fields requested for the options-chain endpoint. */
const CHAIN_FIELDS = [
  'ask', 'bid', 'currency', 'delta', 'expiration', 'gamma', 'iv',
  'option-type', 'pricescale', 'rho', 'root', 'strike', 'theoPrice',
  'theta', 'vega', 'bid_iv', 'ask_iv',
];

/**
 * Build the request body for the spot quote endpoint.
 * @param {string} exchange "NASDAQ"
 * @param {string} ticker "AAPL"
 */
export function buildQuoteBody(exchange, ticker) {
  return {
    symbols: { tickers: [buildTvSymbol(exchange, ticker)], query: { types: [] } },
    columns: QUOTE_FIELDS,
  };
}

/**
 * Build the request body for the options-chain endpoint.
 * @param {string} exchange "NASDAQ"
 * @param {string} ticker underlying (e.g. "SNDK")
 */
export function buildChainBody(exchange, ticker) {
  return {
    filter: [
      { left: 'type', operation: 'equal', right: 'option' },
      { left: 'root', operation: 'equal', right: String(ticker).toUpperCase() },
    ],
    options: { lang: 'en' },
    markets: [String(exchange).toLowerCase()],
    symbols: { query: { types: ['option'] } },
    columns: CHAIN_FIELDS,
    sort: { sortBy: 'expiration', sortOrder: 'asc' },
    range: [0, 5000],
  };
}

/**
 * Decode the compressed `{fields, symbols}` response shape into row objects.
 * Reads field positions from the `fields` array — never hard-coded.
 * @param {{fields: string[], symbols: {s: string, f: any[]}[]}} payload
 * @returns {{symbol: string, [k: string]: any}[]}
 */
export function decodeScannerRows(payload) {
  const fields = payload?.fields ?? [];
  const symbols = payload?.symbols ?? [];
  return symbols.map((row) => {
    const out = { symbol: row.s };
    for (let i = 0; i < fields.length; i++) {
      out[fields[i]] = row.f?.[i] ?? null;
    }
    return out;
  });
}

/**
 * Normalize an options-chain row from raw scanner output to the user-facing schema.
 * @param {Record<string, any>} raw  decoded row (from decodeScannerRows)
 * @param {Date} [now] override "today" for DTE math (tests)
 */
export function normalizeChainRow(raw, now) {
  const expiry = expirationToIso(raw.expiration);
  const bid = numericOrNull(raw.bid);
  const ask = numericOrNull(raw.ask);
  const mid = bid != null && ask != null ? (bid + ask) / 2 : null;
  const opraType = String(raw['option-type'] ?? '').toLowerCase();
  return {
    expiry,
    dte: daysToExpiry(expiry, now),
    strike: numericOrNull(raw.strike),
    type: opraType === 'call' ? 'call' : 'put',
    bid,
    ask,
    mid,
    iv: numericOrNull(raw.iv),
    delta: numericOrNull(raw.delta),
    gamma: numericOrNull(raw.gamma),
    theta: numericOrNull(raw.theta),
    vega: numericOrNull(raw.vega),
    rho: numericOrNull(raw.rho),
    theo: numericOrNull(raw.theoPrice),
    bid_iv: numericOrNull(raw.bid_iv),
    ask_iv: numericOrNull(raw.ask_iv),
    symbol: raw.symbol,
  };
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pivot a flat chain to ATM-band slice per (expiry, type).
 * @param {ReturnType<typeof normalizeChainRow>[]} rows
 * @param {number} spot  underlying price (used to centre the band)
 * @param {number} halfBand  number of strikes on each side. 0 = full list.
 */
export function strikesAroundSpot(rows, spot, halfBand) {
  if (!Number.isFinite(halfBand) || halfBand <= 0) return rows;
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.expiry}|${r.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.strike - b.strike);
    const idx = nearestStrikeIndex(group, spot);
    const lo = Math.max(0, idx - halfBand);
    const hi = Math.min(group.length, idx + halfBand + 1);
    for (let i = lo; i < hi; i++) out.push(group[i]);
  }
  return out;
}

function nearestStrikeIndex(sortedRows, spot) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < sortedRows.length; i++) {
    const d = Math.abs(sortedRows[i].strike - spot);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Aggregate a flat chain into the expiries view: one row per expiry with
 * DTE and contracts count.
 */
export function summarizeExpiries(rows) {
  const counts = new Map();
  for (const r of rows) {
    counts.set(r.expiry, (counts.get(r.expiry) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([expiry, contracts_count]) => ({ expiry, dte: daysToExpiry(expiry), contracts_count }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

/**
 * Run a scanner POST from inside the page context (so credentials are attached).
 * Caller must pass an opencli IPage. Returns the parsed JSON body.
 *
 * @param {{evaluate: (s: string) => Promise<any>}} page
 * @param {string} endpoint  e.g. 'global/scan2', 'options/scan2', 'america/scan2'
 * @param {object} body
 * @param {object} [opts]
 * @param {string} [opts.labelProduct]  default 'symbols-options' (used by /global/scan2 + /options/scan2).
 *   Stocks screener uses 'screener-stock'; calendars use 'calendar-earnings' etc.
 */
export async function scannerFetch(page, endpoint, body, opts = {}) {
  const labelProduct = opts.labelProduct ?? 'symbols-options';
  const url = `${SCANNER_BASE}/${endpoint}?label-product=${encodeURIComponent(labelProduct)}`;
  const script = `
    (async () => {
      const res = await fetch(${JSON.stringify(url)}, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: ${JSON.stringify(JSON.stringify(body))},
      });
      const text = await res.text();
      if (!res.ok) throw new Error('scanner ' + res.status + ': ' + text.slice(0, 200));
      return JSON.parse(text);
    })()
  `;
  return page.evaluate(script);
}

/**
 * Build the request body for the generic screener endpoint.
 *
 * Supports the full scan2 grammar: filter clauses, filter2 boolean trees,
 * sort, and column timeframe suffixes (e.g. "RSI|60" for 1h RSI).
 *
 * @param {object} opts
 * @param {string} opts.market  market path segment ("america", "crypto", etc.)
 * @param {string[]} opts.columns
 * @param {Array<object>} [opts.filter]
 * @param {object} [opts.filter2]  boolean composition tree
 * @param {{sortBy: string, sortOrder?: 'asc'|'desc'}} [opts.sort]
 * @param {number} [opts.limit]   max rows; clamped to [1, 500]
 * @param {number} [opts.offset]
 * @param {string[]} [opts.tickers]  optional explicit ticker list
 */
export function buildScreenerBody(opts) {
  const limit = Math.min(Math.max(1, Number(opts.limit) || 50), 500);
  const offset = Math.max(0, Number(opts.offset) || 0);
  const body = {
    markets: [String(opts.market).toLowerCase()],
    symbols: opts.tickers && opts.tickers.length
      ? { tickers: opts.tickers, query: { types: [] } }
      : { query: { types: [] } },
    options: { lang: 'en' },
    columns: opts.columns,
    range: [offset, offset + limit],
  };
  if (opts.filter) body.filter = opts.filter;
  if (opts.filter2) body.filter2 = opts.filter2;
  if (opts.sort) body.sort = { sortBy: opts.sort.sortBy, sortOrder: opts.sort.sortOrder ?? 'desc' };
  return body;
}

export { CHAIN_FIELDS, QUOTE_FIELDS, SCANNER_BASE };
