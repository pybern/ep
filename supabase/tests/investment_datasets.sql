-- Run after the migration and seed. Each failed invariant raises an exception.

do $$
declare
  dataset_count integer;
  price_count integer;
  holding_count integer;
  invalid_weight_count integer;
  invalid_performance_count integer;
begin
  select count(*) into dataset_count
  from public.investment_datasets
  where slug in (
    'global-market-reference',
    'global-macro-rates',
    'multi-asset-management',
    'responsible-investing'
  );

  if dataset_count <> 4 then
    raise exception 'Expected 4 investment datasets, found %', dataset_count;
  end if;

  select count(*) into price_count
  from public.market_prices_daily
  where dataset_id = '10000000-0000-0000-0000-000000000001';

  if price_count < 5000 then
    raise exception 'Expected at least 5000 daily price rows, found %', price_count;
  end if;

  select count(*) into holding_count
  from public.portfolio_holdings
  where dataset_id = '10000000-0000-0000-0000-000000000003';

  if holding_count < 500 then
    raise exception 'Expected at least 500 holding rows, found %', holding_count;
  end if;

  select count(*) into invalid_weight_count
  from (
    select portfolio_id, as_of_date
    from public.portfolio_holdings
    where dataset_id = '10000000-0000-0000-0000-000000000003'
    group by portfolio_id, as_of_date
    having abs(sum(portfolio_weight) - 1) > 0.000001
  ) invalid_weights;

  if invalid_weight_count <> 0 then
    raise exception 'Found % portfolio dates whose weights do not sum to 1', invalid_weight_count;
  end if;

  select count(*) into invalid_performance_count
  from public.portfolio_performance
  where abs(active_return - (net_return - benchmark_return)) > 0.00000001;

  if invalid_performance_count <> 0 then
    raise exception 'Found % performance rows with inconsistent active return', invalid_performance_count;
  end if;

  if exists (
    select 1
    from public.investment_datasets
    where visibility = 'public' and not is_synthetic
  ) then
    raise exception 'Public non-synthetic datasets are prohibited by this schema';
  end if;
end
$$;
