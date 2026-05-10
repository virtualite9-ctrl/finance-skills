/**
 * tradingview quote — single-symbol spot quote via scanner.tradingview.com.
 *
 * Runs `fetch('/global/scan2', ...)` from the TradingView page context so
 * the user's logged-in cookies are attached automatically.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildQuoteBody, decodeScannerRows, scannerFetch } from './lib/scanner.js';

cli({
  site: 'tradingview',
  name: 'quote',
  description: 'Single-symbol spot quote (close, change, currency)',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'ticker', required: true, help: 'Symbol (e.g. AAPL)' },
    { name: 'exchange', default: 'NASDAQ', help: 'TradingView exchange code (NASDAQ, NYSE, NYSEARCA, ...)' },
  ],
  columns: ['symbol', 'close', 'change', 'change_abs', 'currency', 'time'],
  func: async (page, args) => {
    const ticker = String(args.ticker).toUpperCase().trim();
    const exchange = String(args.exchange).toUpperCase().trim();

    const body = buildQuoteBody(exchange, ticker);
    const payload = await scannerFetch(page, 'global/scan2', body);
    const rows = decodeScannerRows(payload);

    if (rows.length === 0) {
      throw new Error(`No quote returned for ${exchange}:${ticker} — verify the exchange.`);
    }
    const row = rows[0];
    return [{
      symbol: row.symbol,
      close: numericOrNull(row.close),
      change: numericOrNull(row.change),
      change_abs: numericOrNull(row.change_abs),
      currency: row.currency ?? null,
      time: payload?.time ?? null,
    }];
  },
});

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
