BEGIN;

CREATE TABLE fairshare.input_snapshots (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision >= 0),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  canonical_payload text NOT NULL,
  fingerprint fairshare.fingerprint NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(assumptions) = 'array'),
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, revision),
  UNIQUE (organization_id, period_id, id, revision),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  CHECK (canonical_payload::jsonb = payload),
  CHECK (fingerprint = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex'))
);

CREATE TABLE fairshare.plans (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  snapshot_id uuid NOT NULL,
  input_revision integer NOT NULL CHECK (input_revision >= 0),
  accepted_revision integer NOT NULL CHECK (accepted_revision > 0),
  algorithm text NOT NULL CHECK (algorithm IN ('srs-progressive-maxmin', 'hamilton-proportional')),
  engine_version text NOT NULL CHECK (btrim(engine_version) <> ''),
  policy_version text NOT NULL CHECK (btrim(policy_version) <> ''),
  accepted_by uuid NOT NULL,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  provenance fairshare.provenance NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, id),
  UNIQUE (organization_id, period_id, accepted_revision),
  FOREIGN KEY (organization_id, period_id, snapshot_id, input_revision)
    REFERENCES fairshare.input_snapshots(organization_id, period_id, id, revision),
  FOREIGN KEY (organization_id, accepted_by) REFERENCES fairshare.memberships(organization_id, id),
  CHECK (accepted_revision = input_revision + 1)
);

CREATE TABLE fairshare.allocations (
  organization_id uuid NOT NULL,
  period_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  region_id uuid NOT NULL,
  center_id uuid NOT NULL,
  allocated_kits fairshare.kit_quantity NOT NULL,
  prior_dispatched_kits fairshare.kit_quantity NOT NULL,
  newly_allocated_kits fairshare.kit_quantity NOT NULL,
  PRIMARY KEY (organization_id, plan_id, region_id),
  UNIQUE (organization_id, period_id, plan_id, region_id, center_id, newly_allocated_kits),
  FOREIGN KEY (organization_id, period_id, plan_id) REFERENCES fairshare.plans(organization_id, period_id, id),
  FOREIGN KEY (organization_id, period_id, region_id, center_id)
    REFERENCES fairshare.period_regions(organization_id, period_id, region_id, center_id),
  CHECK (allocated_kits = prior_dispatched_kits + newly_allocated_kits)
);

CREATE TABLE fairshare.reservations (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  region_id uuid NOT NULL,
  center_id uuid NOT NULL,
  reserved_kits fairshare.kit_quantity NOT NULL,
  fulfilled_kits fairshare.kit_quantity NOT NULL DEFAULT 0,
  released_kits fairshare.kit_quantity NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, plan_id, region_id),
  UNIQUE (organization_id, period_id, id, center_id, region_id),
  FOREIGN KEY (organization_id, period_id, plan_id, region_id, center_id, reserved_kits)
    REFERENCES fairshare.allocations(organization_id, period_id, plan_id, region_id, center_id, newly_allocated_kits),
  CHECK (fulfilled_kits + released_kits <= reserved_kits)
);

CREATE TABLE fairshare.decision_receipts (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  canonical_payload text NOT NULL,
  fingerprint fairshare.fingerprint NOT NULL,
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, plan_id),
  FOREIGN KEY (organization_id, period_id, plan_id) REFERENCES fairshare.plans(organization_id, period_id, id),
  CHECK (canonical_payload::jsonb = payload),
  CHECK (fingerprint = encode(sha256(convert_to(canonical_payload, 'UTF8')), 'hex'))
);

CREATE INDEX plans_period_time_idx ON fairshare.plans(organization_id, period_id, accepted_at DESC);
CREATE INDEX allocations_center_idx ON fairshare.allocations(organization_id, period_id, center_id);
CREATE INDEX reservations_outstanding_idx ON fairshare.reservations(organization_id, period_id, center_id)
  WHERE fulfilled_kits + released_kits < reserved_kits;
CREATE INDEX receipts_period_time_idx ON fairshare.decision_receipts(organization_id, period_id, created_at DESC);

COMMIT;
