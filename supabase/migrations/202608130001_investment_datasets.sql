-- Investment analytics foundation for Supabase/Postgres.
-- Raw values loaded by the companion seed are deterministic and synthetic.

create extension if not exists pgcrypto;

create table if not exists public.investment_datasets (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  description text not null,
  domain text not null check (domain in ('market_data', 'macro_rates', 'asset_management', 'responsible_investing')),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  is_synthetic boolean not null default true,
  source_name text not null,
  source_url text,
  license_name text not null,
  frequency text not null,
  coverage_start date,
  coverage_end date,
  semantic_notes jsonb not null default '{}'::jsonb check (jsonb_typeof(semantic_notes) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (coverage_end is null or coverage_start is null or coverage_end >= coverage_start),
  check (is_synthetic or visibility = 'private')
);

create table if not exists public.investment_entities (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  entity_code text not null,
  legal_name text not null,
  entity_type text not null check (entity_type in ('issuer', 'asset_manager', 'counterparty', 'index_provider', 'government')),
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  sector text,
  industry text,
  lei text,
  website text,
  created_at timestamptz not null default now(),
  unique (dataset_id, entity_code),
  unique (dataset_id, legal_name)
);

create table if not exists public.trading_venues (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  mic char(4) not null check (mic ~ '^[A-Z0-9]{4}$'),
  venue_name text not null,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  unique (dataset_id, mic)
);

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  issuer_entity_id uuid references public.investment_entities(id),
  instrument_code text not null,
  name text not null,
  instrument_type text not null check (instrument_type in ('equity', 'government_bond', 'corporate_bond', 'etf', 'cash', 'fx')),
  asset_class text not null check (asset_class in ('Equity', 'Fixed Income', 'Multi-Asset', 'Cash', 'Currency')),
  sub_asset_class text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  country_code char(2) check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region text not null,
  sector text,
  isin text,
  cusip text,
  sedol text,
  issue_date date,
  maturity_date date,
  coupon_rate numeric(9,6),
  coupon_frequency smallint,
  face_value numeric(20,4),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (dataset_id, instrument_code),
  check (maturity_date is null or issue_date is null or maturity_date > issue_date),
  check (coupon_rate is null or coupon_rate >= 0),
  check (face_value is null or face_value > 0)
);

create table if not exists public.instrument_listings (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  venue_id uuid not null references public.trading_venues(id),
  ticker text not null,
  listing_currency char(3) not null check (listing_currency ~ '^[A-Z]{3}$'),
  primary_listing boolean not null default false,
  lot_size numeric(20,6) not null default 1 check (lot_size > 0),
  unique (dataset_id, venue_id, ticker)
);

create table if not exists public.market_prices_daily (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  price_date date not null,
  open_price numeric(20,6) not null check (open_price >= 0),
  high_price numeric(20,6) not null check (high_price >= 0),
  low_price numeric(20,6) not null check (low_price >= 0),
  close_price numeric(20,6) not null check (close_price >= 0),
  adjusted_close numeric(20,6) not null check (adjusted_close >= 0),
  volume numeric(24,4) not null default 0 check (volume >= 0),
  market_cap numeric(24,4),
  total_return_index numeric(20,6) not null check (total_return_index > 0),
  source_timestamp timestamptz not null,
  primary key (dataset_id, instrument_id, price_date),
  check (high_price >= greatest(open_price, close_price, low_price)),
  check (low_price <= least(open_price, close_price, high_price))
);

create table if not exists public.fx_rates_daily (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  rate_date date not null,
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  quote_currency char(3) not null check (quote_currency ~ '^[A-Z]{3}$'),
  spot_rate numeric(20,8) not null check (spot_rate > 0),
  one_month_forward numeric(20,8) check (one_month_forward > 0),
  three_month_forward numeric(20,8) check (three_month_forward > 0),
  source_timestamp timestamptz not null,
  primary key (dataset_id, rate_date, base_currency, quote_currency),
  check (base_currency <> quote_currency)
);

create table if not exists public.yield_curve_points (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  curve_date date not null,
  curve_code text not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  tenor_months integer not null check (tenor_months > 0),
  par_yield numeric(10,6) not null,
  zero_rate numeric(10,6) not null,
  discount_factor numeric(14,10) not null check (discount_factor > 0 and discount_factor <= 1.5),
  primary key (dataset_id, curve_date, curve_code, tenor_months)
);

create table if not exists public.macro_observations (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  series_code text not null,
  observation_date date not null,
  country_code char(2) not null check (country_code ~ '^[A-Z]{2}$'),
  series_name text not null,
  value numeric(24,8) not null,
  unit text not null,
  frequency text not null check (frequency in ('daily', 'monthly', 'quarterly', 'annual')),
  seasonal_adjustment text not null default 'not_applicable',
  release_date date not null,
  primary key (dataset_id, series_code, observation_date),
  check (release_date >= observation_date)
);

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  manager_entity_id uuid not null references public.investment_entities(id),
  fund_code text not null,
  fund_name text not null,
  strategy text not null,
  domicile_country char(2) not null check (domicile_country ~ '^[A-Z]{2}$'),
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  inception_date date not null,
  benchmark_code text not null,
  management_fee_bps numeric(10,4) not null check (management_fee_bps >= 0),
  performance_fee_pct numeric(8,4) not null default 0 check (performance_fee_pct between 0 and 100),
  nav_frequency text not null check (nav_frequency in ('daily', 'weekly', 'monthly')),
  mandate jsonb not null default '{}'::jsonb check (jsonb_typeof(mandate) = 'object'),
  unique (dataset_id, fund_code)
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  fund_id uuid not null references public.funds(id) on delete cascade,
  portfolio_code text not null,
  portfolio_name text not null,
  sleeve text not null,
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  investment_objective text not null,
  risk_profile text not null check (risk_profile in ('conservative', 'moderate', 'growth', 'aggressive')),
  inception_date date not null,
  active boolean not null default true,
  unique (dataset_id, portfolio_code)
);

create table if not exists public.portfolio_holdings (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id),
  as_of_date date not null,
  quantity numeric(28,8) not null,
  local_price numeric(20,6) not null check (local_price >= 0),
  local_market_value numeric(24,4) not null,
  base_market_value numeric(24,4) not null,
  cost_basis_base numeric(24,4) not null,
  accrued_income_base numeric(20,4) not null default 0,
  unrealized_pnl_base numeric(24,4) not null,
  portfolio_weight numeric(12,8) not null check (portfolio_weight between -1 and 1),
  duration_years numeric(10,6),
  primary key (dataset_id, portfolio_id, instrument_id, as_of_date)
);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id),
  counterparty_entity_id uuid references public.investment_entities(id),
  trade_date date not null,
  settlement_date date not null,
  transaction_type text not null check (transaction_type in ('buy', 'sell', 'dividend', 'coupon', 'fee', 'subscription', 'redemption', 'fx')),
  quantity numeric(28,8) not null,
  price numeric(20,8) not null check (price >= 0),
  gross_amount numeric(24,4) not null,
  fees numeric(20,4) not null default 0 check (fees >= 0),
  taxes numeric(20,4) not null default 0 check (taxes >= 0),
  net_amount numeric(24,4) not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_base numeric(20,8) not null check (fx_rate_to_base > 0),
  broker_reference text not null unique,
  check (settlement_date >= trade_date)
);

create table if not exists public.benchmark_constituents (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  benchmark_code text not null,
  instrument_id uuid not null references public.instruments(id),
  as_of_date date not null,
  constituent_weight numeric(12,8) not null check (constituent_weight between 0 and 1),
  primary key (dataset_id, benchmark_code, instrument_id, as_of_date)
);

create table if not exists public.portfolio_performance (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  period_end date not null,
  period_type text not null check (period_type in ('daily', 'monthly', 'quarterly', 'annual')),
  beginning_nav numeric(24,4) not null check (beginning_nav > 0),
  ending_nav numeric(24,4) not null check (ending_nav > 0),
  net_flow numeric(24,4) not null,
  gross_return numeric(14,10) not null,
  net_return numeric(14,10) not null,
  benchmark_return numeric(14,10) not null,
  active_return numeric(14,10) not null,
  cumulative_net_return numeric(14,10) not null,
  primary key (dataset_id, portfolio_id, period_end, period_type)
);

create table if not exists public.portfolio_risk_metrics (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  as_of_date date not null,
  horizon_days integer not null check (horizon_days > 0),
  confidence_level numeric(6,5) not null check (confidence_level > 0 and confidence_level < 1),
  volatility_annualized numeric(14,10) not null check (volatility_annualized >= 0),
  tracking_error numeric(14,10) not null check (tracking_error >= 0),
  beta numeric(12,8) not null,
  sharpe_ratio numeric(12,8),
  information_ratio numeric(12,8),
  value_at_risk numeric(24,4) not null check (value_at_risk >= 0),
  expected_shortfall numeric(24,4) not null check (expected_shortfall >= value_at_risk),
  max_drawdown numeric(14,10) not null check (max_drawdown between -1 and 0),
  effective_duration numeric(10,6),
  primary key (dataset_id, portfolio_id, as_of_date, horizon_days, confidence_level)
);

create table if not exists public.esg_scores (
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  entity_id uuid not null references public.investment_entities(id) on delete cascade,
  assessment_date date not null,
  environmental_score numeric(7,3) not null check (environmental_score between 0 and 100),
  social_score numeric(7,3) not null check (social_score between 0 and 100),
  governance_score numeric(7,3) not null check (governance_score between 0 and 100),
  composite_score numeric(7,3) not null check (composite_score between 0 and 100),
  carbon_intensity_tco2e_per_usdm numeric(14,4) check (carbon_intensity_tco2e_per_usdm >= 0),
  controversy_level smallint not null check (controversy_level between 0 and 5),
  data_quality text not null check (data_quality in ('estimated', 'reported', 'verified')),
  primary key (dataset_id, entity_id, assessment_date)
);

create table if not exists public.corporate_actions (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.investment_datasets(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  action_type text not null check (action_type in ('cash_dividend', 'stock_split', 'coupon_payment', 'maturity', 'rights_issue')),
  announcement_date date not null,
  ex_date date not null,
  record_date date not null,
  payment_date date not null,
  amount numeric(20,8),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  ratio_from numeric(16,8),
  ratio_to numeric(16,8),
  status text not null check (status in ('announced', 'confirmed', 'paid', 'cancelled')),
  check (ex_date >= announcement_date),
  check (record_date >= ex_date),
  check (payment_date >= record_date)
);

create index if not exists investment_entities_type_country_idx on public.investment_entities (entity_type, country_code);
create index if not exists instruments_asset_class_idx on public.instruments (asset_class, sub_asset_class);
create index if not exists instruments_issuer_idx on public.instruments (issuer_entity_id);
create index if not exists market_prices_date_idx on public.market_prices_daily (price_date desc);
create index if not exists market_prices_instrument_date_idx on public.market_prices_daily (instrument_id, price_date desc);
create index if not exists fx_rates_date_idx on public.fx_rates_daily (rate_date desc);
create index if not exists yield_curve_date_idx on public.yield_curve_points (curve_code, curve_date desc);
create index if not exists macro_series_date_idx on public.macro_observations (series_code, observation_date desc);
create index if not exists holdings_portfolio_date_idx on public.portfolio_holdings (portfolio_id, as_of_date desc);
create index if not exists holdings_instrument_date_idx on public.portfolio_holdings (instrument_id, as_of_date desc);
create index if not exists transactions_portfolio_trade_date_idx on public.investment_transactions (portfolio_id, trade_date desc);
create index if not exists performance_portfolio_period_idx on public.portfolio_performance (portfolio_id, period_end desc);
create index if not exists risk_portfolio_date_idx on public.portfolio_risk_metrics (portfolio_id, as_of_date desc);
create index if not exists esg_entity_date_idx on public.esg_scores (entity_id, assessment_date desc);
create index if not exists corporate_actions_instrument_date_idx on public.corporate_actions (instrument_id, ex_date desc);

create or replace view public.latest_market_prices
with (security_invoker = true)
as
select distinct on (instrument_id)
  dataset_id,
  instrument_id,
  price_date,
  close_price,
  adjusted_close,
  volume,
  market_cap,
  total_return_index
from public.market_prices_daily
order by instrument_id, price_date desc;

create or replace view public.current_portfolio_holdings
with (security_invoker = true)
as
select h.*
from public.portfolio_holdings h
join (
  select portfolio_id, max(as_of_date) as as_of_date
  from public.portfolio_holdings
  group by portfolio_id
) latest using (portfolio_id, as_of_date);

create or replace view public.portfolio_exposure_by_asset_class
with (security_invoker = true)
as
select
  h.dataset_id,
  h.portfolio_id,
  p.portfolio_code,
  p.portfolio_name,
  h.as_of_date,
  i.asset_class,
  i.sub_asset_class,
  sum(h.base_market_value) as market_value,
  sum(h.portfolio_weight) as portfolio_weight
from public.current_portfolio_holdings h
join public.portfolios p on p.id = h.portfolio_id
join public.instruments i on i.id = h.instrument_id
group by h.dataset_id, h.portfolio_id, p.portfolio_code, p.portfolio_name, h.as_of_date, i.asset_class, i.sub_asset_class;

create or replace view public.fund_performance_summary
with (security_invoker = true)
as
select
  f.dataset_id,
  f.fund_code,
  f.fund_name,
  p.portfolio_code,
  perf.period_end,
  perf.net_return,
  perf.benchmark_return,
  perf.active_return,
  perf.cumulative_net_return
from public.portfolio_performance perf
join public.portfolios p on p.id = perf.portfolio_id
join public.funds f on f.id = p.fund_id
where perf.period_type = 'monthly';

alter table public.investment_datasets enable row level security;
alter table public.investment_entities enable row level security;
alter table public.trading_venues enable row level security;
alter table public.instruments enable row level security;
alter table public.instrument_listings enable row level security;
alter table public.market_prices_daily enable row level security;
alter table public.fx_rates_daily enable row level security;
alter table public.yield_curve_points enable row level security;
alter table public.macro_observations enable row level security;
alter table public.funds enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.benchmark_constituents enable row level security;
alter table public.portfolio_performance enable row level security;
alter table public.portfolio_risk_metrics enable row level security;
alter table public.esg_scores enable row level security;
alter table public.corporate_actions enable row level security;

create or replace function public.can_read_investment_dataset(target_dataset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.investment_datasets d
    where d.id = target_dataset_id
      and d.visibility = 'public'
      and d.is_synthetic
  );
$$;

revoke all on function public.can_read_investment_dataset(uuid) from public;
grant execute on function public.can_read_investment_dataset(uuid) to anon, authenticated;

create policy "Public synthetic investment datasets are readable"
on public.investment_datasets for select
to anon, authenticated
using (visibility = 'public' and is_synthetic);

create policy "Public investment entities are readable"
on public.investment_entities for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public trading venues are readable"
on public.trading_venues for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public instruments are readable"
on public.instruments for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public listings are readable"
on public.instrument_listings for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public prices are readable"
on public.market_prices_daily for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public FX rates are readable"
on public.fx_rates_daily for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public yield curves are readable"
on public.yield_curve_points for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public macro observations are readable"
on public.macro_observations for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public funds are readable"
on public.funds for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public portfolios are readable"
on public.portfolios for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public holdings are readable"
on public.portfolio_holdings for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public transactions are readable"
on public.investment_transactions for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public benchmark constituents are readable"
on public.benchmark_constituents for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public performance is readable"
on public.portfolio_performance for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public risk metrics are readable"
on public.portfolio_risk_metrics for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public ESG scores are readable"
on public.esg_scores for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));
create policy "Public corporate actions are readable"
on public.corporate_actions for select to anon, authenticated
using (public.can_read_investment_dataset(dataset_id));

grant usage on schema public to anon, authenticated;
grant select on
  public.investment_datasets,
  public.investment_entities,
  public.trading_venues,
  public.instruments,
  public.instrument_listings,
  public.market_prices_daily,
  public.fx_rates_daily,
  public.yield_curve_points,
  public.macro_observations,
  public.funds,
  public.portfolios,
  public.portfolio_holdings,
  public.investment_transactions,
  public.benchmark_constituents,
  public.portfolio_performance,
  public.portfolio_risk_metrics,
  public.esg_scores,
  public.corporate_actions,
  public.latest_market_prices,
  public.current_portfolio_holdings,
  public.portfolio_exposure_by_asset_class,
  public.fund_performance_summary
to anon, authenticated;

comment on table public.investment_datasets is 'Registry and provenance for queryable investment subject areas.';
comment on table public.market_prices_daily is 'Synthetic daily OHLCV and total-return history; not suitable for trading or valuation.';
comment on table public.portfolio_holdings is 'Synthetic point-in-time positions and weights for asset-management analytics.';
comment on table public.investment_transactions is 'Synthetic trade and cash activity; contains no client or production records.';
comment on table public.portfolio_performance is 'Synthetic portfolio, benchmark, and active returns by period.';
comment on table public.portfolio_risk_metrics is 'Synthetic ex-post and modelled portfolio risk measures.';
