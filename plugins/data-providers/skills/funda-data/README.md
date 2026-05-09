# Funda Data

Run analyst-grade fundamental-research questions against the [Funda AI](https://funda.ai) agent via its [Model Context Protocol](https://modelcontextprotocol.io/) server at `https://funda.ai/api/mcp`.

This skill is a thin guide around a single MCP tool, `agent_chat`, which executes a research question through Funda's agent (~170 specialized research skills + a structured-data layer covering filings, transcripts, estimates, ownership flow, options structure, sentiment, and prediction markets) and returns a synthesized, citation-grounded answer.

## Triggers

- Earnings previews and recaps, beat/miss decomposition
- Analyst estimate-revision trends
- SEC filing summaries (10-K, 10-Q, 8-K, S-1, proxies)
- Earnings call transcript digestion
- Company primers, competitive positioning, supply-chain mapping
- Sector deep-dives (semis, pharma, banks, retail, energy, mining, housing, consumer)
- DCF and comps modelling against caller-supplied assumptions
- Capital-allocation review
- Macro framing (Fed stance, cycle position, Dalio quadrant, sector rotation)
- Structural market data passthrough (ownership flow, options structure, news, sentiment, prediction markets, congressional trades)
- Any mention of "funda", "funda.ai", or "funda agent"

## Out of Scope

The Funda agent will refuse and should not be asked for:

- Real-time / intraday quotes, live market data
- Buy / sell / hold recommendations, conviction calls, price targets
- Personalized investment advice, portfolio allocation, position sizing
- Tax / legal / regulatory advice
- Trade execution

For real-time prices use `yfinance-data`. For aggregated social sentiment use `finance-sentiment`. For trading-strategy frameworks use `sepa-strategy`.

## Platform

**CLI only** — requires Claude Code (or another MCP-aware client) so the `claude mcp add` setup works.

## Setup

> **Paid service** — A [Funda AI](https://funda.ai) subscription is required. The MCP server returns 403 `subscription_required` for unsubscribed users.

1. Register the Funda MCP with Claude Code:
   ```bash
   claude mcp add --transport http funda https://funda.ai/api/mcp
   ```
2. A browser tab opens to `https://funda.ai/oauth/authorize`. Approve.
3. Restart your Claude Code session so the tool registers.

The OAuth access token lasts 1 hour and auto-refreshes via a 30-day refresh token. You won't see another consent screen unless you sign out or revoke access.

To remove later: `claude mcp remove funda`.

## Reference Files

| File | Description |
|---|---|
| `references/research-topics.md` | Categorized example questions, what Funda excels at vs declines, and tips for framing multi-step research |

## How It Works

The MCP exposes a single tool, `mcp__funda__agent_chat`, with one parameter: `question` (string, 1–4000 chars). Each call is a fresh research turn with no cross-call memory — bake the ticker, time horizon, and assumptions into the question itself.

Typical run is 15–60 seconds; the server streams progress notifications during the run so the client doesn't time out.

The response is text prefixed with a Funda disclaimer, plus metadata containing `funda.io/conversation_id` (a UUID for the in-app history page at `https://funda.ai/agent-chat/<id>`) and `funda.io/timed_out` (true if the agent hit its run budget).
