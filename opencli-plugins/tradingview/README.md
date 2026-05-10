# opencli-plugin-tradingview

Read-only [opencli](https://github.com/jackwener/opencli) adapter for the **TradingView desktop macOS app**. Exposes spot quotes, full options chains (with greeks/IV), expiries, chart state, and screenshots — all by attaching to a logged-in TradingView.app over Chrome DevTools Protocol. No API key, no cookie extraction.

This plugin lives inside the [`himself65/finance-skills`](https://github.com/himself65/finance-skills) monorepo. Install it via opencli's monorepo subpath syntax:

```bash
opencli plugin install github:himself65/finance-skills/tradingview
```

## Install + launch

```bash
# Prereqs: Node ≥ 21, TradingView.app installed and logged in
npm install -g @jackwener/opencli
opencli plugin install github:himself65/finance-skills/tradingview

# Relaunch TradingView with --remote-debugging-port (one-time per session)
opencli tradingview launch
```

`launch` quits any running TradingView and reopens it with `--remote-debugging-port=9222`. Save chart layouts first.

## Commands

| Command | Description | Output columns |
|---|---|---|
| `tradingview launch` | Relaunch TradingView with CDP port enabled | `port`, `pid`, `ready` |
| `tradingview status` | CDP connection state + active TradingView tabs | `connected`, `tabs` |
| `tradingview quote --ticker X` | Single-symbol spot quote | `symbol`, `close`, `change`, `change_abs`, `currency`, `time` |
| `tradingview options-chain --ticker X` | Options chain (full or ATM band) | `expiry`, `dte`, `strike`, `type`, `bid`, `ask`, `mid`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `theo`, `bid_iv`, `ask_iv`, `symbol` |
| `tradingview options-expiries --ticker X` | List available expiries | `expiry`, `dte`, `contracts_count` |
| `tradingview chart-state` | Active chart's symbol/interval/layout | `layout_id`, `symbol`, `interval`, `url` |
| `tradingview screenshot --output path.png` | PNG of an active chart tab | `path`, `bytes` |

`options-chain` flags: `--exchange` (default `NASDAQ`), `--expiry YYYY-MM-DD`, `--type call|put`, `--strikes-around-spot N` (default 6, `0` = full strike list).

All commands accept `-f json|yaml|md|csv|table`.

## Data path

Both spot quotes and the options chain come from `scanner.tradingview.com`:

- `POST /global/scan2?label-product=symbols-options` → spot quote (~220 B)
- `POST /options/scan2?label-product=symbols-options` → full chain (~750 KB / ~3,100 contracts on a typical name)

The plugin runs the `fetch()` call from inside a TradingView page context (via `page.evaluate`) so the desktop app's session cookies are attached automatically. Responses arrive in the standard `{fields, symbols}` compressed form; field positions are read from the response — never hard-coded.

## Auth model

No bearer token, no API key. The adapter relies entirely on the desktop app's logged-in session. Subscription tier matches what the user sees in the app — free / Essential / Plus / Premium tiers may return a subset of options data for some symbols.

## Status

This is **v0.1 — needs PoC verification.** The shapes follow a working Python PoC (referenced in the [skill handoff](../../plugins/data-providers/skills/tradingview-reader/SKILL.md)) but the Node port has not yet been smoke-tested against a live TradingView.app. Field positions and CDP flow may need adjustment on first run.

## Layout

```
opencli-plugins/tradingview/
├── opencli-plugin.json        # plugin manifest
├── package.json               # Node package (type: module)
├── lib/
│   ├── scanner.js             # POST helpers + {fields,symbols} decoder
│   └── symbols.js             # OPRA parser, expiry helpers
├── launch.js                  # spawns TradingView with --remote-debugging-port
├── status.js                  # CDP /json + tab filter
├── quote.js                   # global/scan2 → spot
├── options-chain.js           # options/scan2 → chain (full or ATM band)
├── options-expiries.js        # options/scan2 → expiry list
├── chart-state.js             # window.location + DOM hooks → symbol/interval
├── screenshot.js              # Page.captureScreenshot → PNG
└── tests/
    ├── symbols.test.js        # node:test — pure parser tests
    └── scanner.test.js        # node:test — decoder + filter tests
```

## License

MIT
