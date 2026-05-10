/**
 * tradingview options-chain — full chain or filtered slice via scanner.tradingview.com.
 *
 * One POST to /options/scan2 returns the entire chain (all expiries, all strikes,
 * calls + puts) in TradingView's compressed `{fields, symbols}` form.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChainBody,
  buildQuoteBody,
  decodeScannerRows,
  normalizeChainRow,
  scannerFetch,
  strikesAroundSpot,
} from './lib/scanner.js';

const DEFAULT_HALF_BAND = 6;

cli({
  site: 'tradingview',
  name: 'options-chain',
  description: 'Options chain (full or ATM-band slice) with greeks, IV, and theoretical price',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'ticker', required: true, help: 'Underlying ticker (e.g. SNDK)' },
    { name: 'exchange', default: 'NASDAQ', help: 'TradingView exchange code' },
    { name: 'expiry', help: 'ISO expiry (YYYY-MM-DD). Omit for all expiries.' },
    { name: 'type', choices: ['call', 'put'], help: 'Filter to call or put only' },
    {
      name: 'strikes-around-spot',
      type: 'int',
      default: DEFAULT_HALF_BAND,
      help: `Half-band; total strikes = 2N+1. 0 = full strike list. (default ${DEFAULT_HALF_BAND})`,
    },
  ],
  columns: [
    'expiry', 'dte', 'strike', 'type', 'bid', 'ask', 'mid', 'iv',
    'delta', 'gamma', 'theta', 'vega', 'rho', 'theo', 'bid_iv', 'ask_iv', 'symbol',
  ],
  func: async (page, args) => {
    const ticker = String(args.ticker).toUpperCase().trim();
    const exchange = String(args.exchange).toUpperCase().trim();
    const wantExpiry = args.expiry ? String(args.expiry) : null;
    const wantType = args.type ? String(args.type).toLowerCase() : null;
    const halfBand = Number(args['strikes-around-spot'] ?? DEFAULT_HALF_BAND);

    const [chainPayload, quotePayload] = await Promise.all([
      scannerFetch(page, 'options/scan2', buildChainBody(exchange, ticker)),
      scannerFetch(page, 'global/scan2', buildQuoteBody(exchange, ticker)),
    ]);

    let rows = decodeScannerRows(chainPayload).map((r) => normalizeChainRow(r));

    if (rows.length === 0) {
      throw new Error(
        `Empty chain for ${exchange}:${ticker}. The logged-in account's tier may not include options for this symbol.`,
      );
    }

    if (wantExpiry) rows = rows.filter((r) => r.expiry === wantExpiry);
    if (wantType) rows = rows.filter((r) => r.type === wantType);

    if (halfBand > 0) {
      const quoteRows = decodeScannerRows(quotePayload);
      const spot = Number(quoteRows[0]?.close);
      if (Number.isFinite(spot)) {
        rows = strikesAroundSpot(rows, spot, halfBand);
      }
    }

    rows.sort((a, b) =>
      a.expiry.localeCompare(b.expiry) || a.strike - b.strike || a.type.localeCompare(b.type),
    );
    return rows;
  },
});
