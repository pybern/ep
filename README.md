# Insightful — Text to Insight

Ask a question in plain English and get back a visual answer: a headline, KPI cards with sparklines, charts, key findings, the underlying data and sources.

Five curated analysis use cases use a deterministic engine and real statistics, without LLM calls. **HKEX Short-Selling Research** and **HK Equities Analyst** use the database research agent (AI SDK) with your saved model and PostgreSQL connections.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md). In short: `npm install`, make a small focused change, then run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` before opening a PR.

## Features

- **Seven use cases** with a persona, a scenario and curated questions:
  - HKEX Short-Selling Research (the default; public, read-only research agent)
  - HK Equities Analyst (research agent scoped to the HK datasets and HKEX short selling)
  - Macro Economist
  - Climate Analyst
  - EV Market Strategist
  - Equity Research: Big Tech
  - Open Exploration
- **Nine analysis types:**
  - Trend
  - Ranking
  - Share or breakdown
  - Comparison (time series rebased to 100, or cross-sectional radar charts)
  - Correlation, including lead/lag detection
  - Forecast: linear, exponential or logistic, picked by R², with a 90% interval
  - Anomaly detection with z-scores and event annotations
  - Growth (CAGR)
  - Company snapshot
- **Chart types:** line, area, bar, horizontal bar, stacked bar, donut, composed (forecast band), scatter with regression line, radar, treemap and radial.
- **Workspace:**
  - Autocomplete in the ask bar
  - Suggestion chips and follow-up questions
  - An HKEX market strip
  - CSV export and shareable links (`/?uc=hk&q=...` runs the question automatically)
  - History kept in localStorage
- **Dashboard:** pin any answer to build a board.
- **Data catalog:** every dataset with its metrics, a preview chart, sample rows and its source.
- **API:** `POST /api/insight` with `{ "question": "...", "useCaseId": "hk" }`, or `GET /api/insight?q=...&uc=hk`.

## Research workspaces

**HKEX Short-Selling Research** and **HK Equities Analyst** answer questions from your own PostgreSQL data:

- **Streaming answers** with a headline, KPI cards, key findings, charts and the underlying data with sources.
- **Figures you can trust:** insight cards and charts are calculated from the returned rows, never from model-written numbers. Missing data is never shown as zero and currencies are never added together.
- **View SQL** shows the queries and parameters behind an answer, without running anything again.
- **Explain these results** adds an optional, on-request explanation of an answer.
- **Export PDF** saves the whole conversation, including charts, complete data tables, sources and SQL.
- **Transparent by default:** thinking and tool activity can be expanded, and failures are explained in plain language with optional error details.
- **Read-only:** the agent never seeds, migrates or modifies your database.

These two workspaces send each question to your configured AI provider, which can incur charges. The curated use cases make no model calls.

## Data sources

| Dataset | Source |
| --- | --- |
| Hang Seng indices, 20 HK blue chips (prices, valuations, dividends, financials) | Yahoo Finance snapshot (`src/lib/data/hk-snapshot.json`) |
| US unemployment, CPI, fed funds, GDP growth 2010–2024 | BLS, BEA, Federal Reserve |
| GDP, population and GDP per capita of the 20 largest economies | World Bank (2023) |
| CO₂ concentration and temperature anomaly | NOAA, NASA GISS |
| Top CO₂ emitters | Global Carbon Project (2022) |
| Electricity mix, solar and wind share | Ember |
| Global and regional EV sales | IEA Global EV Outlook |
| Magnificent 7 revenue, net income and margin | 10-K filings, FY2021–24 |
| HKEX daily short selling, Main Board and GEM (24 August – 20 October 2026) | HKEX daily quotation reports (`data/hkex/`) |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

The curated use cases need no setup. For the two research workspaces, set `CONFIG_ADMIN_TOKEN`, open **Configuration** (`/config`), save an OpenAI-compatible model and a PostgreSQL connection, then choose **Initialize database**. Connections can also be supplied through `.env.local` (copy `.env.example`). See [Connection configuration](./TECHNICAL_SPEC.md#connection-configuration) for details.

## Documentation

- [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) — architecture, configuration, the research agent, data pipelines and deployment
- [CONTRIBUTING.md](./CONTRIBUTING.md) — setup, checks and guidelines for pull requests
- [Table onboarding worksheet](./docs/data-onboarding-template.md) — document a new SQL table for the research agent
