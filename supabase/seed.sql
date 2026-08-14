-- Deterministic synthetic investment data for demos, development, and SQL evaluation.
-- This is not licensed market data and must not be used for trading, valuation,
-- client reporting, regulatory reporting, or investment decisions.

begin;

delete from public.investment_datasets
where slug in (
  'global-market-reference',
  'global-macro-rates',
  'multi-asset-management',
  'responsible-investing'
)
and is_synthetic;

insert into public.investment_datasets (
  id, slug, name, description, domain, visibility, is_synthetic, source_name,
  source_url, license_name, frequency, coverage_start, coverage_end, semantic_notes
) values
(
  '10000000-0000-0000-0000-000000000001',
  'global-market-reference',
  'Global Market and Security Reference',
  'Cross-asset instruments, listings, daily prices, FX rates, benchmarks, and corporate actions.',
  'market_data', 'public', true, 'ep deterministic synthetic generator', null,
  'CC0 synthetic demonstration data', 'daily', '2025-01-01', '2026-08-12',
  '{"grain":{"prices":"one row per instrument and trading day","fx":"one row per currency pair and trading day"},"warnings":["Synthetic values","No survivorship-bias correction","Not suitable for investment decisions"]}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000002',
  'global-macro-rates',
  'Global Macro and Rates',
  'Synthetic macroeconomic time series and sovereign zero/par yield curves.',
  'macro_rates', 'public', true, 'ep deterministic synthetic generator', null,
  'CC0 synthetic demonstration data', 'mixed', '2025-01-01', '2026-08-12',
  '{"grain":{"macro":"one row per series and observation period","curves":"one row per curve, date, and tenor"},"units":{"rates":"decimal, where 0.05 means 5 percent"}}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000003',
  'multi-asset-management',
  'Multi-Asset Management',
  'Synthetic funds, portfolios, holdings, transactions, performance, and risk metrics.',
  'asset_management', 'public', true, 'ep deterministic synthetic generator', null,
  'CC0 synthetic demonstration data', 'monthly', '2025-01-01', '2026-08-12',
  '{"grain":{"holdings":"one row per portfolio, instrument, and as-of date","performance":"one row per portfolio and month","risk":"one row per portfolio, date, horizon, and confidence level"},"currency_convention":"base-market values are in each portfolio base currency"}'::jsonb
),
(
  '10000000-0000-0000-0000-000000000004',
  'responsible-investing',
  'Responsible Investing',
  'Synthetic issuer-level environmental, social, governance, carbon, controversy, and quality measures.',
  'responsible_investing', 'public', true, 'ep deterministic synthetic generator', null,
  'CC0 synthetic demonstration data', 'annual', '2024-12-31', '2025-12-31',
  '{"grain":"one row per issuer and assessment date","score_direction":"higher is better","carbon_unit":"tCO2e per USD million revenue"}'::jsonb
);

insert into public.investment_entities (
  id, dataset_id, entity_code, legal_name, entity_type, country_code, sector, industry, lei, website
) values
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'NTHR', 'Northstar Technology plc', 'issuer', 'US', 'Information Technology', 'Software', '549300SYNTHNORTHSTAR01', null),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'GRNR', 'Green River Industrials SA', 'issuer', 'DE', 'Industrials', 'Capital Goods', '529900SYNTHGREENRIV01', null),
('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'MRDN', 'Meridian Health Group', 'issuer', 'CH', 'Health Care', 'Pharmaceuticals', '506700SYNTHMERIDIAN01', null),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'HBRF', 'Harbor Financial Holdings', 'issuer', 'GB', 'Financials', 'Banks', '213800SYNTHHARBORFI01', null),
('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'SOLR', 'Solara Energy Systems', 'issuer', 'JP', 'Industrials', 'Electrical Equipment', '353800SYNTHSOLARAEN01', null),
('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'CLDN', 'Caledon Consumer Brands', 'issuer', 'CA', 'Consumer Staples', 'Consumer Products', '549300SYNTHCALEDON01', null),
('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'USGV', 'United States Treasury', 'government', 'US', 'Government', 'Sovereign', null, 'https://home.treasury.gov'),
('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'DEGV', 'Federal Republic of Germany', 'government', 'DE', 'Government', 'Sovereign', null, 'https://www.deutsche-finanzagentur.de'),
('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'APEX', 'Apex Ridge Asset Management', 'asset_manager', 'SG', 'Financials', 'Asset Management', '549300SYNTHAPEXRIDGE1', null),
('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', 'ORBIT', 'Orbit Securities', 'counterparty', 'US', 'Financials', 'Broker Dealer', '549300SYNTHORBITSEC01', null),
('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000003', 'SUMMIT', 'Summit Markets Europe', 'counterparty', 'GB', 'Financials', 'Broker Dealer', '213800SYNTHSUMMITMK01', null),
('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'EPIDX', 'EP Synthetic Index Company', 'index_provider', 'SG', 'Financials', 'Index Provider', null, null);

insert into public.trading_venues (id, dataset_id, mic, venue_name, country_code, timezone, currency) values
('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'XNYS', 'New York Stock Exchange', 'US', 'America/New_York', 'USD'),
('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'XNAS', 'Nasdaq', 'US', 'America/New_York', 'USD'),
('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'XLON', 'London Stock Exchange', 'GB', 'Europe/London', 'GBP'),
('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'XETR', 'Xetra', 'DE', 'Europe/Berlin', 'EUR'),
('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'XTKS', 'Tokyo Stock Exchange', 'JP', 'Asia/Tokyo', 'JPY');

insert into public.instruments (
  id, dataset_id, issuer_entity_id, instrument_code, name, instrument_type, asset_class,
  sub_asset_class, currency, country_code, region, sector, isin, issue_date, maturity_date,
  coupon_rate, coupon_frequency, face_value, metadata
) values
('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'EQ-NTHR', 'Northstar Technology', 'equity', 'Equity', 'Developed Large Cap', 'USD', 'US', 'North America', 'Information Technology', 'US0000000001', '2014-05-15', null, null, null, null, '{"style":"growth"}'),
('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'EQ-GRNR', 'Green River Industrials', 'equity', 'Equity', 'Developed Large Cap', 'EUR', 'DE', 'Europe', 'Industrials', 'DE0000000002', '2008-09-22', null, null, null, null, '{"style":"quality"}'),
('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'EQ-MRDN', 'Meridian Health Group', 'equity', 'Equity', 'Developed Large Cap', 'CHF', 'CH', 'Europe', 'Health Care', 'CH0000000003', '2001-03-12', null, null, null, null, '{"style":"defensive"}'),
('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'EQ-HBRF', 'Harbor Financial Holdings', 'equity', 'Equity', 'Developed Large Cap', 'GBP', 'GB', 'Europe', 'Financials', 'GB0000000004', '1998-11-02', null, null, null, null, '{"style":"value"}'),
('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'EQ-SOLR', 'Solara Energy Systems', 'equity', 'Equity', 'Developed Mid Cap', 'JPY', 'JP', 'Asia Pacific', 'Industrials', 'JP0000000005', '2018-06-18', null, null, null, null, '{"style":"growth"}'),
('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 'EQ-CLDN', 'Caledon Consumer Brands', 'equity', 'Equity', 'Developed Mid Cap', 'CAD', 'CA', 'North America', 'Consumer Staples', 'CA0000000006', '2011-02-08', null, null, null, null, '{"style":"quality"}'),
('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007', 'UST-2Y', 'US Treasury 2.75% 2027', 'government_bond', 'Fixed Income', 'Government Bond', 'USD', 'US', 'North America', 'Government', 'US0000001007', '2025-01-15', '2027-01-15', 0.0275, 2, 1000, '{}'),
('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000007', 'UST-10Y', 'US Treasury 4.00% 2035', 'government_bond', 'Fixed Income', 'Government Bond', 'USD', 'US', 'North America', 'Government', 'US0000001008', '2025-02-15', '2035-02-15', 0.0400, 2, 1000, '{}'),
('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000008', 'DBR-10Y', 'German Bund 2.50% 2035', 'government_bond', 'Fixed Income', 'Government Bond', 'EUR', 'DE', 'Europe', 'Government', 'DE0000001009', '2025-03-01', '2035-03-01', 0.0250, 1, 1000, '{}'),
('40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'GRNR-29', 'Green River 3.90% 2029', 'corporate_bond', 'Fixed Income', 'Investment Grade Credit', 'EUR', 'DE', 'Europe', 'Industrials', 'DE0000001010', '2024-09-20', '2029-09-20', 0.0390, 1, 1000, '{"rating":"A"}'),
('40000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 'HBRF-30', 'Harbor Financial 5.10% 2030', 'corporate_bond', 'Fixed Income', 'Investment Grade Credit', 'GBP', 'GB', 'Europe', 'Financials', 'GB0000001011', '2025-01-10', '2030-01-10', 0.0510, 2, 1000, '{"rating":"BBB"}'),
('40000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'NTHR-28', 'Northstar Technology 4.60% 2028', 'corporate_bond', 'Fixed Income', 'Investment Grade Credit', 'USD', 'US', 'North America', 'Information Technology', 'US0000001012', '2023-07-01', '2028-07-01', 0.0460, 2, 1000, '{"rating":"A"}'),
('40000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', null, 'ETF-GEQ', 'EP Global Equity ETF', 'etf', 'Equity', 'Global Equity', 'USD', 'US', 'Global', null, 'US0000001013', '2020-01-02', null, null, null, null, '{"benchmark":"EP-GLOBAL-EQ"}'),
('40000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', null, 'ETF-GBD', 'EP Global Bond ETF', 'etf', 'Fixed Income', 'Global Aggregate Bond', 'USD', 'US', 'Global', null, 'US0000001014', '2020-01-02', null, null, null, null, '{"benchmark":"EP-GLOBAL-BD"}'),
('40000000-0000-0000-0000-000000000015', '10000000-0000-0000-0000-000000000001', null, 'CASH-USD', 'US Dollar Cash', 'cash', 'Cash', 'Cash and Equivalents', 'USD', 'US', 'North America', null, null, null, null, null, null, 1, '{}'),
('40000000-0000-0000-0000-000000000016', '10000000-0000-0000-0000-000000000001', null, 'CASH-EUR', 'Euro Cash', 'cash', 'Cash', 'Cash and Equivalents', 'EUR', null, 'Europe', null, null, null, null, null, null, 1, '{}');

insert into public.instrument_listings (
  dataset_id, instrument_id, venue_id, ticker, listing_currency, primary_listing, lot_size
) values
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 'NTHR', 'USD', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000004', 'GRNR', 'EUR', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'MRDN', 'EUR', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000003', 'HBRF', 'GBP', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000005', 'SOLR', 'JPY', true, 100),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000001', 'CLDN', 'USD', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000013', '30000000-0000-0000-0000-000000000001', 'GEQ', 'USD', true, 1),
('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000014', '30000000-0000-0000-0000-000000000001', 'GBD', 'USD', true, 1);

with instrument_parameters(instrument_id, base_price, drift, amplitude, phase, shares) as (
  values
  ('40000000-0000-0000-0000-000000000001'::uuid, 82.0, 0.00045, 0.045, 0.2, 850000000::numeric),
  ('40000000-0000-0000-0000-000000000002'::uuid, 46.0, 0.00022, 0.032, 1.1, 420000000::numeric),
  ('40000000-0000-0000-0000-000000000003'::uuid, 118.0, 0.00018, 0.025, 2.0, 315000000::numeric),
  ('40000000-0000-0000-0000-000000000004'::uuid, 61.0, 0.00014, 0.038, 2.8, 910000000::numeric),
  ('40000000-0000-0000-0000-000000000005'::uuid, 3250.0, 0.00036, 0.055, 3.4, 125000000::numeric),
  ('40000000-0000-0000-0000-000000000006'::uuid, 73.0, 0.00020, 0.030, 4.2, 275000000::numeric),
  ('40000000-0000-0000-0000-000000000007'::uuid, 99.2, 0.00001, 0.006, 0.5, 25000000::numeric),
  ('40000000-0000-0000-0000-000000000008'::uuid, 97.4, -0.00001, 0.010, 1.5, 45000000::numeric),
  ('40000000-0000-0000-0000-000000000009'::uuid, 98.1, 0.00000, 0.009, 2.3, 32000000::numeric),
  ('40000000-0000-0000-0000-000000000010'::uuid, 101.2, 0.00002, 0.008, 3.0, 18000000::numeric),
  ('40000000-0000-0000-0000-000000000011'::uuid, 100.4, 0.00001, 0.009, 3.8, 21000000::numeric),
  ('40000000-0000-0000-0000-000000000012'::uuid, 102.0, 0.00002, 0.008, 4.7, 19000000::numeric),
  ('40000000-0000-0000-0000-000000000013'::uuid, 125.0, 0.00027, 0.022, 0.8, 120000000::numeric),
  ('40000000-0000-0000-0000-000000000014'::uuid, 96.0, 0.00005, 0.007, 2.1, 90000000::numeric)
),
trading_days as (
  select d::date as price_date, row_number() over (order by d)::numeric as n
  from generate_series('2025-01-01'::date, '2026-08-12'::date, interval '1 day') d
  where extract(isodow from d) between 1 and 5
),
calculated as (
  select
    p.instrument_id,
    t.price_date,
    p.base_price * exp(p.drift * t.n) * (1 + p.amplitude * sin(t.n / 13.0 + p.phase)) as close_price,
    p.base_price * exp(p.drift * t.n) * (1 + p.amplitude * sin((t.n - 1) / 13.0 + p.phase)) as prior_price,
    p.base_price,
    p.shares,
    t.n
  from instrument_parameters p cross join trading_days t
)
insert into public.market_prices_daily (
  dataset_id, instrument_id, price_date, open_price, high_price, low_price, close_price,
  adjusted_close, volume, market_cap, total_return_index, source_timestamp
)
select
  '10000000-0000-0000-0000-000000000001',
  instrument_id,
  price_date,
  round(prior_price::numeric, 6),
  round((greatest(prior_price, close_price) * 1.006)::numeric, 6),
  round((least(prior_price, close_price) * 0.994)::numeric, 6),
  round(close_price::numeric, 6),
  round((close_price * (1 + 0.00008 * n))::numeric, 6),
  round((750000 + 500000 * (1 + sin(n / 7.0)))::numeric, 4),
  round((close_price * shares)::numeric, 4),
  round((100 * close_price / base_price * (1 + 0.00008 * n))::numeric, 6),
  price_date::timestamp + interval '23 hours'
from calculated;

with pairs(base_currency, quote_currency, base_rate, amplitude, phase) as (
  values
    ('EUR'::char(3), 'USD'::char(3), 1.095::numeric, 0.025::numeric, 0.2::numeric),
    ('GBP'::char(3), 'USD'::char(3), 1.275::numeric, 0.020::numeric, 1.1::numeric),
    ('USD'::char(3), 'JPY'::char(3), 148.5::numeric, 0.035::numeric, 2.0::numeric),
    ('USD'::char(3), 'CHF'::char(3), 0.890::numeric, 0.018::numeric, 2.8::numeric),
    ('USD'::char(3), 'CAD'::char(3), 1.360::numeric, 0.015::numeric, 3.6::numeric),
    ('USD'::char(3), 'SGD'::char(3), 1.340::numeric, 0.012::numeric, 4.2::numeric)
),
days as (
  select d::date as rate_date, row_number() over (order by d)::numeric as n
  from generate_series('2025-01-01'::date, '2026-08-12'::date, interval '1 day') d
  where extract(isodow from d) between 1 and 5
)
insert into public.fx_rates_daily (
  dataset_id, rate_date, base_currency, quote_currency, spot_rate,
  one_month_forward, three_month_forward, source_timestamp
)
select
  '10000000-0000-0000-0000-000000000001',
  d.rate_date,
  p.base_currency,
  p.quote_currency,
  round((p.base_rate * (1 + p.amplitude * sin(d.n / 17.0 + p.phase)))::numeric, 8),
  round((p.base_rate * (1 + p.amplitude * sin(d.n / 17.0 + p.phase)) * 1.0004)::numeric, 8),
  round((p.base_rate * (1 + p.amplitude * sin(d.n / 17.0 + p.phase)) * 1.0012)::numeric, 8),
  d.rate_date::timestamp + interval '23 hours'
from pairs p cross join days d;

with curves(curve_code, currency, level_shift) as (
  values ('USD-SOV', 'USD'::char(3), 0.012::numeric), ('EUR-SOV', 'EUR'::char(3), 0.000::numeric), ('GBP-SOV', 'GBP'::char(3), 0.009::numeric)
),
tenors(tenor_months, tenor_spread) as (
  values (1, -0.0020::numeric), (3, -0.0015::numeric), (6, -0.0010::numeric),
         (12, 0.0000::numeric), (24, 0.0015::numeric), (60, 0.0045::numeric),
         (120, 0.0070::numeric), (360, 0.0090::numeric)
),
curve_dates as (
  select d::date as curve_date, row_number() over (order by d)::numeric as n
  from generate_series('2025-01-03'::date, '2026-08-07'::date, interval '7 days') d
)
insert into public.yield_curve_points (
  dataset_id, curve_date, curve_code, currency, tenor_months, par_yield, zero_rate, discount_factor
)
select
  '10000000-0000-0000-0000-000000000002',
  d.curve_date,
  c.curve_code,
  c.currency,
  t.tenor_months,
  round((0.021 + c.level_shift + t.tenor_spread + 0.0018 * sin(d.n / 8.0))::numeric, 6),
  round((0.0205 + c.level_shift + t.tenor_spread + 0.0018 * sin(d.n / 8.0))::numeric, 6),
  round(exp(-(0.0205 + c.level_shift + t.tenor_spread + 0.0018 * sin(d.n / 8.0)) * t.tenor_months / 12.0)::numeric, 10)
from curves c cross join tenors t cross join curve_dates d;

with series(series_code, country_code, series_name, unit, frequency, base_value, trend, amplitude, phase) as (
  values
  ('US-CPI-YOY', 'US'::char(2), 'US Consumer Price Inflation YoY', 'percent', 'monthly', 2.8::numeric, -0.015::numeric, 0.35::numeric, 0.0::numeric),
  ('US-UNEMP', 'US'::char(2), 'US Unemployment Rate', 'percent', 'monthly', 4.1::numeric, 0.010::numeric, 0.18::numeric, 1.0::numeric),
  ('US-POLICY', 'US'::char(2), 'US Policy Rate', 'percent', 'monthly', 4.5::numeric, -0.045::numeric, 0.08::numeric, 2.0::numeric),
  ('EU-CPI-YOY', 'DE'::char(2), 'Euro Area Consumer Price Inflation YoY', 'percent', 'monthly', 2.4::numeric, -0.010::numeric, 0.28::numeric, 0.6::numeric),
  ('EU-UNEMP', 'DE'::char(2), 'Euro Area Unemployment Rate', 'percent', 'monthly', 6.4::numeric, -0.006::numeric, 0.12::numeric, 1.4::numeric),
  ('EU-POLICY', 'DE'::char(2), 'ECB Deposit Facility Rate', 'percent', 'monthly', 3.0::numeric, -0.055::numeric, 0.06::numeric, 2.4::numeric),
  ('JP-CPI-YOY', 'JP'::char(2), 'Japan Consumer Price Inflation YoY', 'percent', 'monthly', 2.6::numeric, -0.008::numeric, 0.22::numeric, 0.8::numeric),
  ('JP-POLICY', 'JP'::char(2), 'Japan Policy Rate', 'percent', 'monthly', 0.5::numeric, 0.012::numeric, 0.03::numeric, 2.8::numeric)
),
months as (
  select d::date as observation_date, row_number() over (order by d)::numeric as n
  from generate_series('2025-01-01'::date, '2026-07-01'::date, interval '1 month') d
)
insert into public.macro_observations (
  dataset_id, series_code, observation_date, country_code, series_name, value,
  unit, frequency, seasonal_adjustment, release_date
)
select
  '10000000-0000-0000-0000-000000000002',
  s.series_code,
  m.observation_date,
  s.country_code,
  s.series_name,
  round((s.base_value + s.trend * m.n + s.amplitude * sin(m.n / 2.8 + s.phase))::numeric, 8),
  s.unit,
  s.frequency,
  'seasonally_adjusted',
  (m.observation_date + interval '1 month 10 days')::date
from series s cross join months m;

insert into public.funds (
  id, dataset_id, manager_entity_id, fund_code, fund_name, strategy, domicile_country,
  base_currency, inception_date, benchmark_code, management_fee_bps, performance_fee_pct,
  nav_frequency, mandate
) values
('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000009', 'AR-GLOBAL', 'Apex Ridge Global Opportunities', 'Global multi-asset growth', 'SG', 'USD', '2021-01-04', 'EP-MULTI-60', 65, 10, 'daily', '{"equity_range":[0.45,0.75],"fixed_income_range":[0.15,0.45],"cash_max":0.15}'),
('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000009', 'AR-INCOME', 'Apex Ridge Strategic Income', 'Global income and capital preservation', 'SG', 'USD', '2022-04-01', 'EP-GLOBAL-BD', 45, 0, 'daily', '{"equity_max":0.25,"investment_grade_min":0.50,"duration_range":[3,8]}'),
('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000009', 'AR-SUSTAIN', 'Apex Ridge Sustainable Leaders', 'Sustainable global equity', 'SG', 'USD', '2023-02-01', 'EP-GLOBAL-EQ', 75, 12.5, 'daily', '{"equity_min":0.85,"minimum_esg_score":60,"controversy_max":3}');

insert into public.portfolios (
  id, dataset_id, fund_id, portfolio_code, portfolio_name, sleeve, base_currency,
  investment_objective, risk_profile, inception_date
) values
('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'GLOBAL-MAIN', 'Global Opportunities Main', 'Total Fund', 'USD', 'Long-term capital growth across global equities and bonds.', 'growth', '2021-01-04'),
('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'GLOBAL-DEF', 'Global Opportunities Defensive Sleeve', 'Defensive', 'USD', 'Downside-aware allocation to sovereigns, credit, and defensive equity.', 'moderate', '2021-01-04'),
('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'INCOME-MAIN', 'Strategic Income Main', 'Total Fund', 'USD', 'Income generation with controlled duration and credit risk.', 'conservative', '2022-04-01'),
('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'SUSTAIN-MAIN', 'Sustainable Leaders Main', 'Total Fund', 'USD', 'Capital growth from issuers with improving sustainability characteristics.', 'aggressive', '2023-02-01'),
('60000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', 'SUSTAIN-CORE', 'Sustainable Leaders Core Sleeve', 'Core Equity', 'USD', 'Core global quality equity exposure with ESG constraints.', 'growth', '2023-02-01');

with allocations(portfolio_id, instrument_id, weight, duration_years) as (
  values
  ('60000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, 0.16::numeric, null),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 0.12, null),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003', 0.10, null),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 0.10, null),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000008', 0.14, 8.2),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000009', 0.10, 8.0),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000010', 0.10, 3.1),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000013', 0.12, null),
  ('60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000015', 0.06, 0.0),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', 0.10, null),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000006', 0.08, null),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', 0.18, 1.3),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000008', 0.18, 8.2),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000009', 0.14, 8.0),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000010', 0.10, 3.1),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000014', 0.12, 6.2),
  ('60000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000015', 0.10, 0.0),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000007', 0.20, 1.3),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000008', 0.18, 8.2),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000009', 0.16, 8.0),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000010', 0.14, 3.1),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000011', 0.12, 3.4),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000012', 0.10, 2.0),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000014', 0.06, 6.2),
  ('60000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000015', 0.04, 0.0),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000001', 0.20, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 0.18, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 0.16, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000005', 0.18, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000006', 0.14, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000013', 0.10, null),
  ('60000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000015', 0.04, 0.0),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000001', 0.24, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000002', 0.20, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', 0.18, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 0.14, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000006', 0.12, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000013', 0.08, null),
  ('60000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000015', 0.04, 0.0)
),
dates as (
  select (d + interval '1 month - 1 day')::date as as_of_date
  from generate_series('2025-01-01'::date, '2026-07-01'::date, interval '1 month') d
  union all select '2026-08-12'::date
),
valued as (
  select
    a.portfolio_id,
    a.instrument_id,
    a.weight,
    a.duration_years,
    d.as_of_date,
    coalesce(mp.close_price, 1) as local_price,
    80000000::numeric
      * case a.portfolio_id
          when '60000000-0000-0000-0000-000000000001' then 2.4
          when '60000000-0000-0000-0000-000000000002' then 0.8
          when '60000000-0000-0000-0000-000000000003' then 1.7
          when '60000000-0000-0000-0000-000000000004' then 1.2
          else 0.6
        end
      * (1 + 0.00025 * (d.as_of_date - '2025-01-01'::date)) as portfolio_nav
  from allocations a
  cross join dates d
  left join lateral (
    select close_price
    from public.market_prices_daily mp
    where mp.instrument_id = a.instrument_id and mp.price_date <= d.as_of_date
    order by mp.price_date desc
    limit 1
  ) mp on true
)
insert into public.portfolio_holdings (
  dataset_id, portfolio_id, instrument_id, as_of_date, quantity, local_price,
  local_market_value, base_market_value, cost_basis_base, accrued_income_base,
  unrealized_pnl_base, portfolio_weight, duration_years
)
select
  '10000000-0000-0000-0000-000000000003',
  portfolio_id,
  instrument_id,
  as_of_date,
  round((portfolio_nav * weight / local_price)::numeric, 8),
  local_price,
  round((portfolio_nav * weight)::numeric, 4),
  round((portfolio_nav * weight)::numeric, 4),
  round((portfolio_nav * weight * (0.94 + 0.02 * sin(extract(epoch from as_of_date::timestamp) / 5000000.0)))::numeric, 4),
  round((portfolio_nav * weight * coalesce(duration_years, 0) * 0.0003)::numeric, 4),
  round((portfolio_nav * weight - portfolio_nav * weight * (0.94 + 0.02 * sin(extract(epoch from as_of_date::timestamp) / 5000000.0)))::numeric, 4),
  weight,
  duration_years
from valued;

with allocations as (
  select distinct portfolio_id, instrument_id
  from public.portfolio_holdings
  where dataset_id = '10000000-0000-0000-0000-000000000003'
),
trade_dates as (
  select d::date as trade_date, row_number() over (order by d) as n
  from generate_series('2025-01-15'::date, '2026-07-15'::date, interval '3 months') d
)
insert into public.investment_transactions (
  dataset_id, portfolio_id, instrument_id, counterparty_entity_id, trade_date,
  settlement_date, transaction_type, quantity, price, gross_amount, fees, taxes,
  net_amount, currency, fx_rate_to_base, broker_reference
)
select
  '10000000-0000-0000-0000-000000000003',
  a.portfolio_id,
  a.instrument_id,
  case when t.n % 2 = 0 then '20000000-0000-0000-0000-000000000010'::uuid else '20000000-0000-0000-0000-000000000011'::uuid end,
  t.trade_date,
  t.trade_date + 2,
  case when t.n % 4 = 0 then 'sell' else 'buy' end,
  case when t.n % 4 = 0 then -1000::numeric else 1200::numeric end,
  coalesce(mp.close_price, 1),
  round((abs(case when t.n % 4 = 0 then -1000::numeric else 1200::numeric end) * coalesce(mp.close_price, 1))::numeric, 4),
  round((25 + 3 * t.n)::numeric, 4),
  round((5 + t.n)::numeric, 4),
  round((
    case when t.n % 4 = 0 then 1 else -1 end
    * (abs(case when t.n % 4 = 0 then -1000::numeric else 1200::numeric end) * coalesce(mp.close_price, 1))
    - 25 - 3 * t.n - 5 - t.n
  )::numeric, 4),
  i.currency,
  1,
  'SYN-' || replace(a.portfolio_id::text, '-', '') || '-' || replace(a.instrument_id::text, '-', '') || '-' || to_char(t.trade_date, 'YYYYMMDD')
from allocations a
cross join trade_dates t
join public.instruments i on i.id = a.instrument_id
left join lateral (
  select close_price
  from public.market_prices_daily mp
  where mp.instrument_id = a.instrument_id and mp.price_date <= t.trade_date
  order by mp.price_date desc
  limit 1
) mp on true;

insert into public.benchmark_constituents (dataset_id, benchmark_code, instrument_id, as_of_date, constituent_weight) values
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000001', '2026-08-12', 0.24),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000002', '2026-08-12', 0.18),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000003', '2026-08-12', 0.17),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000004', '2026-08-12', 0.14),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000005', '2026-08-12', 0.15),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-EQ', '40000000-0000-0000-0000-000000000006', '2026-08-12', 0.12),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000007', '2026-08-12', 0.18),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000008', '2026-08-12', 0.22),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000009', '2026-08-12', 0.20),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000010', '2026-08-12', 0.14),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000011', '2026-08-12', 0.12),
('10000000-0000-0000-0000-000000000001', 'EP-GLOBAL-BD', '40000000-0000-0000-0000-000000000012', '2026-08-12', 0.14);

with months as (
  select (d + interval '1 month - 1 day')::date as period_end,
         row_number() over (order by d)::numeric as n
  from generate_series('2025-01-01'::date, '2026-07-01'::date, interval '1 month') d
),
returns as (
  select
    p.id as portfolio_id,
    m.period_end,
    m.n,
    (0.0055
      + case p.risk_profile when 'aggressive' then 0.0025 when 'growth' then 0.0015 when 'moderate' then 0.0005 else -0.0005 end
      + 0.018 * sin(m.n / 2.4 + extract(epoch from p.inception_date::timestamp) / 100000000.0)
    )::numeric as gross_return,
    (0.0048 + 0.013 * sin(m.n / 2.7))::numeric as benchmark_return
  from public.portfolios p cross join months m
  where p.dataset_id = '10000000-0000-0000-0000-000000000003'
),
calculated as (
  select
    *,
    gross_return - 0.00065 as net_return,
    exp(sum(ln(1 + gross_return - 0.00065)) over (partition by portfolio_id order by period_end)) - 1 as cumulative_return
  from returns
)
insert into public.portfolio_performance (
  dataset_id, portfolio_id, period_end, period_type, beginning_nav, ending_nav,
  net_flow, gross_return, net_return, benchmark_return, active_return, cumulative_net_return
)
select
  '10000000-0000-0000-0000-000000000003',
  portfolio_id,
  period_end,
  'monthly',
  round((100000000 * (1 + 0.01 * (n - 1)))::numeric, 4),
  round((100000000 * (1 + 0.01 * (n - 1)) * (1 + net_return))::numeric, 4),
  round((250000 * sin(n / 3.0))::numeric, 4),
  round(gross_return, 10),
  round(net_return, 10),
  round(benchmark_return, 10),
  round(net_return - benchmark_return, 10),
  round(cumulative_return::numeric, 10)
from calculated;

with dates as (
  select (d + interval '1 month - 1 day')::date as as_of_date,
         row_number() over (order by d)::numeric as n
  from generate_series('2025-01-01'::date, '2026-07-01'::date, interval '1 month') d
)
insert into public.portfolio_risk_metrics (
  dataset_id, portfolio_id, as_of_date, horizon_days, confidence_level,
  volatility_annualized, tracking_error, beta, sharpe_ratio, information_ratio,
  value_at_risk, expected_shortfall, max_drawdown, effective_duration
)
select
  '10000000-0000-0000-0000-000000000003',
  p.id,
  d.as_of_date,
  10,
  0.99,
  round((case p.risk_profile when 'aggressive' then 0.19 when 'growth' then 0.14 when 'moderate' then 0.10 else 0.065 end + 0.008 * sin(d.n / 3.0))::numeric, 10),
  round((case p.risk_profile when 'aggressive' then 0.075 when 'growth' then 0.052 when 'moderate' then 0.035 else 0.022 end + 0.003 * sin(d.n / 4.0))::numeric, 10),
  round((case p.risk_profile when 'aggressive' then 1.18 when 'growth' then 0.96 when 'moderate' then 0.66 else 0.34 end + 0.03 * sin(d.n / 5.0))::numeric, 8),
  round((0.62 + 0.12 * sin(d.n / 4.0))::numeric, 8),
  round((0.28 + 0.10 * cos(d.n / 4.5))::numeric, 8),
  round((case p.risk_profile when 'aggressive' then 8200000 when 'growth' then 5900000 when 'moderate' then 3700000 else 2300000 end * (1 + 0.04 * sin(d.n / 3.2)))::numeric, 4),
  round((case p.risk_profile when 'aggressive' then 10400000 when 'growth' then 7500000 when 'moderate' then 4700000 else 2900000 end * (1 + 0.04 * sin(d.n / 3.2)))::numeric, 4),
  round((-(case p.risk_profile when 'aggressive' then 0.18 when 'growth' then 0.13 when 'moderate' then 0.09 else 0.055 end) - 0.01 * abs(sin(d.n / 6.0)))::numeric, 10),
  case p.portfolio_code when 'INCOME-MAIN' then 5.8 when 'GLOBAL-DEF' then 4.4 when 'GLOBAL-MAIN' then 2.9 else 0.3 end
from public.portfolios p cross join dates d
where p.dataset_id = '10000000-0000-0000-0000-000000000003';

with issuers as (
  select id, row_number() over (order by entity_code)::numeric as n
  from public.investment_entities
  where entity_type = 'issuer'
),
assessment_dates as (
  values ('2024-12-31'::date, 0::numeric), ('2025-12-31'::date, 1::numeric)
)
insert into public.esg_scores (
  dataset_id, entity_id, assessment_date, environmental_score, social_score,
  governance_score, composite_score, carbon_intensity_tco2e_per_usdm,
  controversy_level, data_quality
)
select
  '10000000-0000-0000-0000-000000000004',
  i.id,
  a.column1,
  round((48 + i.n * 5 + a.column2 * 2.5)::numeric, 3),
  round((55 + i.n * 3.5 + a.column2 * 1.5)::numeric, 3),
  round((60 + i.n * 2.8 + a.column2 * 1.2)::numeric, 3),
  round((0.4 * (48 + i.n * 5 + a.column2 * 2.5) + 0.3 * (55 + i.n * 3.5 + a.column2 * 1.5) + 0.3 * (60 + i.n * 2.8 + a.column2 * 1.2))::numeric, 3),
  round((310 - i.n * 32 - a.column2 * 12)::numeric, 4),
  ((i.n::integer + a.column2::integer) % 4)::smallint,
  case when i.n::integer % 3 = 0 then 'verified' when i.n::integer % 2 = 0 then 'reported' else 'estimated' end
from issuers i cross join assessment_dates a;

insert into public.corporate_actions (
  dataset_id, instrument_id, action_type, announcement_date, ex_date, record_date,
  payment_date, amount, currency, ratio_from, ratio_to, status
)
select
  '10000000-0000-0000-0000-000000000001',
  i.id,
  'cash_dividend',
  q.ex_date - 25,
  q.ex_date,
  q.ex_date + 1,
  q.ex_date + 15,
  round((0.18 + 0.04 * row_number() over (partition by i.id order by q.ex_date))::numeric, 8),
  i.currency,
  null,
  null,
  case when q.ex_date < '2026-08-01' then 'paid' else 'confirmed' end
from public.instruments i
cross join (
  values ('2025-03-14'::date), ('2025-06-13'::date), ('2025-09-12'::date),
         ('2025-12-12'::date), ('2026-03-13'::date), ('2026-06-12'::date)
) q(ex_date)
where i.instrument_type = 'equity';

commit;

analyze public.investment_datasets;
analyze public.investment_entities;
analyze public.instruments;
analyze public.market_prices_daily;
analyze public.fx_rates_daily;
analyze public.yield_curve_points;
analyze public.macro_observations;
analyze public.portfolio_holdings;
analyze public.investment_transactions;
analyze public.portfolio_performance;
analyze public.portfolio_risk_metrics;
analyze public.esg_scores;
