/**
 * tradingview alerts — read-only access to pricealerts.tradingview.com.
 *
 * One command, multiple modes via --type:
 *   list      → /list_alerts          all alerts (active + paused)
 *   active    → /get_active_alerts    currently armed
 *   triggered → /get_triggered_alerts recently fired
 *   offline   → /get_offline_fires    fired while user was offline
 *   log       → /get_log              full historical fire log
 *
 * Auth: session cookie (page-context fetch attaches it automatically).
 *
 * READ-ONLY: write endpoints (create_alert, edit_alert, remove_alert,
 * restart_alert) are intentionally NOT exposed.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';

const ALERTS_BASE = 'https://pricealerts.tradingview.com';

const ENDPOINTS = {
  list: '/list_alerts',
  active: '/get_active_alerts',
  triggered: '/get_triggered_alerts',
  offline: '/get_offline_fires',
  log: '/get_log',
};

cli({
  site: 'tradingview',
  name: 'alerts',
  description: 'TradingView price alerts (read-only): list, active, triggered, offline-fires, log',
  domain: 'www.tradingview.com',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'type',
      default: 'list',
      choices: ['list', 'active', 'triggered', 'offline', 'log'],
      help: 'Which alert view to fetch (default: list)',
    },
  ],
  columns: ['id', 'name', 'symbol', 'type', 'condition', 'value', 'active', 'status', 'fired_at'],
  func: async (page, args) => {
    const which = String(args.type || 'list').toLowerCase();
    const path = ENDPOINTS[which];
    if (!path) throw new Error(`Unknown alerts --type: ${which}. One of: ${Object.keys(ENDPOINTS).join(', ')}`);

    const payload = await getJson(page, `${ALERTS_BASE}${path}`);
    return normalizeAlerts(payload);
  },
});

function normalizeAlerts(payload) {
  const arr = pickAlertList(payload);
  return arr.map((a) => ({
    id: a.id ?? a.alert_id ?? null,
    name: a.name ?? a.title ?? '',
    symbol: a.symbol ?? a.ticker ?? a.resolution ?? '',
    type: a.type ?? a.alert_type ?? '',
    condition: a.condition ?? a.cond ?? '',
    value: a.value ?? a.price ?? null,
    active: a.active ?? a.is_active ?? null,
    status: a.status ?? '',
    fired_at: a.fired_at ?? a.last_fire ?? a.created_at ?? '',
  }));
}

function pickAlertList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.alerts)) return payload.alerts;
  if (Array.isArray(payload.fires)) return payload.fires;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.log)) return payload.log;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function getJson(page, url) {
  const script = `
    (async () => {
      const res = await fetch(${JSON.stringify(url)}, { credentials: 'include' });
      const text = await res.text();
      if (!res.ok) throw new Error('alerts ' + res.status + ': ' + text.slice(0, 200));
      return JSON.parse(text);
    })()
  `;
  return page.evaluate(script);
}
