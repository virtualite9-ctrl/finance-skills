/**
 * tradingview chart-state — current symbol/interval/layout of an active chart tab.
 *
 * Reads the chart URL and a couple of well-known DOM hooks. The chart layout id
 * lives in the URL (/chart/<layout_id>/...) and the active symbol/interval are
 * read from the page's metadata.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';

cli({
  site: 'tradingview',
  name: 'chart-state',
  description: 'Current symbol, interval, and layout id of an active chart tab',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [],
  columns: ['layout_id', 'symbol', 'interval', 'url'],
  func: async (page) => {
    const url = String(await page.evaluate('window.location.href'));
    const layoutMatch = url.match(/\/chart\/([\w-]+)\//);
    const layoutId = layoutMatch ? layoutMatch[1] : null;

    const symbol = String(
      await page.evaluate(`
        (() => {
          const meta = document.querySelector('meta[property="og:title"]')?.content || '';
          const m = meta.match(/^([A-Z0-9.:_-]+?)\\s/);
          return m ? m[1] : (document.title.split(' ')[0] || '');
        })()
      `),
    );

    const interval = String(
      await page.evaluate(`
        (() => {
          const btn = document.querySelector('[data-name="resolution-button"] [class*="value"]');
          return btn ? btn.textContent.trim() : '';
        })()
      `),
    );

    return [{ layout_id: layoutId, symbol, interval, url }];
  },
});
