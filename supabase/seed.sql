-- DEVELOPMENT ONLY. All rows are SYNTHETIC, not operational evidence or login accounts.
-- Explicit opt-in required: SET app.allow_synthetic_seed = 'true';
BEGIN;
DO $$
DECLARE
  org_a uuid := '10000000-0000-0000-0000-000000000001';
  org_b uuid := '10000000-0000-0000-0000-000000000002';
  actor uuid := '20000000-0000-0000-0000-000000000001';
  base_period uuid := '50000000-0000-0000-0000-000000000001';
  snapshot uuid := '60000000-0000-0000-0000-000000000001';
  plan uuid := '70000000-0000-0000-0000-000000000001';
  movement uuid := '90000000-0000-0000-0000-000000000001';
  center uuid; region uuid; period uuid; reservation uuid;
  observed timestamptz := '2026-11-10T00:00:00Z';
  scenario text; total integer; capacity integer; input_revision integer;
  snapshot_text text := '{"capacityKits":[60,40,60],"demandKits":[60,60,60],"priorDispatchedKits":[0,0,0],"provenance":"simulated","scenario":"golden-baseline","stockKits":120}';
  receipt_text text := '{"allocations":{"A":40,"B":40,"C":40},"provenance":"simulated","reason":"SYNTHETIC hand-checked baseline fixture"}';
  i integer; j integer;
BEGIN
  IF current_setting('app.allow_synthetic_seed', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'synthetic seed disabled; explicitly opt in for a development database';
  END IF;

  INSERT INTO fairshare.organizations(id, name, provenance) VALUES
    (org_a, 'SYNTHETIC Food Bank A - development only', 'simulated'),
    (org_b, 'SYNTHETIC Food Bank B - isolation fixture', 'simulated')
    ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.memberships(organization_id, id, user_id, display_name, role, provenance) VALUES
    (org_a, actor, NULL, 'SYNTHETIC coordinator', 'coordinator', 'simulated'),
    (org_a, '20000000-0000-0000-0000-000000000002', NULL, 'SYNTHETIC operator', 'operator', 'simulated'),
    (org_a, '20000000-0000-0000-0000-000000000003', NULL, 'SYNTHETIC reviewer', 'reviewer', 'simulated'),
    (org_b, '20000000-0000-0000-0000-000000000011', NULL, 'SYNTHETIC second-org coordinator', 'coordinator', 'simulated')
    ON CONFLICT DO NOTHING;

  FOR i IN 1..3 LOOP
    center := ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    region := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO fairshare.centers(organization_id, id, code, name, provenance)
      VALUES (org_a, center, 'CTR-' || chr(64+i), 'SYNTHETIC Center ' || chr(64+i), 'simulated') ON CONFLICT DO NOTHING;
    INSERT INTO fairshare.regions(organization_id, id, code, name, provenance)
      VALUES (org_a, region, chr(64+i), 'SYNTHETIC Region ' || chr(64+i), 'simulated') ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO fairshare.center_operators VALUES
    (org_a, '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002')
    ON CONFLICT DO NOTHING;

  FOR j IN 1..3 LOOP
    period := ('50000000-0000-0000-0000-' || lpad(j::text, 12, '0'))::uuid;
    scenario := CASE j WHEN 1 THEN 'SYNTHETIC-normal' WHEN 2 THEN 'SYNTHETIC-shortage' ELSE 'SYNTHETIC-reduced-capacity' END;
    total := CASE WHEN j = 2 THEN 90 ELSE 120 END;
    INSERT INTO fairshare.planning_periods(organization_id, id, code, starts_at, ends_at, provenance)
      VALUES (org_a, period, scenario, observed, observed + interval '7 days', 'simulated') ON CONFLICT DO NOTHING;
    -- WHERE NOT EXISTS is intentional: BEFORE INSERT revision triggers must not fire
    -- for existing records on a repeat seed run.
    INSERT INTO fairshare.stock_records(organization_id, period_id, revision, stock_type, quantity_kits,
      source, observed_at, provenance, recorded_by)
      SELECT org_a, period, 1, 'confirmed', total, 'SYNTHETIC period-total stock fixture', observed, 'simulated', actor
      WHERE NOT EXISTS (SELECT 1 FROM fairshare.stock_records WHERE organization_id = org_a AND period_id = period AND stock_type = 'confirmed' AND revision = 1);

    FOR i IN 1..3 LOOP
      center := ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
      region := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
      capacity := CASE WHEN i = 2 THEN CASE WHEN j = 3 THEN 20 ELSE 40 END ELSE 60 END;
      INSERT INTO fairshare.period_regions VALUES (org_a, period, region, center) ON CONFLICT DO NOTHING;
      INSERT INTO fairshare.demand_records(organization_id, period_id, region_id, revision, quantity_kits,
        source, observed_at, provenance, recorded_by)
        SELECT org_a, period, region, 1, 60, 'SYNTHETIC estimated need fixture', observed, 'simulated', actor
        WHERE NOT EXISTS (SELECT 1 FROM fairshare.demand_records WHERE organization_id = org_a AND period_id = period AND region_id = region AND revision = 1);
      INSERT INTO fairshare.capacity_records(organization_id, period_id, center_id, revision, quantity_kits,
        source, observed_at, provenance, recorded_by)
        SELECT org_a, period, center, 1, capacity, 'SYNTHETIC inclusive period capacity fixture', observed, 'simulated', actor
        WHERE NOT EXISTS (SELECT 1 FROM fairshare.capacity_records WHERE organization_id = org_a AND period_id = period AND center_id = center AND revision = 1);
    END LOOP;
  END LOOP;

  INSERT INTO fairshare.centers(organization_id, id, code, name, provenance)
    VALUES (org_b, '30000000-0000-0000-0000-000000000011', 'CTR-X', 'SYNTHETIC isolated center', 'simulated') ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.regions(organization_id, id, code, name, provenance)
    VALUES (org_b, '40000000-0000-0000-0000-000000000011', 'X', 'SYNTHETIC isolated region', 'simulated') ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.planning_periods(organization_id, id, code, starts_at, ends_at, provenance)
    VALUES (org_b, '50000000-0000-0000-0000-000000000011', 'SYNTHETIC-isolation', observed, observed + interval '7 days', 'simulated') ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.period_regions VALUES
    (org_b, '50000000-0000-0000-0000-000000000011', '40000000-0000-0000-0000-000000000011', '30000000-0000-0000-0000-000000000011') ON CONFLICT DO NOTHING;

  SELECT revision INTO input_revision FROM fairshare.planning_periods WHERE organization_id = org_a AND id = base_period;
  INSERT INTO fairshare.input_snapshots(organization_id, id, period_id, revision, payload, canonical_payload, fingerprint, provenance)
    VALUES (org_a, snapshot, base_period, input_revision, snapshot_text::jsonb, snapshot_text,
      encode(sha256(convert_to(snapshot_text, 'UTF8')), 'hex'), 'simulated') ON CONFLICT DO NOTHING;
  SELECT revision INTO input_revision FROM fairshare.input_snapshots WHERE organization_id = org_a AND id = snapshot;
  INSERT INTO fairshare.plans(organization_id, id, period_id, snapshot_id, input_revision, accepted_revision,
    algorithm, engine_version, policy_version, accepted_by, reason, provenance)
    VALUES (org_a, plan, base_period, snapshot, input_revision, input_revision + 1,
      'hamilton-proportional', 'synthetic-fixture-v1', 'synthetic-policy-v1', actor,
      'SYNTHETIC hand-checked 40/40/40 fixture; not a live server acceptance', 'simulated') ON CONFLICT DO NOTHING;
  UPDATE fairshare.planning_periods SET revision = input_revision + 1
    WHERE organization_id = org_a AND id = base_period AND revision < input_revision + 1;

  FOR i IN 1..3 LOOP
    center := ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    region := ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    reservation := ('80000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    INSERT INTO fairshare.allocations VALUES (org_a, base_period, plan, region, center, 40, 0, 40) ON CONFLICT DO NOTHING;
    INSERT INTO fairshare.reservations(organization_id, id, period_id, plan_id, region_id, center_id, reserved_kits, fulfilled_kits)
      VALUES (org_a, reservation, base_period, plan, region, center, 40, CASE WHEN i = 1 THEN 40 ELSE 0 END) ON CONFLICT DO NOTHING;
  END LOOP;

  INSERT INTO fairshare.decision_receipts(organization_id, id, period_id, plan_id, payload, canonical_payload, fingerprint, provenance)
    VALUES (org_a, 'c0000000-0000-0000-0000-000000000001', base_period, plan, receipt_text::jsonb, receipt_text,
      encode(sha256(convert_to(receipt_text, 'UTF8')), 'hex'), 'simulated') ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.movements(organization_id, id, period_id, reservation_id, region_id, center_id, reference, provenance, created_by)
    VALUES (org_a, movement, base_period, '80000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
      'SYNTHETIC-shipment-001', 'simulated', actor) ON CONFLICT DO NOTHING;
  FOR i IN 1..3 LOOP
    INSERT INTO fairshare.movement_events(organization_id, id, period_id, movement_id, event_key, event_type,
      quantity_kits, reference_doc, reason, source, provenance, occurred_at, recorded_by)
      VALUES (org_a, ('a0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, base_period, movement,
        ('a1000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
        CASE i WHEN 1 THEN 'dispatch' WHEN 2 THEN 'receipt' ELSE 'collection' END,
        CASE i WHEN 1 THEN 40 WHEN 2 THEN 35 ELSE 25 END,
        'SYNTHETIC-document-' || i, 'SYNTHETIC demonstration only', 'SYNTHETIC event fixture', 'simulated',
        observed + i * interval '1 hour', actor) ON CONFLICT DO NOTHING;
  END LOOP;
  INSERT INTO fairshare.reviews(organization_id, id, period_id, movement_id, reason, created_by, provenance)
    VALUES (org_a, 'b0000000-0000-0000-0000-000000000001', base_period, movement,
      'SYNTHETIC: 5 kits unresolved in transit; 10 kits remain at center. Review signal only.', actor, 'simulated') ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.idempotency_records(organization_id, request_key, period_id, actor_id, payload_hash,
    state, response_status, response_body, completed_at)
    VALUES (org_a, 'e0000000-0000-0000-0000-000000000001', base_period, actor,
      encode(sha256(convert_to(receipt_text, 'UTF8')), 'hex'), 'completed', 200,
      '{"provenance":"simulated","status":"fixture-only"}', observed) ON CONFLICT DO NOTHING;
  INSERT INTO fairshare.audit_events(organization_id, id, period_id, actor_id, action, request_id, details, provenance)
    VALUES (org_a, 'd0000000-0000-0000-0000-000000000001', base_period, actor, 'synthetic_fixture_loaded',
      'e0000000-0000-0000-0000-000000000001', '{"provenance":"simulated","liveAcceptance":false}', 'simulated') ON CONFLICT DO NOTHING;
END;
$$;
COMMIT;
