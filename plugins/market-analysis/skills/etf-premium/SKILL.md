---
name: etf-premium
description: >
  Calculate ETF premium/discount vs NAV via Yahoo Finance, and decompose single-day surges
  into NAV-driven vs structural components (gamma squeeze, dealer hedging, blocked AP arbitrage).
  Use whenever the user asks about an ETF's premium or discount, NAV comparison, why an ETF
  diverged from its holdings, or how much of a move is dealer-hedging-driven.
  Triggers: "ETF premium", "ETF discount", "NAV premium", "is SPY at a premium", "BITO premium",
  "IBIT premium", "bond ETF discount", "trading above/below NAV", "ETF premium screener",
  "biggest discount", "compare ETF NAV", "ETF arbitrage", "ETF gamma squeeze",
  "ETF premium surge", "decompose ETF move", "dealer gamma exposure", "GEX for ETF",
  "why did this ETF jump", "premium convergence", "AP arbitrage blocked", or any request
  about the gap between an ETF's price and underlying value. Especially relevant for
  leveraged, inverse, international, bond, commodity, and crypto ETFs.
---

# ETF Premium/Discount Analysis Skill

Calculates the premium or discount of an ETF's market price relative to its Net Asset Value (NAV) using data from Yahoo Finance via [yfinance](https://github.com/ranaroussi/yfinance).

**Why this matters:** An ETF's market price can diverge from the value of its underlying holdings (NAV). When you buy at a premium, you're overpaying relative to the assets; at a discount, you're getting a bargain. This divergence is typically small for liquid US equity ETFs but can be significant for bond ETFs, international ETFs, leveraged/inverse products, and crypto ETFs — especially during periods of market stress.

**Important**: For research and educational purposes only. Not financial advice. yfinance is not affiliated with Yahoo, Inc.

---

## Step 1: Ensure Dependencies Are Available

**Current environment status:**

```
!`python3 -c "import yfinance, pandas, numpy; print(f'yfinance={yfinance.__version__} pandas={pandas.__version__} numpy={numpy.__version__}')" 2>/dev/null || echo "DEPS_MISSING"`
```

If `DEPS_MISSING`, install required packages:

```python
import subprocess, sys
subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "yfinance", "pandas", "numpy"])
```

If already installed, skip and proceed.

---

## Step 2: Route to the Correct Sub-Skill

Classify the user's request and jump to the matching section. If the user asks a general question about an ETF's premium or discount without specifying a particular analysis type, default to **Sub-Skill A** (Single ETF Snapshot).

| User Request | Route To | Examples |
|---|---|---|
| Single ETF premium/discount | **Sub-Skill A: Single ETF Snapshot** | "is SPY at a premium?", "AGG premium to NAV", "BITO premium" |
| Compare multiple ETFs | **Sub-Skill B: Multi-ETF Comparison** | "compare bond ETF discounts", "which has bigger premium IBIT or BITO", "rank these ETFs by premium" |
| Screener / find extreme premiums | **Sub-Skill C: Premium Screener** | "which ETFs have biggest discount", "find ETFs trading below NAV", "premium screener" |
| Deep analysis with context | **Sub-Skill D: Premium Deep Dive** | "why is HYG at a discount", "is ARKK premium normal", "ETF premium analysis with context" |
| Sudden premium surge / gamma squeeze | **Sub-Skill E: Premium Surge Decomposition** | "why did KWEB jump 13% today", "is this ETF rally driven by gamma", "decompose today's ETF move", "dealer GEX for SOXL", "how long until the premium converges" |

### Defaults

| Parameter | Default |
|---|---|
| Data source | yfinance `navPrice` field |
| Price field | `regularMarketPrice` (falls back to `previousClose`) |
| Screener universe | Common ETF list by category (see Sub-Skill C) |

---

## Sub-Skill A: Single ETF Snapshot

**Goal**: Show the current premium/discount for one ETF with context about what's normal, plus a peer comparison to show how it stacks up against similar ETFs.

### A1: Fetch and compute

```python
import yfinance as yf

# Peer groups by Morningstar category. Full table in references/etf_premium_reference.md ("Tier 3: Peer Comparison Groups"); reproduce inline for self-contained execution.
CATEGORY_PEERS = {
    "Digital Assets": ["IBIT", "BITO", "FBTC", "ETHA", "ARKB", "GBTC"], "Intermediate Core Bond": ["AGG", "BND", "SCHZ"],
    "High Yield Bond": ["HYG", "JNK", "USHY"], "Long Government": ["TLT", "VGLT", "SPTL"],
    "Emerging Markets Bond": ["EMB", "VWOB", "PCY"], "Large Growth": ["QQQ", "VUG", "IWF", "SCHG"],
    "Large Blend": ["SPY", "VOO", "IVV", "VTI"], "Commodities Focused": ["GLD", "IAU", "SLV", "DBC"],
    "China Region": ["KWEB", "FXI", "MCHI"], "Trading--Leveraged Equity": ["TQQQ", "UPRO", "SOXL", "JNUG"],
    "Trading--Inverse Equity": ["SQQQ", "SPXU", "SOXS", "JDST"], "Derivative Income": ["JEPI", "JEPQ", "QYLD"],
    "Large Value": ["SCHD", "VYM", "DVY", "HDV"],
}

def etf_premium_snapshot(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info

    # Verify this is an ETF
    quote_type = info.get("quoteType", "")
    if quote_type != "ETF":
        return {"error": f"{ticker_symbol} is not an ETF (quoteType={quote_type})"}

    price = info.get("regularMarketPrice") or info.get("previousClose")
    nav = info.get("navPrice")

    if not price or not nav or nav <= 0:
        return {"error": f"NAV data not available for {ticker_symbol}"}

    premium_pct = (price - nav) / nav * 100
    premium_dollar = price - nav

    # Additional context
    result = {
        "ticker": ticker_symbol,
        "name": info.get("longName") or info.get("shortName", ""),
        "market_price": round(price, 4),
        "nav": round(nav, 4),
        "premium_discount_pct": round(premium_pct, 4),
        "premium_discount_dollar": round(premium_dollar, 4),
        "status": "PREMIUM" if premium_pct > 0 else "DISCOUNT" if premium_pct < 0 else "AT NAV",
        "category": info.get("category", "N/A"),
        "fund_family": info.get("fundFamily", "N/A"),
        "total_assets": info.get("totalAssets"),
        "net_expense_ratio": info.get("netExpenseRatio"),
        "avg_volume": info.get("averageVolume"),
        "bid": info.get("bid"),
        "ask": info.get("ask"),
        "yield_pct": info.get("yield"),
        "ytd_return": info.get("ytdReturn"),
    }

    # Bid-ask spread as context for whether the premium is meaningful
    bid = info.get("bid")
    ask = info.get("ask")
    if bid and ask and bid > 0:
        spread_pct = (ask - bid) / ((ask + bid) / 2) * 100
        result["bid_ask_spread_pct"] = round(spread_pct, 4)

    return result
```

### A2: Fetch peer comparison

After computing the target ETF's snapshot, look up its `category` and pull premium data for peers in the same category. This gives the user immediate context on whether the premium is ETF-specific or market-wide.

```python
def get_peer_premiums(target_ticker, target_category):
    """Fetch premium/discount for peers in the same category."""
    peers = CATEGORY_PEERS.get(target_category, [])
    # Remove the target itself from peers
    peers = [p for p in peers if p.upper() != target_ticker.upper()]
    if not peers:
        return []

    peer_data = []
    for sym in peers:
        try:
            t = yf.Ticker(sym)
            info = t.info
            p = info.get("regularMarketPrice") or info.get("previousClose")
            n = info.get("navPrice")
            if p and n and n > 0:
                prem = (p - n) / n * 100
                peer_data.append({
                    "ticker": sym,
                    "name": info.get("shortName", ""),
                    "price": round(p, 2),
                    "nav": round(n, 2),
                    "premium_pct": round(prem, 4),
                    "expense_ratio": info.get("netExpenseRatio"),
                })
        except Exception:
            pass
    return peer_data
```

Present the peer comparison as a small table after the main snapshot. This helps the user see whether the premium is unique to their ETF or shared across the category — for example, if all crypto ETFs are at ~1.5% premium, the user's ETF isn't an outlier.

### A3: Interpret the result

Use this framework to explain whether the premium/discount is meaningful:

| Premium/Discount | Interpretation |
|---|---|
| Within +/- 0.05% | Essentially at NAV — normal for large, liquid ETFs |
| +/- 0.05% to 0.25% | Minor deviation — common and usually not actionable |
| +/- 0.25% to 1.0% | Notable — worth mentioning. Check bid-ask spread and category |
| +/- 1.0% to 3.0% | Significant — common for less liquid, international, or specialty ETFs |
| Beyond +/- 3.0% | Large — may indicate stress, illiquidity, or structural issues |

**Context matters by category:**
- **US large-cap equity** (SPY, QQQ, IVV): premiums > 0.10% are unusual
- **Bond ETFs** (AGG, HYG, LQD, TLT): discounts of 0.5-2% happen during volatility
- **International/EM** (EEM, VWO, KWEB): time-zone mismatch causes regular 0.3-1% deviations
- **Leveraged/Inverse** (TQQQ, SQQQ, JNUG): 0.3-1.5% is normal due to daily reset mechanics
- **Crypto** (IBIT, BITO): 1-3% premiums are common, especially for newer funds
- **Commodity** (GLD, USO, UNG): depends on contango/backwardation in futures

Also compare the premium/discount to the **bid-ask spread**: if the premium is smaller than the spread, it's noise, not signal.

---

## Sub-Skill B: Multi-ETF Comparison

**Goal**: Compare premium/discount across multiple ETFs side by side.

### B1: Fetch and rank

```python
import yfinance as yf
import pandas as pd

def compare_etf_premiums(tickers):
    rows = []
    for sym in tickers:
        try:
            t = yf.Ticker(sym)
            info = t.info
            if info.get("quoteType") != "ETF":
                rows.append({"ticker": sym, "error": "Not an ETF"})
                continue
            price = info.get("regularMarketPrice") or info.get("previousClose")
            nav = info.get("navPrice")
            if price and nav and nav > 0:
                prem = (price - nav) / nav * 100
                bid = info.get("bid", 0)
                ask = info.get("ask", 0)
                spread = (ask - bid) / ((ask + bid) / 2) * 100 if bid and ask and bid > 0 else None
                rows.append({
                    "ticker": sym,
                    "name": info.get("shortName", ""),
                    "price": round(price, 2),
                    "nav": round(nav, 2),
                    "premium_pct": round(prem, 4),
                    "spread_pct": round(spread, 4) if spread else None,
                    "category": info.get("category", "N/A"),
                    "total_assets": info.get("totalAssets"),
                })
            else:
                rows.append({"ticker": sym, "error": "NAV unavailable"})
        except Exception as e:
            rows.append({"ticker": sym, "error": str(e)})

    df = pd.DataFrame(rows)
    if "premium_pct" in df.columns:
        df = df.sort_values("premium_pct", ascending=True)
    return df
```

### B2: Present as a ranked table

Sort by premium/discount (most discounted first). Highlight:
- Which ETFs are at the deepest discount
- Which are at the highest premium
- Whether the premium/discount exceeds the bid-ask spread (if it doesn't, it's market microstructure noise)

---

## Sub-Skill C: Premium Screener

**Goal**: Scan a universe of common ETFs to find those with the largest premiums or discounts.

### C1: Define the universe and scan

Use this default universe organized by category. The user can supply their own list instead.

```python
DEFAULT_ETF_UNIVERSE = {
    "US Equity": ["SPY", "QQQ", "IVV", "VOO", "VTI", "DIA", "IWM", "ARKK"],
    "Bond": ["AGG", "BND", "TLT", "HYG", "LQD", "VCIT", "VCSH", "BNDX", "EMB", "JNK", "MUB", "TIP"],
    "International": ["EFA", "EEM", "VWO", "IEMG", "KWEB", "FXI", "INDA", "VEA", "EWZ", "EWJ"],
    "Commodity": ["GLD", "SLV", "USO", "UNG", "DBC", "IAU", "PDBC", "GSG"],
    "Crypto": ["IBIT", "BITO", "FBTC", "ETHA", "ARKB", "GBTC"],
    "Leveraged/Inverse": ["TQQQ", "SQQQ", "SPXU", "UPRO", "JNUG", "JDST", "SOXL", "SOXS"],
    "Sector": ["XLF", "XLE", "XLK", "XLV", "XLI", "XLP", "XLU", "XLRE", "XLC", "XLB", "XLY"],
    "Sector - Semis/Tech": ["SOXX", "SMH", "IGV", "XSD"], "Sector - Healthcare": ["XBI", "IBB", "IHI"],
    "Thematic": ["ARKW", "ARKG", "HACK", "CLOU", "WCLD", "BUG", "BOTZ", "LIT", "ICLN", "TAN"],
    "Income": ["JEPI", "JEPQ", "SCHD", "VYM", "DVY", "DIVO", "HDV", "QYLD"],
}

import yfinance as yf
import pandas as pd

def screen_etf_premiums(universe=None, min_abs_premium=0.0):
    if universe is None:
        universe = DEFAULT_ETF_UNIVERSE

    all_tickers = []
    for category, tickers in universe.items():
        for sym in tickers:
            all_tickers.append((sym, category))

    rows = []
    for sym, category_label in all_tickers:
        try:
            t = yf.Ticker(sym)
            info = t.info
            price = info.get("regularMarketPrice") or info.get("previousClose")
            nav = info.get("navPrice")
            if price and nav and nav > 0:
                prem = (price - nav) / nav * 100
                if abs(prem) >= min_abs_premium:
                    rows.append({
                        "ticker": sym,
                        "name": info.get("shortName", ""),
                        "category": category_label,
                        "price": round(price, 2),
                        "nav": round(nav, 2),
                        "premium_pct": round(prem, 4),
                        "total_assets_B": round(info.get("totalAssets", 0) / 1e9, 2),
                        "expense_ratio": info.get("netExpenseRatio"),
                    })
        except Exception:
            pass

    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.sort_values("premium_pct", ascending=True)
    return df
```

### C2: Present the results

Show a ranked table sorted by premium (most discounted first). Group by category if the list is long. Call out:
- **Top 5 deepest discounts** — potential buying opportunities (or signs of stress)
- **Top 5 highest premiums** — overpaying risk
- **Category patterns** — are all bond ETFs at a discount? Are all crypto ETFs at a premium?

Note: this screener takes time because it fetches data one ticker at a time. For large universes (60+ ETFs), warn the user it may take 1-2 minutes.

---

## Sub-Skill D: Premium Deep Dive

**Goal**: Combine premium/discount data with additional context to help the user understand *why* the premium exists and whether it's likely to persist.

### D1: Gather comprehensive data

Run the Sub-Skill A snapshot, then add:

```python
import yfinance as yf
import numpy as np

def premium_deep_dive(ticker_symbol):
    ticker = yf.Ticker(ticker_symbol)
    info = ticker.info

    price = info.get("regularMarketPrice") or info.get("previousClose")
    nav = info.get("navPrice")
    if not price or not nav or nav <= 0:
        return {"error": "NAV data not available"}

    premium_pct = (price - nav) / nav * 100

    # Historical price data for volatility context
    hist = ticker.history(period="3mo")
    if not hist.empty:
        returns = hist["Close"].pct_change().dropna()
        daily_vol = returns.std()
        annualized_vol = daily_vol * np.sqrt(252)
        avg_volume = hist["Volume"].mean()
        dollar_volume = (hist["Close"] * hist["Volume"]).mean()

        # Price range context
        high_3m = hist["Close"].max()
        low_3m = hist["Close"].min()
        pct_from_high = (price - high_3m) / high_3m * 100
    else:
        daily_vol = annualized_vol = avg_volume = dollar_volume = None
        high_3m = low_3m = pct_from_high = None

    result = {
        "ticker": ticker_symbol,
        "name": info.get("longName", ""),
        "price": round(price, 4),
        "nav": round(nav, 4),
        "premium_pct": round(premium_pct, 4),
        "category": info.get("category", "N/A"),
        "fund_family": info.get("fundFamily", "N/A"),
        "total_assets": info.get("totalAssets"),
        "expense_ratio": info.get("netExpenseRatio"),
        "yield_pct": info.get("yield"),
        "ytd_return": info.get("ytdReturn"),
        "beta_3y": info.get("beta3Year"),
        "annualized_vol": round(annualized_vol * 100, 2) if annualized_vol else None,
        "avg_daily_dollar_volume": round(dollar_volume, 0) if dollar_volume else None,
        "pct_from_3m_high": round(pct_from_high, 2) if pct_from_high else None,
    }

    # Bid-ask spread
    bid = info.get("bid")
    ask = info.get("ask")
    if bid and ask and bid > 0:
        spread_pct = (ask - bid) / ((ask + bid) / 2) * 100
        result["bid_ask_spread_pct"] = round(spread_pct, 4)
        result["premium_exceeds_spread"] = abs(premium_pct) > spread_pct

    return result
```

### D2: Explain the *why*

After gathering data, attribute the premium/discount using `references/etf_premium_reference.md` ("Why the Mechanism Can Fail" table) which maps causes (closed underlying market, illiquid basket, stress, regulatory limits, futures contango, daily leverage reset, retail demand surge) to ETF types affected.

**Persistence rules of thumb**: liquid US equity → minutes (arbitrage corrects); bond ETFs in stress → days or weeks; crypto → narrows as APs mature; international → resets when home market opens.

---

## Sub-Skill E: Premium Surge Decomposition (Gamma Squeeze Analysis)

**Goal**: When an ETF moves much more than its underlying basket in a single session, decompose the move into (1) a NAV-driven component and (2) an "excess premium" driven by structural forces — usually options dealer gamma hedging, blocked AP arbitrage, or sentiment. Then assess how long the premium will take to converge.

**When to use**: User reports an ETF moving 5%+ in a session, asks why an ETF diverged from its named underlyings, suspects a gamma squeeze, or asks whether dealer hedging amplified a move.

**Read first**: `references/gamma_squeeze_reference.md` covers the full GEX formula derivation, dealer-positioning conventions, the convergence framework, a worked example, and the **reference Python implementations of all four functions used below** (`decompose_etf_move`, `compute_gex`, `estimate_dealer_share_of_volume`, `assess_convergence`). Load the code from there before running E1–E4.

### E1: Decompose today's move into NAV-driven vs excess premium

The static `navPrice` only reflects the most recent end-of-day NAV. To attribute *today's* move, estimate NAV return from the holdings' returns: `NAV_return ≈ Σ (weight_i × return_i) / Σ weight_i`.

Run `decompose_etf_move(ticker, holdings_weights=None)` from the reference. It auto-fetches holdings via `yfinance.funds_data` when available; user-supplied weights work for ETFs where it isn't (most international funds). Output: `etf_return_pct`, `nav_return_proxy_pct`, `excess_premium_pct`.

**Caveat**: For ETFs with foreign holdings during a closed session (e.g., Asian holdings during US hours), substitute ADRs or futures for the underlying prices, or flag the proxy as stale.

### E2: Compute dealer gamma exposure (GEX) from the options chain

GEX measures how much hedging dealers must do per 1% move in the underlying. Run `compute_gex(ticker, risk_free_rate=0.045)` from the reference. It returns:

- `net_gex_squeezemetrics_$` per 1% — signed; negative = destabilizing (dealers buy rallies)
- `gross_hedge_pressure_$` — upper-bound under the customer-net-long convention
- `call_put_oi_ratio`, `atm_iv_pct`, and a top-10 concentration table by strike/expiration

Interpret:

- **Net GEX strongly negative** → dealers short gamma; rallies amplified. Classic squeeze fuel.
- **Concentration on a single near-dated strike** → squeeze is fragile and has a fuse at that expiration.
- **ATM IV well above category baseline** → time decay alone will provide some convergence pressure over days.
- **Call/Put OI ratio > 2.5** → call-heavy positioning consistent with a bullish squeeze.

### E3: Compare dealer hedging to actual volume

Run `estimate_dealer_share_of_volume(ticker, gex_per_1pct_dollars, etf_return_pct)` from the reference. The implied dealer $ buying for the day is `|GEX| × |return%|`; comparing it to actual dollar volume gives the dealer share of buying pressure.

This is an upper bound — it assumes uniform dealer positioning and that all gamma was hedged in a single session. Treat as a heuristic and always state the assumptions.

### E4: Assess premium convergence timeline

Three time horizons, different mechanisms:

| Time scale | Mechanism | What to check |
|---|---|---|
| **Hours** | AP creation/redemption arbitrage | Is the underlying market open? Is bid/ask widening (AP stepping back)? Are creation units capped? |
| **Days** | Options expiration / gamma decay | When does the dominant strike expire? Is OI rolling forward or closing? Is IV compressing? |
| **Weeks** | Net flow normalization | AUM change — is demand still exceeding creation capacity? Is short interest building? |

Run `assess_convergence(ticker, top_concentrations_df)` from the reference for a structured summary that reads each mechanism's current state.

### E5: Present the decomposition

Order the output:

1. **Headline**: today's ETF move, NAV-proxy move, excess premium (pp).
2. **Decomposition table**: NAV-driven / excess premium / total.
3. **Dealer hedging**: net GEX, implied dealer $ buying vs actual $ volume, dealer share of buying pressure.
4. **Risk indicators**: ATM IV, call/put OI ratio, top-3 strike/expiration concentrations.
5. **Convergence outlook**: hours / days / weeks, each with current state.
6. **Caveats**: GEX assumes uniform dealer positioning; NAV proxy is stale when underlying market is closed; this is descriptive, not a price forecast.

---

## Step 3: Respond to the User

### Always include
- The **ETF name and ticker**
- **Market price** and **NAV** with the calculation shown
- **Premium/discount percentage** clearly labeled
- **Context**: is this deviation normal for this ETF category?

### Always caveat
- NAV data from Yahoo Finance reflects the **most recent official NAV** (typically end of prior trading day) — it is not real-time
- Market price may have a **15-minute delay** depending on the exchange
- Premium/discount can change rapidly during market hours — this is a snapshot, not a live feed
- Small premiums/discounts (< bid-ask spread) are **market microstructure noise**, not real mispricing
- **Never recommend buying or selling** based on premium/discount alone — present the data and let the user decide

### Formatting
- Use markdown tables for multi-ETF comparisons
- Show the formula: `Premium/Discount = (Market Price - NAV) / NAV x 100`
- Use color indicators in text: "trading at a **0.45% discount**" or "at a **1.2% premium**"
- Round percentages to 2-4 decimal places depending on magnitude

---

## Reference Files

- `references/etf_premium_reference.md` — Detailed formulas, category-specific benchmarks, common ETF universe list, and background on the creation/redemption mechanism that drives premiums
- `references/gamma_squeeze_reference.md` — Premium decomposition framework, Black-Scholes gamma + GEX formulas with both SqueezeMetrics and customer-net-long conventions, convergence-timeline framework (hours/days/weeks), gamma-squeeze vs routine-rally diagnostic table, and a worked example. Read this **before** running Sub-Skill E.

Read the reference files for deeper technical detail on ETF premium/discount mechanics, historical context, and the gamma-squeeze decomposition methodology.
