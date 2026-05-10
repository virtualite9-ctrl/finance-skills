/**
 * tradingview screenshot — PNG of a chart tab via CDP Page.captureScreenshot.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';
import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'tradingview',
  name: 'screenshot',
  description: 'PNG screenshot of an active TradingView chart tab',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'output', help: 'Output PNG path (default: ~/tradingview-<timestamp>.png)' },
  ],
  columns: ['path', 'bytes'],
  func: async (page, args) => {
    const outPath = resolveOutputPath(args.output);
    const png = await pageScreenshot(page);
    const dir = dirname(outPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, png);
    return [{ path: outPath, bytes: png.length }];
  },
});

function resolveOutputPath(arg) {
  if (arg) return resolvePath(String(arg).replace(/^~/, homedir()));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolvePath(homedir(), `tradingview-${stamp}.png`);
}

/**
 * Capture the current page as PNG.
 *
 * Prefers `page.screenshot()` if the host opencli IPage exposes it; falls back
 * to driving CDP `Page.captureScreenshot` via `page.cdp` / `page.send`. The exact
 * shape is host-dependent — adjust during PoC if needed.
 */
async function pageScreenshot(page) {
  if (typeof page.screenshot === 'function') {
    const result = await page.screenshot({ type: 'png' });
    if (Buffer.isBuffer(result)) return result;
    if (typeof result === 'string') return Buffer.from(result, 'base64');
  }
  if (typeof page.send === 'function') {
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }
  if (page.cdp && typeof page.cdp.send === 'function') {
    const { data } = await page.cdp.send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(data, 'base64');
  }
  throw new Error('Host opencli IPage does not expose screenshot/CDP send — cannot capture screenshot.');
}
