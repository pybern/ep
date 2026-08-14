# Investment datasets

The Supabase database includes four public, deterministic synthetic subject
areas for development, demonstrations, and text-to-SQL evaluation.

These datasets are not licensed market data and must not be used for trading,
valuation, client reporting, regulatory reporting, or investment decisions.

## Subject areas

- `global-market-reference`: security masters, venues, listings, daily OHLCV,
  FX rates, benchmark constituents, and corporate actions.
- `global-macro-rates`: sovereign curves and monthly economic observations.
- `multi-asset-management`: funds, portfolios, point-in-time holdings,
  transactions, performance, and risk.
- `responsible-investing`: issuer ESG, carbon-intensity, controversy, and data
  quality measures.

The `investment_datasets` registry records provenance, coverage, frequency,
licensing, semantic notes, visibility, and whether a subject area is synthetic.
Every fact table carries `dataset_id` for lineage and access control.

## Analytics views

- `latest_market_prices`
- `current_portfolio_holdings`
- `portfolio_exposure_by_asset_class`
- `fund_performance_summary`

The views use invoker security, so their underlying row-level security policies
continue to apply.

## Access model

Anonymous and authenticated clients can read only registry entries marked both
`visibility = 'public'` and `is_synthetic = true`, plus rows belonging to those
datasets. No client write policies are defined. Administrative writes therefore
require the Supabase service role or a direct migration connection.

This policy intentionally does not define private user or organization
ownership. Add an authenticated membership model before loading client,
portfolio, account, or licensed vendor data.

## Rebuild and verification

The schema is in
`supabase/migrations/202608130001_investment_datasets.sql`, and the idempotent
synthetic generator is in `supabase/seed.sql`.

For local development:

```bash
supabase start
supabase db reset
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/investment_datasets.sql
```

For a linked development project:

```bash
supabase db push --include-seed
supabase db lint --linked --level warning
```

Do not run the seed against a production database without reviewing its scoped
delete of the four known synthetic dataset slugs.

## Example questions

- What are the latest asset-class exposures for each portfolio?
- Which portfolios outperformed their benchmark over the last six months?
- How did USD and EUR sovereign curves change between two dates?
- Which holdings combine high portfolio weight with low ESG scores?
- What are the largest transaction flows by strategy and quarter?
- How much duration and value-at-risk does each fund carry?
