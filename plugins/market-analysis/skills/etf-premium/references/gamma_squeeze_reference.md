# ETF Gamma Squeeze & Premium Surge Reference

This document supports **Sub-Skill E** in `SKILL.md`. It covers:

1. The premium-decomposition framework (NAV vs excess)
2. Dealer gamma exposure (GEX) — formula, conventions, and worked example
3. The convergence-timeline framework (hours / days / weeks)
4. Risk indicators that distinguish a real gamma squeeze from a routine rally

---

## 1. Premium Decomposition Framework

When an ETF moves much more than its underlying basket in a single session, the move can be decomposed into two parts:

```
ETF return = NAV-driven return + Excess premium return
```

Where:

- **NAV-driven return** = weighted return of the ETF's holdings, computed from observable underlying prices
- **Excess premium return** = the residual; reflects supply/demand imbalance unmet by AP arbitrage

### Why the residual exists

The AP arbitrage mechanism keeps ETF price ≈ NAV under normal conditions. The residual appears when arbitrage is impeded:

| Source of residual | Mechanism | Typical signature |
|---|---|---|
| Underlying market closed | APs cannot transact in basket securities | International ETFs during US-only hours |
| Options dealer gamma hedging | Dealers short gamma must buy on rallies | Heavy call OI, IV spike, single strike concentration |
| Creation unit cap reached | Issuer limits new share creation | Crypto ETFs at launch; specialty ETFs in surge |
| Sentiment/retail flow surge | Buying pressure outpaces AP capacity | Thematic / meme ETFs in news cycles |
| Underlying basket illiquid | APs cannot price/source basket reliably | EM bond, credit, frontier market ETFs |

### How to estimate NAV return when end-of-day NAV isn't published yet

`yfinance` only exposes the most recent end-of-day `navPrice`. For an intraday or just-closed-day decomposition, estimate NAV change from the holdings:

```
NAV_return ≈ Σ (weight_i × return_i) / Σ weight_i
```

Sources of holdings weights:

1. `yf.Ticker(...).funds_data.top_holdings` — works for many US-listed ETFs but is incomplete
2. ETF issuer holdings page (iShares, SPDR, Invesco) — most authoritative
3. User-supplied weights — for niche or international ETFs

When the underlying market is closed during the ETF's session:

- Substitute ADRs (e.g., for Asian holdings: 005930.KS → could use SSNLF or Korean futures during US session)
- Use sector futures (e.g., E-mini Nasdaq for tech-heavy ETFs)
- Flag the result as a **proxy** — explicitly note it is not an audited NAV

---

## 2. Dealer Gamma Exposure (GEX)

### Single-contract gamma (Black-Scholes)

```
d1    = (ln(S/K) + (r + σ²/2) × T) / (σ × √T)
gamma = φ(d1) / (S × σ × √T)
```

Where:
- `S` = spot price
- `K` = strike price
- `T` = time to expiration in years
- `r` = risk-free rate (decimal, e.g., 0.045)
- `σ` = implied volatility (decimal, e.g., 0.40)
- `φ(x)` = standard normal PDF = `exp(-x²/2) / √(2π)`

### Per-contract dollar gamma per 1% spot move

For one contract with multiplier 100:

```
$ delta change per $1 spot move  = 100 × gamma × S         (in dollars)
$ delta change per 1% spot move  = 100 × gamma × S × (S × 0.01)
                                 = gamma × S²              (in dollars)
```

So:

```
$ gamma exposure per 1% move (one contract) = OI × gamma × S²
```

(Implicit assumption: multiplier = 100; which it is for US equity options.)

### Aggregating across the chain

Two conventions are widely used. Always state which one you're using.

#### Convention A: SqueezeMetrics-style net GEX

Assumes **dealers short calls, long puts** (the typical net market-maker book in equity index options):

```
net_GEX_$ = Σ (OI_call × gamma_call) × S²
          - Σ (OI_put × gamma_put) × S²
```

Interpretation:

- **Positive net GEX** → dealers are net long gamma → they SELL into rallies, BUY into dips → market is **stabilizing**
- **Negative net GEX** → dealers are net short gamma → they BUY into rallies, SELL into dips → market is **destabilizing** (gamma squeeze fuel)

#### Convention B: Customer-net-long-everything

Assumes **dealers short both calls and puts** — appropriate during retail-driven rallies where customers buy both directionally:

```
gross_hedge_$ = Σ (OI_call × gamma_call) × S²
              + Σ (OI_put × gamma_put) × S²
```

Interpretation:
- This is the **maximum hedging pressure** assumption
- Always implies dealers buy on rallies, sell on dips
- Useful as an upper-bound estimate

For a single-name or thematic ETF rally driven by retail call-buying, Convention A's "net GEX" is the most defensible. For an index ETF, the same convention is standard.

### Reproducing the article's $4-5B per 1% claim

The article claimed dealers needed to buy approximately $4–5 billion per 1% upward move in the DRAM ETF. Working backwards:

```
gamma exposure per 1% = $4.5B  (midpoint)
                      = OI × gamma × S²  (summed over the chain)

If S ≈ $50 (June $45 calls deep ITM), S² ≈ 2,500
Total contract-gamma sum ≈ 4.5e9 / 2500 = 1.8e6
With 458,916 total contracts and weighted gamma ~0.04 → 458,916 × 0.04 ≈ 18,357

These don't quite reconcile — suggesting the article's figure includes a non-standard
multiplier, uses a different "1% basis" (e.g., per share rather than per spot %),
or assumes only the most concentrated strikes. Treat magnitude as illustrative,
not precise.
```

Lesson: when reproducing GEX figures from third parties, always check the convention. Dollar GEX numbers can differ by orders of magnitude depending on whether the author means per $1 move, per 1% move, per share, or per contract.

---

## 3. Convergence Timeline

Three time horizons matter — different mechanisms close the gap on each:

### Hours: AP creation/redemption arbitrage

The first-line mechanism. APs can correct an excess premium within minutes by creating new shares (sell premium-priced shares, buy underlying basket, deliver basket for new shares, pocket spread).

This breaks down when:

- The underlying market is **closed** (international ETF during US hours; weekend; holiday)
- The underlying basket is **illiquid** (APs can't source it cheaply)
- The issuer has **capped creation units** (rare; mostly seen in regulated commodity ETFs)
- Spread between bid/ask is widening (AP stepping back from market making)

Signal that AP arbitrage is impeded: the premium persists into the close, and bid/ask spread is wider than typical.

### Days: Options expiration & gamma decay

Even with AP arbitrage blocked, the gamma squeeze fuel decays as options approach expiration:

- Concentrated near-dated calls lose gamma rapidly in the final 1–2 weeks
- After expiration, dealer hedges unwind (sell stock back), creating downward pressure on the ETF — sometimes referred to as a "gamma cliff"
- IV typically compresses post-event, reducing future hedging requirements

Check: where is the dominant strike's expiration? If it's within 5 trading days, the squeeze has a natural fuse.

### Weeks: Flow normalization

If structural inflows are still pushing into the ETF after the squeeze peaks, the premium can stay elevated for weeks. Watch:

- Daily AUM change (proxy for net flows)
- Creation unit activity reported by the issuer
- Short interest in the ETF itself (sometimes shorts get squeezed alongside)

If flows normalize and APs catch up, the premium converges over 1–4 weeks even without an external catalyst.

---

## 4. Distinguishing a Real Gamma Squeeze from a Rally

| Indicator | Real squeeze | Routine rally |
|---|---|---|
| ETF move vs NAV proxy | ETF move >> NAV move (5pp+ excess) | Roughly aligned |
| ATM IV | Spiking — often 2x baseline | Stable or modestly higher |
| Call/Put OI ratio | > 2.5, often 3:1+ | Typically 1–1.5 |
| OI concentration | Single near-dated strike dominates | Diffuse across expirations |
| Net GEX (SqueezeMetrics) | Strongly negative | Mildly positive or near zero |
| Bid/ask spread | Wider than recent average | Stable |
| Underlying market session | Often closed | Open |

A move that hits 5+ of these markers is consistent with a gamma squeeze. A move that hits only 1–2 is more likely a fundamental repricing.

---

## 5. Worked example — DRAM ETF, May 8, 2026

Reproduced from the source article (Zhihu) for reference. Numbers are the article's claims, not verified.

| Item | Value |
|---|---|
| ETF return (intraday + after-hours) | +13.4% |
| Estimated NAV return (Micron 20% / SK Hynix 27% / Samsung 22%, weighted) | +7–8% |
| **Excess premium** | **+5–6 pp** |
| ATM IV | 78 |
| Call/Put OI ratio | 3.1 : 1 |
| Total OI across 12 expirations | 458,916 contracts |
| Concentrated strike | June $45 calls (deep ITM) |
| Estimated dealer $ buying per 1% | $4–5 B |
| Implied dealer share of day's buying | ~35% |
| Convergence outlook | AP blocked (KRX closed); ~3–5 trading days for gamma neutrality; flows still high |

Read this as: roughly half of the move was structural (gamma + AP impedance), and the squeeze had a 1-week fuse via June expirations.

---

## 6. Caveats

- **GEX is sensitive to dealer-positioning assumptions.** Always state the convention. A net-GEX number with a flipped sign convention is worse than no number at all.
- **NAV proxy ≠ official NAV.** End-of-day NAV is calculated by the fund administrator using closing prices in the home market plus FX adjustments. The holdings-weighted estimate is a directional proxy.
- **The dealer-share-of-volume figure is an upper bound.** It assumes every gamma-related share was hedged on the day; in practice hedging spreads over multiple sessions.
- **Implied volatility from yfinance is the option's quoted IV, not a fitted volatility surface.** It's adequate for GEX estimation but not for precise pricing.
- **This skill is descriptive, not predictive.** Quantifying that "35% of buying was dealer hedging today" does not tell you what tomorrow's flows will be.

---

## 7. Reference Python implementations

Load these into the execution environment when running Sub-Skill E. All four functions assume `yfinance`, `pandas`, and `numpy` are importable (Sub-Skill E's Step 1 ensures this).

### `decompose_etf_move` — E1

```python
import yfinance as yf
import pandas as pd
import numpy as np

def decompose_etf_move(ticker_symbol, holdings_weights=None, window="2d"):
    """
    Decompose the most recent daily ETF move into NAV-driven vs excess premium.

    holdings_weights: dict like {"MU": 0.20, "005930.KS": 0.22, ...}
                      If None, attempts yfinance funds_data; falls back to user-supplied weights.
    """
    etf = yf.Ticker(ticker_symbol)
    etf_hist = etf.history(period=window, auto_adjust=False)
    if len(etf_hist) < 2:
        return {"error": "Not enough history"}
    etf_return_pct = (etf_hist["Close"].iloc[-1] / etf_hist["Close"].iloc[-2] - 1) * 100

    if holdings_weights is None:
        try:
            top = etf.funds_data.top_holdings
            holdings_weights = dict(zip(top.index, top["Holding Percent"]))
        except Exception:
            holdings_weights = {}

    if not holdings_weights:
        return {
            "error": "Holdings weights unavailable — supply manually via holdings_weights={...}",
            "etf_return_pct": round(etf_return_pct, 4),
        }

    weighted_return = 0.0
    coverage = 0.0
    holding_returns = {}
    for sym, w in holdings_weights.items():
        try:
            h = yf.Ticker(sym).history(period=window, auto_adjust=False)
            if len(h) >= 2:
                r = (h["Close"].iloc[-1] / h["Close"].iloc[-2] - 1) * 100
                holding_returns[sym] = round(r, 4)
                weighted_return += w * r
                coverage += w
        except Exception:
            pass

    nav_return_proxy = weighted_return / coverage if coverage > 0 else None
    excess = etf_return_pct - nav_return_proxy if nav_return_proxy is not None else None

    return {
        "ticker": ticker_symbol,
        "etf_return_pct": round(etf_return_pct, 4),
        "nav_return_proxy_pct": round(nav_return_proxy, 4) if nav_return_proxy else None,
        "excess_premium_pct": round(excess, 4) if excess else None,
        "holdings_coverage_pct": round(coverage * 100, 2),
        "holding_returns": holding_returns,
    }
```

### `compute_gex` — E2

```python
from datetime import datetime, timezone
from math import log, sqrt, exp, pi

def _norm_pdf(x):
    return exp(-0.5 * x * x) / sqrt(2 * pi)

def _bsm_gamma(S, K, T, r, sigma):
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        return 0.0
    d1 = (log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrt(T))
    return _norm_pdf(d1) / (S * sigma * sqrt(T))

def compute_gex(ticker_symbol, risk_free_rate=0.045, max_expirations=8):
    """Compute net (SqueezeMetrics) and gross dealer gamma exposure per 1% spot move."""
    t = yf.Ticker(ticker_symbol)
    info = t.info
    spot = info.get("regularMarketPrice") or info.get("previousClose")
    if not spot:
        return {"error": "No spot price"}
    expirations = t.options[:max_expirations]
    if not expirations:
        return {"error": "No options chain"}

    now = datetime.now(timezone.utc)
    rows = []
    for exp_str in expirations:
        try:
            chain = t.option_chain(exp_str)
        except Exception:
            continue
        exp_date = datetime.strptime(exp_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        T = max((exp_date - now).total_seconds() / (365.25 * 86400), 1e-6)
        for side, df in [("call", chain.calls), ("put", chain.puts)]:
            for _, row in df.iterrows():
                K = row.get("strike")
                iv = row.get("impliedVolatility")
                oi = row.get("openInterest", 0) or 0
                if not K or not iv or oi <= 0:
                    continue
                gamma = _bsm_gamma(spot, K, T, risk_free_rate, iv)
                rows.append({
                    "expiration": exp_str, "side": side, "strike": K,
                    "iv": iv, "oi": oi, "gamma": gamma,
                    "gamma_$_per_1pct": oi * gamma * spot * spot,
                })

    if not rows:
        return {"error": "No usable contracts"}

    df = pd.DataFrame(rows)
    call_gex = df[df["side"] == "call"]["gamma_$_per_1pct"].sum()
    put_gex = df[df["side"] == "put"]["gamma_$_per_1pct"].sum()

    top = (df.groupby(["expiration", "strike", "side"])["gamma_$_per_1pct"]
             .sum().sort_values(ascending=False).head(10).reset_index())

    call_oi = df[df["side"] == "call"]["oi"].sum()
    put_oi = df[df["side"] == "put"]["oi"].sum()
    cp_ratio = call_oi / put_oi if put_oi > 0 else None

    df["moneyness"] = abs(df["strike"] / spot - 1)
    near_atm = df.sort_values("moneyness").head(20)
    atm_iv_pct = near_atm["iv"].median() * 100 if len(near_atm) else None

    return {
        "ticker": ticker_symbol, "spot": spot,
        "call_gex_per_1pct_$": call_gex, "put_gex_per_1pct_$": put_gex,
        "net_gex_squeezemetrics_$": call_gex - put_gex,
        "gross_hedge_pressure_$": call_gex + put_gex,
        "total_call_oi": int(call_oi), "total_put_oi": int(put_oi),
        "call_put_oi_ratio": round(cp_ratio, 2) if cp_ratio else None,
        "atm_iv_pct": round(atm_iv_pct, 2) if atm_iv_pct else None,
        "expirations_analyzed": len(expirations),
        "top_concentrations": top,
    }
```

### `estimate_dealer_share_of_volume` — E3

```python
def estimate_dealer_share_of_volume(ticker_symbol, gex_per_1pct_dollars, etf_return_pct):
    """Implied dealer-driven $ buying = |GEX| * |return%|; compare to actual $ volume."""
    hist = yf.Ticker(ticker_symbol).history(period="2d", auto_adjust=False)
    if hist.empty:
        return None
    today = hist.iloc[-1]
    actual_dollar_volume = today["Close"] * today["Volume"]
    implied = abs(gex_per_1pct_dollars) * abs(etf_return_pct)
    share = implied / actual_dollar_volume if actual_dollar_volume > 0 else None
    return {
        "actual_dollar_volume_$": round(actual_dollar_volume, 0),
        "implied_dealer_buying_$": round(implied, 0),
        "dealer_share_of_volume_pct": round(share * 100, 2) if share else None,
    }
```

### `assess_convergence` — E4

```python
def assess_convergence(ticker_symbol, top_concentrations_df):
    """Qualitative convergence signals across hours/days/weeks horizons."""
    info = yf.Ticker(ticker_symbol).info

    is_us = "us_market" in (info.get("market") or "").lower()
    ap_note = (
        "US-listed underlying — AP arbitrage active during US hours"
        if is_us
        else "International — AP arbitrage may be blocked while underlying market is closed"
    )

    if not top_concentrations_df.empty:
        next_exp = top_concentrations_df.iloc[0]["expiration"]
        days_to_exp = (datetime.strptime(next_exp, "%Y-%m-%d") - datetime.now()).days
        exp_note = f"Largest gamma concentration expires in {days_to_exp} days ({next_exp})"
    else:
        exp_note = "No clear strike concentration"

    aum = info.get("totalAssets")
    aum_note = f"Total AUM: ${aum/1e9:.2f}B" if aum else "AUM unavailable"

    return {"ap_arbitrage": ap_note, "options_window": exp_note, "flows": aum_note}
```
