# SQL table onboarding worksheet

Use one worksheet per SQL table. Fill in **Your entry** for the `Table` rows first.
Then use one `Column` row per physical column in your schema (add or remove rows as needed).
For each, enter the SQL name, type, meaning, unit if applicable, and a sample value you are permitted to share.
The HKEX column examples all come from [one actual observation](../data/hkex/hkex-short-selling.csv): CKH HOLDINGS on 24 August 2026.

| Level | Property or SQL column | Definition or rule | HKEX example | Your entry |
| --- | --- | --- | --- | --- |
| Table | SQL relation | Schema-qualified name | `public.insightful_hkex_short_selling` | ___ |
| Table | Catalog ID | Stable identifier used by the agent | `hkex_short_selling` | ___ |
| Table | Purpose | What this table measures | Daily short-selling turnover, not outstanding short interest | ___ |
| Table | Row meaning | What one record represents | One stock on one HKEX trading day | ___ |
| Table | Primary key | Columns that uniquely identify a record | `(trading_date, stock_code)` | ___ |
| Table | Source | Publisher and feed | HKEX daily quotations | ___ |
| Table | Freshness | Update schedule and meaning of “latest” | Historical extract; latest is `max(trading_date)`, not today | ___ |
| Table | Calculation | Formula and aggregation limits | Short turnover % = `100 * sum(short_selling_value) / nullif(sum(total_turnover), 0)` within one currency | ___ |
| Table | Missing data | How to interpret an absent observation | No row does not imply zero short sales | ___ |
| Table | Access | Intended workspaces; record any vendor restrictions | HKEX Short-Selling Research and HK Equities Analyst | ___ |
| Table | Check question | A question with a known answer | How many shares of CKH HOLDINGS were sold short on 24 August 2026? **1,380,000 shares.** | ___ |
| Table | Check SQL | Read-only query to verify that answer | `SELECT short_selling_shares FROM public.insightful_hkex_short_selling WHERE trading_date = DATE '2026-08-24' AND stock_code = '00001';` | ___ |
| Column | `board` | `text`: listing board, either Main Board or GEM | `Main Board` | ___ |
| Column | `trading_date` | `date`: HKEX trading day | `2026-08-24` | ___ |
| Column | `stock_code` | `text`: five-character stock identifier; preserve leading zeros | `00001` | ___ |
| Column | `stock_name` | `text`: HKEX short stock name | `CKH HOLDINGS` | ___ |
| Column | `short_selling_shares` | `bigint`: number of shares sold short that day | `1380000` | ___ |
| Column | `short_selling_value` | `numeric`: value of short sales in `trading_currency` | `96529425` | ___ |
| Column | `total_traded_shares` | `bigint`: total shares traded that day | `7086070` | ___ |
| Column | `total_turnover` | `numeric`: total traded value in `trading_currency` | `495980673` | ___ |
| Column | `trading_currency` | `text`: currency of monetary values; do not sum across currencies | `HKD` | ___ |
| Column | `source_url` | `text`: source quotation page for the record | [HKEX daily quotation, 24 Aug 2026](https://www.hkex.com.hk/eng/stat/smstat/dayquot/d260824e.htm) | ___ |

This worksheet documents the table; it does not load data or grant access.
Use it to prepare the [catalog entry](../src/lib/server/table-catalog.ts) and verify the agent’s answer against the check SQL.
