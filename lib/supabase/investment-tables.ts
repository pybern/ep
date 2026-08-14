export const INVESTMENT_TABLE_NAMES = [
  "investment_datasets",
  "investment_entities",
  "trading_venues",
  "instruments",
  "instrument_listings",
  "market_prices_daily",
  "fx_rates_daily",
  "yield_curve_points",
  "macro_observations",
  "funds",
  "portfolios",
  "portfolio_holdings",
  "investment_transactions",
  "benchmark_constituents",
  "portfolio_performance",
  "portfolio_risk_metrics",
  "esg_scores",
  "corporate_actions",
  "latest_market_prices",
  "current_portfolio_holdings",
  "portfolio_exposure_by_asset_class",
  "fund_performance_summary",
] as const

export const INVESTMENT_TABLES: ReadonlySet<string> = new Set(
  INVESTMENT_TABLE_NAMES,
)
