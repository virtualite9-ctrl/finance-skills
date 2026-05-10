---
name: tradingview-reader
description: >
  Read TradingView desktop app for market data using opencli (read-only).
  Use this skill whenever the user wants spot quotes, options chains, options
  expiries, chart state, or screenshots of charts open in their local
  TradingView.app. Triggers include: "options chain for X", "what's the IV
  on Y", "show me SNDK puts", "what's the bid/ask on AAPL options",
  "what symbol is on my TradingView chart", "screenshot my NVDA chart",
  "TradingView quote for", "TV options for", "what expiries does X have",
  "TradingView IV skew", any mention of TradingView in context of reading
  market data, options data, or charts.
  This skill is READ-ONLY — it does NOT place trades, modify watchlists,
  or change chart layouts.
---

# TradingView Reader (Read-Only)

Reads TradingView's desktop macOS app for quotes, options chains, and chart state via [opencli](https://github.com/jackwener/opencli) and a CDP attach to the running TradingView.app process. Powered by the [`himself65/opencli-plugin-tradingview`](https://github.com/himself65/opencli-plugin-tradingview) plugin (separate from opencli's built-in adapters).

**This skill is read-only.** Designed for analysis: pulling options chains, checking IV/greeks, capturing chart state. It does NOT place trades, post ideas, modify watchlists, or change chart layouts.

**Important**: Unlike browser-based opencli readers (twitter, linkedin), this one talks directly to a running TradingView desktop app over Chrome DevTools Protocol. The user must (a) have `TradingView.app` installed, and (b) be logged in inside that app. The plugin handles relaunching with the debug port.

---

## Step 1: Ensure opencli + Plugin Are Installed and Ready

**Current environment status:**

```
!`(command -v opencli && opencli tradingview status 2>&1 | head -5 && echo "READY" || echo "SETUP_NEEDED") 2>/dev/null || echo "NOT_INSTALLED"`
```

If the status above shows `READY`, skip to Step 2. Otherwise:

### NOT_INSTALLED — Install opencli

```bash
npm install -g @jackwener/opencli
```

Requires Node.js >= 21 (or Bun >= 1.0).

### SETUP_NEEDED — Install the TradingView plugin and launch with CDP

The TradingView adapter is **not** built into opencli — it's a separate plugin:

```bash
# Install the plugin
opencli plugin install github:himself65/opencli-plugin-tradingview

# Relaunch TradingView.app with CDP enabled (one-time per session)
opencli tradingview launch
```

The `launch` step quits the running TradingView and reopens it with `--remote-debugging-port=9222`. **Warn the user to save chart layouts first** if they have unsaved drawings.

### Common setup issues

| Symptom | Fix |
|---|---|
| `opencli: command not found` | `npm install -g @jackwener/opencli` (Node ≥ 21) |
| `Unknown command: tradingview` | `opencli plugin install github:himself65/opencli-plugin-tradingview` |
| `CDP not reachable on :9222` | `opencli tradingview launch` to relaunch the app |
| `No TradingView tab found` | App is open but logged out — log in inside the desktop app |
| Empty chain / 0 contracts | Subscription tier on the logged-in account doesn't include options for this symbol |

---

## Step 2: Identify What the User Needs

| User Request | Command | Key Flags |
|---|---|---|
| Setup / connection check | `opencli tradingview status` | — |
| Spot quote | `opencli tradingview quote --ticker X` | `--exchange NASDAQ` |
| Options chain (full) | `opencli tradingview options-chain --ticker X` | `--exchange` |
| Options chain (one expiry, ATM band) | `opencli tradingview options-chain --ticker X --expiry YYYY-MM-DD` | `--type call\|put`, `--strikes-around-spot N` |
| List expiries | `opencli tradingview options-expiries --ticker X` | — |
| What's on the chart | `opencli tradingview chart-state` | `--tab <id>` |
| Screenshot a chart | `opencli tradingview screenshot --output ~/charts/nvda.png` | `--tab <id>` |
| Relaunch app with CDP | `opencli tradingview launch` | `--port 9222` |

---

## Step 3: Execute the Command

### General pattern

```bash
# Use -f json or -f yaml for structured output
opencli tradingview options-chain --ticker SNDK --expiry 2026-05-22 -f json
opencli tradingview options-chain --ticker NVDA --strikes-around-spot 8 -f csv
opencli tradingview quote --ticker SPY --exchange NYSEARCA -f json
```

### Key rules

1. **Run `opencli tradingview status` first** if connectivity is uncertain — it reports CDP connection state and active TradingView tabs.
2. **Use `-f json`** for programmatic processing (LLM context, downstream skills).
3. **Filter by expiry and `--strikes-around-spot`** — full chains can be 3,000+ rows; an unfiltered dump is rarely what the user wants.
4. **Default `--exchange NASDAQ`** for US equities; require explicit `--exchange` for ETFs (e.g. SPY = NYSEARCA, QQQ = NASDAQ) or non-US listings.
5. **NEVER call any write operation.** This skill is read-only — no trades, no watchlist edits, no chart writes.

### Output format flag (`-f`)

| Format | Flag | Best for |
|---|---|---|
| Table | `-f table` (default) | Human-readable terminal output |
| JSON | `-f json` | Programmatic processing, LLM context |
| YAML | `-f yaml` | Structured output, readable |
| Markdown | `-f md` | Documentation, reports |
| CSV | `-f csv` | Spreadsheet export |

### Output columns

- `quote` — `symbol`, `close`, `change`, `change_abs`, `currency`, `time`
- `options-chain` — `expiry`, `dte`, `strike`, `type`, `bid`, `ask`, `mid`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `theo`, `bid_iv`, `ask_iv`, `symbol`
- `options-expiries` — `expiry`, `dte`, `contracts_count`
- `chart-state` — `layout_id`, `symbol`, `interval`, `url`
- `screenshot` — `path`, `bytes`

---

## Step 4: Present the Results

1. **Lead with the structure summary** — for an options chain, state spot price, expiry being shown, ATM strike, and IV regime first; then the table.
2. **Filter aggressively before showing** — never paste a 3,000-row chain. Default to ATM ± 6 strikes per expiry unless the user asks for the full chain.
3. **Highlight skew** — when showing both calls and puts, note IV skew direction if material.
4. **For chart-state**, report layout id + symbol + interval + URL succinctly; offer to screenshot.
5. **Treat sessions as private** — never expose CDP target IDs, cookies, or layout IDs unless the user asks.
6. **Cross-reference with Funda when the user is making a trade decision** — TradingView's options data is convenient but can lag; for trade entry analysis, also fetch from the `funda-data` skill and reconcile.

---

## Step 5: Diagnostics

```bash
opencli tradingview status
```

Returns CDP connection state and active TradingView tabs. If CDP is down, run `opencli tradingview launch` to relaunch with the debug port.

---

## Error Reference

| Error | Cause | Fix |
|---|---|---|
| `Unknown command: tradingview` | Plugin not installed | `opencli plugin install github:himself65/opencli-plugin-tradingview` |
| `CDP not reachable on :9222` | App launched without debug port | `opencli tradingview launch` |
| `No tab matches tradingview.com` | App open but no TradingView page loaded | Open any chart or symbol page in TradingView, then retry |
| `Empty chain / status 200 / totalCount=0` | Subscription tier doesn't cover this symbol's options | Check account tier in the desktop app |
| `Symbol not found` | Wrong exchange | Pass `--exchange` explicitly, or run a search first |
| Rate limited | Too many requests | Wait a few seconds, then retry |

---

## Reference Files

- `references/commands.md` — Every command with all flags, output examples, and analyst workflows
