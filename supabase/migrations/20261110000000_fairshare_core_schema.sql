-- FairShare PostgreSQL Schema & Security Policies
-- Emergency Relief Logistics & Progressive Max-Min Distribution Engine

-- 1. Cycles
create table if not exists public.distribution_cycles (
  id text primary key,
  revision integer not null default 1,
  status text not null default 'active',
  created_at timestamptz default now()
);

-- 2. Facilities (Warehouses & Distribution Depots)
create table if not exists public.facilities (
  id text primary key,
  name text not null,
  region_id text not null,
  daily_capacity integer not null default 60,
  operating_status text not null default 'operational',
  disruption_note text,
  updated_at timestamptz default now()
);

-- 3. Community Demands (NGO Requests)
create table if not exists public.community_demands (
  id uuid primary key default gen_random_uuid(),
  region_id text not null,
  cycle_id text not null,
  family_headcount integer not null default 1,
  requested_kits integer not null default 1,
  urgency text not null default 'high',
  notes text,
  submitted_by text,
  created_at timestamptz default now()
);

-- 4. Inbound Shipments (Physical Truck Manifests)
create table if not exists public.inbound_shipments (
  id text primary key,
  destination_facility_id text not null references public.facilities(id),
  destination_region_id text not null,
  kits_shipped integer not null,
  kits_received integer,
  damaged_kits integer default 0,
  status text not null default 'in_transit',
  driver_name text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at timestamptz default now()
);

-- 5. Authoritative Ledger (Tamper-evident revision chain)
create table if not exists public.authoritative_ledger (
  receipt_id text primary key,
  cycle_id text not null,
  revision integer not null,
  parent_receipt_id text,
  sha256_hash text not null,
  idempotency_key text not null unique,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  justification text not null,
  stock_kits integer not null,
  allocations jsonb not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.distribution_cycles enable row level security;
alter table public.facilities enable row level security;
alter table public.community_demands enable row level security;
alter table public.inbound_shipments enable row level security;
alter table public.authoritative_ledger enable row level security;

-- Public read access policies for transparency
create policy "Allow read access to distribution_cycles" on public.distribution_cycles for select using (true);
create policy "Allow read access to facilities" on public.facilities for select using (true);
create policy "Allow read access to community_demands" on public.community_demands for select using (true);
create policy "Allow read access to inbound_shipments" on public.inbound_shipments for select using (true);
create policy "Allow read access to authoritative_ledger" on public.authoritative_ledger for select using (true);

-- Insert/Update policies
create policy "Allow insert on community_demands" on public.community_demands for insert with check (true);
create policy "Allow update on facilities" on public.facilities for update using (true);
create policy "Allow update on inbound_shipments" on public.inbound_shipments for update using (true);
create policy "Allow insert on authoritative_ledger" on public.authoritative_ledger for insert with check (true);

-- Seed Baseline Data
insert into public.distribution_cycles (id, revision, status)
values ('2026-W46', 1, 'active')
on conflict (id) do nothing;

insert into public.facilities (id, name, region_id, daily_capacity, operating_status, disruption_note)
values 
  ('CTR-A', 'Bandra East Distribution Center', 'A', 60, 'operational', 'Operating at normal capacity'),
  ('CTR-B', 'Dharavi Depot & Logistics Warehouse', 'B', 20, 'impaired', 'Culvert road damaged by monsoon flood'),
  ('CTR-C', 'Kurla Central Relief Depot', 'C', 60, 'operational', 'Operating at normal capacity')
on conflict (id) do update set
  daily_capacity = excluded.daily_capacity,
  operating_status = excluded.operating_status,
  disruption_note = excluded.disruption_note;

insert into public.inbound_shipments (id, destination_facility_id, destination_region_id, kits_shipped, kits_received, status, driver_name)
values
  ('WB-MH-2026-8812', 'CTR-B', 'B', 20, null, 'in_transit', 'Ramesh Yadav (Truck MH-04-AZ-2819)'),
  ('WB-MH-2026-8809', 'CTR-B', 'B', 30, 30, 'delivered', 'Pradeep Shinde (Truck MH-01-BK-4091)')
on conflict (id) do nothing;
