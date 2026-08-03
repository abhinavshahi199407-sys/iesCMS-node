create table if not exists shops(shop_id text primary key,shop_name text not null,circle text,license_type text,active boolean default true);
create table if not exists report_snapshots(id bigserial primary key,report_type text not null,source_period date,cutoff_at timestamptz not null,financial_year text,district text,circle text,shop_id text,metric jsonb not null,source_hash text,created_at timestamptz default now());
create index if not exists ix_snapshots_lookup on report_snapshots(report_type,circle,shop_id,cutoff_at desc);
create table if not exists alerts(id bigserial primary key,severity text,rule_code text,circle text,shop_id text,message text,metric jsonb,opened_at timestamptz default now(),closed_at timestamptz);
-- CY day vs exact LY day/cutoff and CY MTD vs LY-MTD should be materialized in views after source report fields are confirmed.
