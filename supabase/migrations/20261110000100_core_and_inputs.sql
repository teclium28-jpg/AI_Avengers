BEGIN;

CREATE SCHEMA fairshare;
REVOKE ALL ON SCHEMA fairshare FROM PUBLIC;

-- Unscaled numeric rejects 1.5 instead of silently rounding it on integer assignment.
CREATE DOMAIN fairshare.kit_quantity AS numeric
  CHECK (VALUE >= 0 AND VALUE = trunc(VALUE) AND VALUE <= 2147483647);
CREATE DOMAIN fairshare.provenance AS text
  CHECK (VALUE IN ('reported', 'simulated'));
CREATE DOMAIN fairshare.fingerprint AS text
  CHECK (VALUE ~ '^[0-9a-f]{64}$');

CREATE TABLE fairshare.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fairshare.memberships (
  organization_id uuid NOT NULL REFERENCES fairshare.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  role text NOT NULL CHECK (role IN ('coordinator', 'operator', 'reviewer')),
  active boolean NOT NULL DEFAULT true,
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, user_id),
  CHECK ((provenance = 'reported' AND user_id IS NOT NULL)
      OR (provenance = 'simulated' AND user_id IS NULL))
);

CREATE TABLE fairshare.centers (
  organization_id uuid NOT NULL REFERENCES fairshare.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE fairshare.center_operators (
  organization_id uuid NOT NULL,
  center_id uuid NOT NULL,
  membership_id uuid NOT NULL,
  PRIMARY KEY (organization_id, center_id, membership_id),
  FOREIGN KEY (organization_id, center_id) REFERENCES fairshare.centers(organization_id, id),
  FOREIGN KEY (organization_id, membership_id) REFERENCES fairshare.memberships(organization_id, id)
);

CREATE TABLE fairshare.regions (
  organization_id uuid NOT NULL REFERENCES fairshare.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (btrim(code) <> ''),
  name text NOT NULL CHECK (btrim(name) <> ''),
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, code)
);

CREATE TABLE fairshare.planning_periods (
  organization_id uuid NOT NULL REFERENCES fairshare.organizations(id),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (btrim(code) <> ''),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, code),
  CHECK (ends_at > starts_at)
);

-- An assignment is explicit per period; a later period may choose a different center.
CREATE TABLE fairshare.period_regions (
  organization_id uuid NOT NULL,
  period_id uuid NOT NULL,
  region_id uuid NOT NULL,
  center_id uuid NOT NULL,
  PRIMARY KEY (organization_id, period_id, region_id),
  UNIQUE (organization_id, period_id, region_id, center_id),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, region_id) REFERENCES fairshare.regions(organization_id, id),
  FOREIGN KEY (organization_id, center_id) REFERENCES fairshare.centers(organization_id, id)
);

CREATE TABLE fairshare.stock_records (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  period_revision integer NOT NULL CHECK (period_revision > 0),
  stock_type text NOT NULL CHECK (stock_type IN ('confirmed', 'hypothetical')),
  quantity_kits fairshare.kit_quantity NOT NULL,
  unit text NOT NULL DEFAULT 'kit' CHECK (unit = 'kit'),
  source text NOT NULL CHECK (btrim(source) <> ''),
  observed_at timestamptz NOT NULL,
  provenance fairshare.provenance NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, stock_type, revision),
  UNIQUE (organization_id, period_id, period_revision),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, recorded_by) REFERENCES fairshare.memberships(organization_id, id)
);

CREATE TABLE fairshare.demand_records (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  region_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  period_revision integer NOT NULL CHECK (period_revision > 0),
  quantity_kits fairshare.kit_quantity NOT NULL,
  unit text NOT NULL DEFAULT 'kit' CHECK (unit = 'kit'),
  source text NOT NULL CHECK (btrim(source) <> ''),
  observed_at timestamptz NOT NULL,
  provenance fairshare.provenance NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, region_id, revision),
  UNIQUE (organization_id, period_id, period_revision),
  FOREIGN KEY (organization_id, period_id, region_id) REFERENCES fairshare.period_regions(organization_id, period_id, region_id),
  FOREIGN KEY (organization_id, recorded_by) REFERENCES fairshare.memberships(organization_id, id)
);

CREATE TABLE fairshare.capacity_records (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  center_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  period_revision integer NOT NULL CHECK (period_revision > 0),
  quantity_kits fairshare.kit_quantity NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  unit text NOT NULL DEFAULT 'kit' CHECK (unit = 'kit'),
  source text NOT NULL CHECK (btrim(source) <> ''),
  observed_at timestamptz NOT NULL,
  provenance fairshare.provenance NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, center_id, revision),
  UNIQUE (organization_id, period_id, period_revision),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, center_id) REFERENCES fairshare.centers(organization_id, id),
  FOREIGN KEY (organization_id, recorded_by) REFERENCES fairshare.memberships(organization_id, id),
  CHECK (NOT is_closed OR quantity_kits = 0)
);

CREATE INDEX memberships_user_active_idx ON fairshare.memberships(user_id, organization_id) WHERE active AND user_id IS NOT NULL;
CREATE INDEX periods_org_status_idx ON fairshare.planning_periods(organization_id, status, starts_at);
CREATE INDEX assignments_center_idx ON fairshare.period_regions(organization_id, center_id, period_id);
CREATE INDEX stock_latest_idx ON fairshare.stock_records(organization_id, period_id, stock_type, revision DESC);
CREATE INDEX demand_latest_idx ON fairshare.demand_records(organization_id, period_id, region_id, revision DESC);
CREATE INDEX capacity_latest_idx ON fairshare.capacity_records(organization_id, period_id, center_id, revision DESC);

COMMIT;
