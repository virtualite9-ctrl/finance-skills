/**
 * tradingview options-expiries — list available expirations with DTE + contract count.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChainBody,
  decodeScannerRows,
  normalizeChainRow,
  scannerFetch,
  summarizeExpiries,
} from './lib/scanner.js';

cli({
  site: 'tradingview',
  name: 'options-expiries',
  description: 'List available options expirations with DTE and contract count',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'ticker', required: true, help: 'Underlying ticker' },
    { name: 'exchange', default: 'NASDAQ', help: 'TradingView exchange code' },
  ],
  columns: ['expiry', 'dte', 'contracts_count'],
  func: async (page, args) => {
    const ticker = String(args.ticker).toUpperCase().trim();
    const exchange = String(args.exchange).toUpperCase().trim();
    const payload = await scannerFetch(page, 'options/scan2', buildChainBody(exchange, ticker));
    const rows = decodeScannerRows(payload).map((r) => normalizeChainRow(r));
    if (rows.length === 0) {
      throw new Error(`No options for ${exchange}:${ticker} — check tier or exchange.`);
    }
    return summarizeExpiries(rows);
  },
});
