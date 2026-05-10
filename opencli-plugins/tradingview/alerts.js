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
 * Auth: cookies harvested via CDP. READ-ONLY: write endpoints (create_alert,
 * edit_alert, remove_alert, restart_alert) are intentionally NOT exposed.
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { tradingViewFetch } from './lib/cookies.js';

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
  strategy: Strategy.PUBLIC,
  browser: false,
  args: [
    {
      name: 'type',
      default: 'list',
      choices: ['list', 'active', 'triggered', 'offline', 'log'],
      help: 'Which alert view to fetch (default: list)',
    },
  ],
  columns: ['id', 'name', 'symbol', 'type', 'condition', 'value', 'active', 'status', 'fired_at'],
  func: async (_page, args) => {
    const which = String(args.type || 'list').toLowerCase();
    const path = ENDPOINTS[which];
    if (!path) throw new Error(`Unknown alerts --type: ${which}. One of: ${Object.keys(ENDPOINTS).join(', ')}`);

    const res = await tradingViewFetch(`${ALERTS_BASE}${path}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`alerts ${res.status}: ${text.slice(0, 200)}`);
    }
    const payload = await res.json();
    return normalizeAlerts(payload);
  },
});

/**
 * Normalize the alerts response.
 *
 * Wire shape (from live capture): `{ s: "ok", id: "<session>", r: [ { ... } ] }`.
 * The list of alerts is under the `r` key.
 */
export function normalizeAlerts(payload) {
  const arr = pickAlertList(payload);
  return arr.map((a) => ({
    id: a.id ?? a.alert_id ?? null,
    name: a.name ?? a.title ?? '',
    symbol: parseSymbol(a),
    type: a.type ?? a.alert_type ?? '',
    condition: extractCondition(a),
    value: numericOrNull(extractValue(a)),
    active: a.active ?? a.is_active ?? null,
    status: a.status ?? a.s ?? '',
    fired_at: a.fired_at ?? a.last_fire ?? a.created_at ?? '',
  }));
}

function pickAlertList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.r)) return payload.r;       // live shape: { s:"ok", r:[...] }
  if (Array.isArray(payload.alerts)) return payload.alerts;
  if (Array.isArray(payload.fires)) return payload.fires;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.log)) return payload.log;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function parseSymbol(a) {
  // TradingView wraps the resolution metadata in a JSON-encoded string field
  // named `symbol` or `ticker`. Extract the ticker if present.
  const raw = a.symbol ?? a.ticker ?? a.name ?? '';
  if (typeof raw !== 'string') return String(raw);
  if (raw.startsWith('=')) {
    try {
      const parsed = JSON.parse(raw.slice(1));
      return parsed.symbol ?? parsed.ticker ?? raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

function extractCondition(a) {
  if (!a.condition) return '';
  if (typeof a.condition === 'string') return a.condition;
  if (typeof a.condition === 'object') {
    return a.condition.type ?? a.condition.cond ?? JSON.stringify(a.condition);
  }
  return String(a.condition);
}

function extractValue(a) {
  if (a.value != null) return a.value;
  if (a.price != null) return a.price;
  if (a.condition?.value != null) return a.condition.value;
  if (Array.isArray(a.condition?.params) && a.condition.params.length > 0) return a.condition.params[0];
  return null;
}

function numericOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
