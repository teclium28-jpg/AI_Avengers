BEGIN;

CREATE TABLE fairshare.movements (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  reservation_id uuid NOT NULL,
  region_id uuid NOT NULL,
  center_id uuid NOT NULL,
  reference text NOT NULL CHECK (btrim(reference) <> ''),
  provenance fairshare.provenance NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, period_id, id),
  FOREIGN KEY (organization_id, period_id, reservation_id, center_id, region_id)
    REFERENCES fairshare.reservations(organization_id, period_id, id, center_id, region_id),
  FOREIGN KEY (organization_id, created_by) REFERENCES fairshare.memberships(organization_id, id)
);

CREATE TABLE fairshare.movement_events (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  movement_id uuid NOT NULL,
  event_key uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN
    ('dispatch', 'receipt', 'collection', 'in_transit', 'loss_transit', 'loss_center', 'return')),
  quantity_kits fairshare.kit_quantity NOT NULL CHECK (quantity_kits > 0),
  reverses_event_id uuid,
  reference_doc text NOT NULL CHECK (btrim(reference_doc) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  source text NOT NULL CHECK (btrim(source) <> ''),
  unit text NOT NULL DEFAULT 'kit' CHECK (unit = 'kit'),
  provenance fairshare.provenance NOT NULL,
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid NOT NULL,
  PRIMARY KEY (organization_id, id),
  UNIQUE (organization_id, event_key),
  UNIQUE (organization_id, movement_id, id),
  FOREIGN KEY (organization_id, period_id, movement_id)
    REFERENCES fairshare.movements(organization_id, period_id, id),
  FOREIGN KEY (organization_id, movement_id, reverses_event_id)
    REFERENCES fairshare.movement_events(organization_id, movement_id, id),
  FOREIGN KEY (organization_id, recorded_by) REFERENCES fairshare.memberships(organization_id, id),
  CHECK (reverses_event_id IS NULL OR reverses_event_id <> id)
);

CREATE UNIQUE INDEX one_reversal_per_event_idx ON fairshare.movement_events(organization_id, reverses_event_id)
  WHERE reverses_event_id IS NOT NULL;
CREATE INDEX events_movement_time_idx ON fairshare.movement_events(organization_id, movement_id, occurred_at, id);
CREATE INDEX events_period_type_idx ON fairshare.movement_events(organization_id, period_id, event_type);
CREATE INDEX movements_center_time_idx ON fairshare.movements(organization_id, center_id, created_at DESC);

CREATE TABLE fairshare.reviews (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  movement_id uuid,
  plan_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'dismissed')),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  resolution_reason text,
  created_by uuid NOT NULL,
  resolved_by uuid,
  provenance fairshare.provenance NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, period_id, movement_id) REFERENCES fairshare.movements(organization_id, period_id, id),
  FOREIGN KEY (organization_id, period_id, plan_id) REFERENCES fairshare.plans(organization_id, period_id, id),
  FOREIGN KEY (organization_id, created_by) REFERENCES fairshare.memberships(organization_id, id),
  FOREIGN KEY (organization_id, resolved_by) REFERENCES fairshare.memberships(organization_id, id),
  CHECK (num_nonnulls(movement_id, plan_id) = 1),
  CHECK ((status IN ('resolved', 'dismissed') AND btrim(coalesce(resolution_reason, '')) <> ''
          AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
      OR (status IN ('open', 'in_review') AND resolution_reason IS NULL
          AND resolved_by IS NULL AND resolved_at IS NULL))
);
CREATE INDEX reviews_unresolved_idx ON fairshare.reviews(organization_id, period_id, created_at)
  WHERE status IN ('open', 'in_review');

CREATE TABLE fairshare.idempotency_records (
  organization_id uuid NOT NULL,
  request_key uuid NOT NULL,
  period_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  payload_hash fairshare.fingerprint NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'completed')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (organization_id, request_key),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES fairshare.memberships(organization_id, id),
  CHECK ((state = 'pending' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
      OR (state = 'completed' AND response_status BETWEEN 200 AND 299
          AND response_status IS NOT NULL AND response_body IS NOT NULL
          AND jsonb_typeof(response_body) = 'object' AND completed_at IS NOT NULL))
);

CREATE TABLE fairshare.audit_events (
  organization_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (btrim(action) <> ''),
  request_id uuid NOT NULL,
  details jsonb NOT NULL CHECK (jsonb_typeof(details) = 'object'),
  provenance fairshare.provenance NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, id),
  FOREIGN KEY (organization_id, period_id) REFERENCES fairshare.planning_periods(organization_id, id),
  FOREIGN KEY (organization_id, actor_id) REFERENCES fairshare.memberships(organization_id, id)
);
CREATE INDEX audit_period_time_idx ON fairshare.audit_events(organization_id, period_id, occurred_at DESC, id);
CREATE INDEX idempotency_time_idx ON fairshare.idempotency_records(organization_id, created_at);

COMMIT;
