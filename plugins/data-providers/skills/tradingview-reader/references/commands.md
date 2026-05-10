# opencli TradingView Command Reference (Read-Only)

Complete read-only reference for the `tradingview` opencli adapter that lives in this repo's [`opencli-plugins/tradingview`](../../../../opencli-plugins/tradingview/) tree, scoped to financial research use cases.

Install: `npm install -g @jackwener/opencli && opencli plugin install github:himself65/finance-skills/tradingview`

**This skill is read-only.** No write operations, no trade execution.

---

## Setup

The adapter connects to a running `TradingView.app` over Chrome DevTools Protocol (CDP) — no bot account, no API key, no Browser Bridge extension.

**Requirements:**
1. Node.js >= 21 (or Bun >= 1.0)
2. `TradingView.app` installed on macOS, logged in
3. App launched with `--remote-debugging-port=9222` (the `launch` command handles this)

**Launch with CDP:**

```bash
opencli tradingview launch              # default port 9222
opencli tradingview launch --port 9333  # custom port
```

The `launch` step quits any running TradingView and reopens it with the debug port. Warn the user to save chart layouts first.

**Verify connectivity:**

```bash
opencli tradingview status
```

---

## Read Operations

### launch

Quits any running TradingView and re-launches it with `--remote-debugging-port` enabled. Polls `/json/version` until the app is reachable.

```bash
opencli tradingview launch
opencli tradingview launch --port 9333
opencli tradingview launch -f json
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--port` | no | `9222` | CDP port |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `port`, `pid`, `ready`

---

### status

Reports CDP connection state and lists active TradingView tabs (chart, symbol page, options page).

```bash
opencli tradingview status
opencli tradingview status -f json
```

**Output columns:** `connected`, `tabs[]` (each tab has `id`, `type`, `url`, `title`)

Use `OPENCLI_CDP_TARGET=tradingview.com` to disambiguate when multiple Electron CDP sessions are running on the host.

---

### quote

Single-symbol spot quote, backed by `scanner.tradingview.com/global/scan2`.

```bash
opencli tradingview quote --ticker AAPL
opencli tradingview quote --ticker SPY --exchange NYSEARCA -f json
opencli tradingview quote --ticker BABA --exchange NYSE
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--ticker` | yes | — | Symbol (e.g. `AAPL`) |
| `--exchange` | no | `NASDAQ` | TradingView exchange code (`NASDAQ`, `NYSE`, `NYSEARCA`, ...) |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `symbol`, `close`, `change`, `change_abs`, `currency`, `time`

---

### options-chain

Full options chain or filtered slice. Backed by `scanner.tradingview.com/options/scan2`. Returns one row per (expiry × strike × type) tuple — the response is the entire chain in one request, not paginated.

```bash
# Full chain (every expiry, every strike, calls + puts) — can be 3,000+ rows
opencli tradingview options-chain --ticker SNDK -f json

# One expiry, ATM ± 6 strikes, both call and put
opencli tradingview options-chain --ticker SNDK --expiry 2026-05-22 \
    --strikes-around-spot 6 -f json

# Calls only, full strike list, single expiry
opencli tradingview options-chain --ticker NVDA --expiry 2026-06-19 \
    --type call --strikes-around-spot 0 -f json

# CSV export for spreadsheet analysis
opencli tradingview options-chain --ticker AAPL --expiry 2026-05-15 -f csv
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--ticker` | yes | — | Underlying ticker |
| `--exchange` | no | `NASDAQ` | TradingView exchange code |
| `--expiry` | no | all | ISO date (`YYYY-MM-DD`) |
| `--type` | no | both | `call` or `put` |
| `--strikes-around-spot` | no | `6` | Half-band; total strikes = 2N+1. `0` = full strike list. |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `expiry`, `dte`, `strike`, `type`, `bid`, `ask`, `mid`, `iv`, `delta`, `gamma`, `theta`, `vega`, `rho`, `theo`, `bid_iv`, `ask_iv`, `symbol`

**Symbol format:** `OPRA:<ROOT><YY><MM><DD><C|P><STRIKE>` (OCC-style, e.g. `OPRA:SNDK260522C2090.0`).

**Sample row (JSON):**

```json
{
  "expiry": "2026-05-22", "dte": 12, "strike": 2090, "type": "call",
  "bid": 12.9, "ask": 18.4, "mid": 15.65, "iv": 1.0953,
  "delta": 0.1035, "gamma": 0.000542, "theta": -2.177, "vega": 0.5456, "rho": 0.0552,
  "theo": 15.0, "bid_iv": 1.0546, "ask_iv": 1.1540,
  "symbol": "OPRA:SNDK260522C2090.0"
}
```

#### Common analyst workflows

- **IV regime check:** `--strikes-around-spot 0 --expiry <next-monthly>` → look at ATM IV vs IV at ±20%.
- **Skew measurement:** filter calls and puts at equidistant OTM strikes (e.g. ±10% from spot), compare IVs to quantify put skew.
- **Liquidity scan before structure:** sort by `(ask - bid)/mid` to flag wide spreads before placing a multi-leg order.
- **Theoretical edge:** compare `mid` to `theo` per row — large positive `theo - mid` suggests a market mispricing (or stale data — verify with the bid IV / ask IV envelope).

---

### options-expiries

Lists every available expiration for a ticker with DTE and contract counts. Useful before pulling a full chain to know what's available.

```bash
opencli tradingview options-expiries --ticker SNDK
opencli tradingview options-expiries --ticker SPY --exchange NYSEARCA -f json
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--ticker` | yes | — | Underlying ticker |
| `--exchange` | no | `NASDAQ` | TradingView exchange code |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `expiry`, `dte`, `contracts_count`

---

### chart-state

Returns the current symbol/interval/layout of an active chart tab via CDP `Runtime.evaluate`.

```bash
opencli tradingview chart-state               # picks the first chart tab
opencli tradingview chart-state --tab abc123  # specific tab id (from `status`)
opencli tradingview chart-state -f json
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--tab` | no | first chart tab | Tab id from `opencli tradingview status` |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `layout_id`, `symbol`, `interval`, `url`

---

### screenshot

Captures a PNG of a chart tab via CDP `Page.captureScreenshot`.

```bash
opencli tradingview screenshot --output ~/charts/nvda.png
opencli tradingview screenshot --tab abc123 --output ./snap.png
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `--tab` | no | first chart tab | Tab id from `opencli tradingview status` |
| `--output` | no | autogenerated | Output path (PNG) |
| `-f, --format` | no | `table` | `table\|json\|yaml\|md\|csv` |

**Output columns:** `path`, `bytes`

---

## Output Formats

All commands support the `-f` / `--format` flag:

| Format | Flag | Description |
|---|---|---|
| Table | `-f table` (default) | Rich CLI table |
| JSON | `-f json` | Pretty-printed JSON (2-space indent) |
| YAML | `-f yaml` | Structured YAML |
| Markdown | `-f md` | Pipe-delimited markdown tables |
| CSV | `-f csv` | Comma-separated values |

---

## Financial Research Workflows

### Quick IV / skew check on a single ticker

```bash
# 1. List expiries, pick the front month
opencli tradingview options-expiries --ticker NVDA -f json

# 2. Pull ATM band for that expiry, both call and put
opencli tradingview options-chain --ticker NVDA --expiry 2026-05-15 \
    --strikes-around-spot 6 -f json

# 3. Compare ATM call IV vs ATM put IV → skew direction
```

### Liquidity check before a multi-leg structure

```bash
# Pull the legs you plan to trade
opencli tradingview options-chain --ticker AAPL --expiry 2026-06-19 \
    --strikes-around-spot 8 -f csv > aapl_chain.csv

# In the CSV: sort by (ask-bid)/mid descending → widest spreads at the top
# Avoid legs with > 5–10% relative spread on liquid names
```

### Cross-reference TradingView vs Funda

TradingView's options data is convenient (no API key, runs against your logged-in session) but can lag. For trade entry decisions:

```bash
# 1. Pull the chain from TradingView
opencli tradingview options-chain --ticker SNDK --expiry 2026-05-22 \
    --strikes-around-spot 6 -f json > tv_chain.json

# 2. Cross-reference with Funda (different skill — see funda-data)
#    GET /v1/options/stock?ticker=SNDK&type=option-chains&expiry=2026-05-22

# 3. Reconcile bid/ask/IV/greeks; flag any large divergence
```

### Capture a chart for research notes

```bash
# 1. Identify what's currently shown
opencli tradingview chart-state -f json

# 2. Snapshot it
opencli tradingview screenshot --output ~/research/sndk-2026-05-10.png
```

---

## Error Reference

| Error | Cause | Fix |
|---|---|---|
| `Unknown command: tradingview` | Plugin not installed | `opencli plugin install github:himself65/finance-skills/tradingview` |
| `CDP not reachable on :9222` | App launched without debug port | `opencli tradingview launch` |
| `No tab matches tradingview.com` | App open but no TradingView page loaded | Open any chart in TradingView, then retry |
| `Empty chain / totalCount=0` | Subscription tier doesn't cover this symbol's options | Check account tier in the desktop app |
| `Symbol not found` | Wrong exchange | Pass `--exchange` explicitly |
| Multiple Electron CDP targets | Other Electron apps on the same port | Set `OPENCLI_CDP_TARGET=tradingview.com` |
| Rate limited / stale data | Too many requests | Wait a few seconds; the plugin caches `options/scan2` for ~5–10 s per ticker |

---

## Limitations

- **macOS only** — the `launch` helper relies on `open -a TradingView --args`. Linux / Windows desktop apps are not supported by this plugin.
- **Logged-in app required** — no auth bypass; data tier matches what the user sees in the app.
- **Read-only in this skill** — even if the plugin grows write commands later (alerts, watchlists), this skill forbids them.
- **Single attached app at a time** — if multiple Electron CDP sessions exist, set `OPENCLI_CDP_TARGET`.
- **Field positions are read from the response** — never hard-code field indices; if the plugin breaks because TradingView changes the wire format, file an issue at the plugin repo.

---

## Best Practices

- **Filter aggressively** — full chains are 3,000+ rows. Default to ATM ± 6 strikes per expiry.
- **Use `-f json`** for programmatic processing and LLM context.
- **Use `-f csv`** for spreadsheet analysis of chains.
- **Run `status` before `options-chain`** if you suspect connectivity issues.
- **Treat CDP endpoints as private** — never log or display debug URLs, target ids, or layout ids.
- **Spot self-consistency check** — `quote.close` should fall within `[min_strike, max_strike]` of the chain. If not, suspect stale data or wrong exchange.
