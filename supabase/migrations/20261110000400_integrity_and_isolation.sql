BEGIN;

CREATE FUNCTION fairshare.reject_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'historical facts are immutable; append a new revision or reversal'
    USING ERRCODE = '23514';
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'period_regions', 'stock_records', 'demand_records', 'capacity_records',
    'input_snapshots', 'plans', 'allocations', 'decision_receipts',
    'movements', 'movement_events', 'audit_events'
  ] LOOP
    EXECUTE format('CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON fairshare.%I
      FOR EACH ROW EXECUTE FUNCTION fairshare.reject_history_change()', table_name);
    EXECUTE format('CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON fairshare.%I
      FOR EACH STATEMENT EXECUTE FUNCTION fairshare.reject_history_change()', table_name);
  END LOOP;
END;
$$;

-- UPDATE takes the same row lock that acceptance will acquire. Failure rolls it back.
CREATE FUNCTION fairshare.advance_input_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  UPDATE fairshare.planning_periods SET revision = revision + 1
    WHERE organization_id = NEW.organization_id AND id = NEW.period_id AND status = 'open'
    RETURNING revision INTO NEW.period_revision;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'input requires an existing open planning period' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER stock_period_revision BEFORE INSERT ON fairshare.stock_records
  FOR EACH ROW EXECUTE FUNCTION fairshare.advance_input_revision();
CREATE TRIGGER demand_period_revision BEFORE INSERT ON fairshare.demand_records
  FOR EACH ROW EXECUTE FUNCTION fairshare.advance_input_revision();
CREATE TRIGGER capacity_period_revision BEFORE INSERT ON fairshare.capacity_records
  FOR EACH ROW EXECUTE FUNCTION fairshare.advance_input_revision();

CREATE FUNCTION fairshare.check_movement_event() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE original fairshare.movement_events%ROWTYPE;
BEGIN
  IF NEW.reverses_event_id IS NOT NULL THEN
    SELECT * INTO original FROM fairshare.movement_events
      WHERE organization_id = NEW.organization_id AND movement_id = NEW.movement_id
        AND id = NEW.reverses_event_id;
    IF NOT FOUND OR original.reverses_event_id IS NOT NULL
        OR original.event_type <> NEW.event_type OR original.quantity_kits <> NEW.quantity_kits THEN
      RAISE EXCEPTION 'reversal must exactly reverse an original event in the same movement'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_event BEFORE INSERT ON fairshare.movement_events
  FOR EACH ROW EXECUTE FUNCTION fairshare.check_movement_event();

CREATE FUNCTION fairshare.advance_dispatch_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.event_type = 'dispatch' THEN
    UPDATE fairshare.planning_periods SET revision = revision + 1
      WHERE organization_id = NEW.organization_id AND id = NEW.period_id AND status = 'open';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'dispatch requires an open planning period' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER dispatch_period_revision AFTER INSERT ON fairshare.movement_events
  FOR EACH ROW EXECUTE FUNCTION fairshare.advance_dispatch_revision();

CREATE FUNCTION fairshare.protect_idempotency_binding() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'idempotency records cannot be deleted' USING ERRCODE = '23514';
  END IF;
  IF OLD.state = 'completed' OR
      ROW(OLD.organization_id, OLD.request_key, OLD.period_id, OLD.actor_id, OLD.payload_hash, OLD.created_at)
        IS DISTINCT FROM
      ROW(NEW.organization_id, NEW.request_key, NEW.period_id, NEW.actor_id, NEW.payload_hash, NEW.created_at) THEN
    RAISE EXCEPTION 'idempotency binding and completed result are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_binding BEFORE UPDATE OR DELETE ON fairshare.idempotency_records
  FOR EACH ROW EXECUTE FUNCTION fairshare.protect_idempotency_binding();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON fairshare.idempotency_records
  FOR EACH STATEMENT EXECUTE FUNCTION fairshare.reject_history_change();

-- Claims cannot survive their transaction without the saved response.
CREATE FUNCTION fairshare.require_completed_idempotency() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE saved_state text;
BEGIN
  SELECT state INTO saved_state FROM fairshare.idempotency_records
    WHERE organization_id = NEW.organization_id AND request_key = NEW.request_key;
  -- Missing visibility must fail closed too: RLS context may have been cleared.
  IF NOT FOUND OR saved_state <> 'completed' THEN
    RAISE EXCEPTION 'idempotency claim must complete in the same transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER complete_claim AFTER INSERT OR UPDATE ON fairshare.idempotency_records
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fairshare.require_completed_idempotency();

CREATE FUNCTION fairshare.current_organization_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('app.org_id', true), '')::uuid;
$$;
CREATE FUNCTION fairshare.current_actor_id() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')::uuid;
$$;

DO $$
DECLARE table_name text; org_column text;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'fairshare' LOOP
    org_column := CASE WHEN table_name = 'organizations' THEN 'id' ELSE 'organization_id' END;
    EXECUTE format('ALTER TABLE fairshare.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE fairshare.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_context ON fairshare.%I
      USING (%I = fairshare.current_organization_id() AND fairshare.current_actor_id() IS NOT NULL)
      WITH CHECK (%I = fairshare.current_organization_id() AND fairshare.current_actor_id() IS NOT NULL)',
      table_name, org_column, org_column);
  END LOOP;
END;
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA fairshare FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA fairshare FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fairshare REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA fairshare REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

COMMIT;
