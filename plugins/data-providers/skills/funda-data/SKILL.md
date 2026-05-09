---
name: funda-data
description: >
  Run fundamental-research questions against the Funda AI agent via its
  MCP at https://funda.ai/api/mcp. Backed by ~170 research skills plus a
  structured-data layer (filings, transcripts, estimates, ownership,
  options structure). Use for earnings previews/recaps, beat-miss
  decomposition, estimate-revision trends, SEC filings (10-K/10-Q/8-K),
  transcript digestion, company primers, competitive positioning,
  supply-chain mapping, sector deep-dives (semis, pharma, banks, energy,
  mining), DCF/comps against given assumptions, macro framing (Fed
  stance, Dalio quadrant, sector rotation), and structural market data
  (ownership flow, options structure, sentiment, prediction markets,
  congressional trades). Triggers: "funda", "funda.ai", DCF, comps,
  earnings preview/recap, analyst estimates, sector deep-dive, 10-K,
  transcript, ownership flow, gamma exposure, company primer. REFUSES
  real-time quotes, buy/sell calls, price targets, personalized advice
  — route those to yfinance-data or finance-sentiment.
---

# Funda AI Research Agent (MCP)

Funda exposes a [Model Context Protocol](https://modelcontextprotocol.io/)
server at `https://funda.ai/api/mcp`. It surfaces a single tool,
`agent_chat`, which runs a research question through Funda's analyst-grade
agent and returns a synthesized, citation-grounded answer.

This is **not** a raw-data API — it's a research-question interface. Funda
declines real-time prices, recommendations, and price targets. Route those
elsewhere.

---

## Step 1: Verify the Funda MCP Is Connected

```
!`claude mcp list 2>/dev/null | grep -iE "^funda[[:space:]]" || echo "FUNDA_MCP_NOT_CONNECTED"`
```

Then act on the result:

- A line containing `funda` → the MCP is registered. The tool is callable as `mcp__funda__agent_chat`. Proceed to Step 2.
- `FUNDA_MCP_NOT_CONNECTED` → ask the user to install and authorize:
  ```bash
  claude mcp add --transport http funda https://funda.ai/api/mcp
  ```
  A browser tab opens for OAuth approval. The token lasts 1 hour and
  auto-refreshes via a 30-day refresh token — they only see the consent
  screen once. After approval the user must restart their Claude Code
  session (or open a new one) so the tool registers.

Funda is paid-only. If the user is not on an active subscription, the MCP
returns 403 with `subscription_required`. Direct them to https://funda.ai
to activate.

---

## Step 2: Frame the Question

`agent_chat` is a fresh research turn with **no cross-call memory**. Each
question must stand alone — bake the ticker, time horizon, and any
specific assumptions into the question text itself.

| User wants | Question shape |
|---|---|
| Earnings preview | "Preview MSFT's Q3 print Thursday — segment trends to watch, where consensus is aggressive/conservative, historical beat/miss pattern." |
| Earnings recap | "Walk through NVDA Q2: beat/miss by segment, guide vs consensus, transcript Q&A color on data-center demand." |
| Estimate revisions | "How have analyst estimates for AMZN's FY26 EPS shifted over the last 90 days, and what segments drove the revision?" |
| Sector deep dive | "Summarize the 2026 hyperscaler capex cycle — spending tiers by name, supplier exposure, gross-margin implications." |
| Supply chain | "Map TSMC's customer concentration and N2 ramp risks — name the top three exposures by revenue." |
| Filing summary | "Diff the new risk factors in PLTR's latest 10-K versus the prior year." |
| Transcript digestion | "Summarize the analyst Q&A from GOOGL's last earnings call — which themes drew the most pushback?" |
| DCF methodology | "Walk through a DCF for NVDA assuming 25% data-center growth, 10% terminal margin, 9% WACC — surface the sensitivity table." |
| Comps | "Build a comp set for SNOW — who belongs in it, what multiples apply, where does SNOW screen rich/cheap." |
| Macro framing | "Where in the Dalio long-term debt cycle is the US, and what does that imply for duration positioning?" |
| Competitive positioning | "Who actually competes with Palantir in federal civilian contracts, and how is the win rate trending?" |
| Ownership flow | "Has institutional ownership of CRWD shifted in the latest 13F filings — net buyers vs sellers?" |
| Options structure | "What does the gamma exposure profile and skew look like for SPY heading into Friday's close?" |

If the user gave only a ticker, ask one clarifying question to scope the
turn (preview? recap? primer? DCF?) before calling. A vague question burns
a turn and returns a vague answer.

For more example questions per topic, see `references/research-topics.md`.

---

## Step 3: Confirm It's In Scope

Funda's agent will decline these — don't waste a turn:

- Real-time / intraday quotes, live market data
- Buy / sell / hold calls, conviction recommendations, price targets
- Personalized investment advice, portfolio allocation, position sizing
- Tax, legal, or regulatory advice
- Trade execution

Route elsewhere when needed:

| User wants | Use this skill instead |
|---|---|
| Real-time price, intraday candles, options chain snapshot | `yfinance-data` |
| Aggregated cross-platform social sentiment scores | `finance-sentiment` |
| SEPA / Minervini trend-template screening | `sepa-strategy` |
| Strait of Hormuz / oil shipping risk | `hormuz-strait` |

---

## Step 4: Call the Tool

Invoke the MCP tool with the framed question:

```
mcp__funda__agent_chat(question: "<full research question>")
```

A typical run takes 15–60 seconds; the server streams progress
notifications throughout, so the client doesn't time out.

Response shape:
- `content[0].text` — answer text, prefixed with the Funda disclaimer
  (`[Funda research output — fundamental analysis, informational only…]`).
  Keep the prefix; do not strip it.
- `_meta["funda.io/conversation_id"]` — UUID for the in-app history page
  at `https://funda.ai/agent-chat/<id>`. Cite this so the user can inspect
  the agent's full timeline and tool calls.
- `_meta["funda.io/timed_out"]` — `true` if the agent hit its run budget
  before finishing. The answer is partial; offer to resubmit a more
  focused question.

---

## Step 5: Respond to the User

- Surface the agent's synthesis with structure (tables, bullets, headings) — don't dump the raw blob.
- Preserve the disclaimer; never repackage Funda's analysis as a recommendation, price target, or trade signal.
- Cite the conversation URL: `Full Funda research: https://funda.ai/agent-chat/{conversation_id}`.
- If `timed_out` is true, note the answer is partial and offer to retry with a tighter scope.
- For DCF / valuation work, surface the assumptions Funda used so the user can adjust them.
- Note the data source: "Research synthesized by the Funda AI agent."

---

## Reference Files

- `references/research-topics.md` — categorized example questions, what Funda excels at vs declines, and tips for framing multi-step research.
