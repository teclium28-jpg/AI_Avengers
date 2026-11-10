BEGIN;

-- Provision login passwords separately. Neither role owns tables or bypasses RLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fairshare_runtime') THEN
    CREATE ROLE fairshare_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='fairshare_writer') THEN
    CREATE ROLE fairshare_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;

ALTER TABLE fairshare.plans DROP CONSTRAINT plans_algorithm_check;
ALTER TABLE fairshare.plans ADD CHECK (algorithm IN ('srs-progressive-maxmin','hamilton-proportional','manual-override'));
ALTER TABLE fairshare.movement_events DROP CONSTRAINT movement_events_event_type_check;
ALTER TABLE fairshare.movement_events DROP CONSTRAINT movement_events_quantity_kits_check;
ALTER TABLE fairshare.movement_events ADD CHECK (event_type IN ('dispatch','receipt','collection','in_transit','loss_transit','loss_center','return','return_center'));
ALTER TABLE fairshare.movement_events ADD CHECK (quantity_kits > 0 OR event_type IN ('receipt','collection','in_transit'));
ALTER TABLE fairshare.movement_events ADD COLUMN append_order bigint GENERATED ALWAYS AS IDENTITY;
-- Completed rejected reports must also be replayable without accepting the bad fact.
ALTER TABLE fairshare.idempotency_records DROP CONSTRAINT idempotency_records_check;
ALTER TABLE fairshare.idempotency_records ADD CHECK (
 (state='pending' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL) OR
 (state='completed' AND response_status BETWEEN 200 AND 499 AND response_body IS NOT NULL
  AND jsonb_typeof(response_body)='object' AND completed_at IS NOT NULL));

CREATE TABLE fairshare.conflicting_reports (
 organization_id uuid NOT NULL, id uuid NOT NULL DEFAULT gen_random_uuid(),
 period_id uuid NOT NULL, movement_id uuid NOT NULL, event_key uuid NOT NULL,
 actor_id uuid NOT NULL, payload jsonb NOT NULL, findings jsonb NOT NULL,
 review_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(organization_id,id), UNIQUE(organization_id,event_key),
 FOREIGN KEY(organization_id,period_id,movement_id) REFERENCES fairshare.movements(organization_id,period_id,id),
 FOREIGN KEY(organization_id,actor_id) REFERENCES fairshare.memberships(organization_id,id),
 FOREIGN KEY(organization_id,review_id) REFERENCES fairshare.reviews(organization_id,id)
);
CREATE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON fairshare.conflicting_reports FOR EACH ROW EXECUTE FUNCTION fairshare.reject_history_change();
CREATE TRIGGER immutable_truncate BEFORE TRUNCATE ON fairshare.conflicting_reports FOR EACH STATEMENT EXECUTE FUNCTION fairshare.reject_history_change();
CREATE INDEX conflicting_reports_movement ON fairshare.conflicting_reports(organization_id,movement_id,recorded_at);
CREATE TABLE fairshare.api_rate_limits (
 organization_id uuid NOT NULL, actor_id uuid NOT NULL, minute bigint NOT NULL, requests integer NOT NULL,
 PRIMARY KEY(organization_id,actor_id,minute),
 FOREIGN KEY(organization_id,actor_id) REFERENCES fairshare.memberships(organization_id,id)
);

-- Membership visibility is self-only and independent of role lookup, avoiding RLS recursion.
DROP POLICY tenant_context ON fairshare.memberships;
CREATE POLICY self_membership ON fairshare.memberships
 USING(organization_id=fairshare.current_organization_id() AND user_id=fairshare.current_actor_id())
 WITH CHECK(false);
CREATE FUNCTION fairshare.actor_role() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT role FROM fairshare.memberships WHERE organization_id=fairshare.current_organization_id()
 AND user_id=fairshare.current_actor_id() AND active;
$$;
CREATE FUNCTION fairshare.actor_membership() RETURNS uuid LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT id FROM fairshare.memberships WHERE organization_id=fairshare.current_organization_id()
 AND user_id=fairshare.current_actor_id() AND active;
$$;
CREATE FUNCTION fairshare.can_access_center(center uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(fairshare.actor_role() IN ('coordinator','reviewer') OR
  (fairshare.actor_role()='operator' AND EXISTS(SELECT FROM fairshare.center_operators
   WHERE organization_id=fairshare.current_organization_id() AND center_id=center
   AND membership_id=fairshare.actor_membership())),false);
$$;
DROP POLICY tenant_context ON fairshare.center_operators;
CREATE POLICY own_assignment ON fairshare.center_operators USING (
 organization_id=fairshare.current_organization_id() AND membership_id=fairshare.actor_membership()) WITH CHECK(false);

DO $$ DECLARE t text; orgcol text; scope text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='fairshare' AND tablename NOT IN ('memberships','center_operators') LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_context ON fairshare.%I',t);
  EXECUTE format('ALTER TABLE fairshare.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE fairshare.%I FORCE ROW LEVEL SECURITY',t);
  orgcol := CASE WHEN t='organizations' THEN 'id' ELSE 'organization_id' END;
  scope := CASE
   WHEN t IN ('movements','reservations','capacity_records','period_regions','allocations') THEN 'fairshare.can_access_center(center_id)'
   WHEN t='centers' THEN 'fairshare.can_access_center(id)'
   WHEN t IN ('movement_events','conflicting_reports') THEN format('EXISTS (SELECT FROM fairshare.movements m WHERE m.organization_id=%I.organization_id AND m.id=%I.movement_id)',t,t)
   WHEN t='reviews' THEN 'fairshare.actor_role() IN (''coordinator'',''reviewer'') OR EXISTS (SELECT FROM fairshare.movements m WHERE m.organization_id=reviews.organization_id AND m.id=reviews.movement_id)'
   WHEN t='audit_events' THEN 'fairshare.actor_role() IN (''coordinator'',''reviewer'') OR actor_id=fairshare.actor_membership()'
   WHEN t IN ('idempotency_records','api_rate_limits') THEN 'actor_id=fairshare.actor_membership()'
   WHEN t='planning_periods' THEN 'fairshare.actor_role() IS NOT NULL'
   ELSE 'fairshare.actor_role() IN (''coordinator'',''reviewer'')' END;
  EXECUTE format('CREATE POLICY tenant_member ON fairshare.%I USING (%I=fairshare.current_organization_id() AND (%s)) WITH CHECK (%I=fairshare.current_organization_id() AND (%s))',t,orgcol,scope,orgcol,scope);
 END LOOP;
END $$;

GRANT USAGE ON SCHEMA fairshare TO fairshare_runtime,fairshare_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA fairshare TO fairshare_runtime,fairshare_writer;
-- No direct runtime table writes, no membership/assignment management.
GRANT INSERT ON fairshare.centers,fairshare.regions,fairshare.period_regions,fairshare.stock_records,
 fairshare.demand_records,fairshare.capacity_records,fairshare.input_snapshots,fairshare.plans,
 fairshare.allocations,fairshare.reservations,fairshare.decision_receipts,fairshare.movements,
 fairshare.movement_events,fairshare.reviews,fairshare.idempotency_records,fairshare.audit_events,
 fairshare.conflicting_reports,fairshare.api_rate_limits TO fairshare_writer;
GRANT UPDATE ON fairshare.planning_periods,fairshare.reservations,fairshare.reviews,
 fairshare.idempotency_records,fairshare.api_rate_limits TO fairshare_writer;
-- Required for FOR SHARE only; RLS WITH CHECK(false) prevents actual membership writes.
GRANT UPDATE ON fairshare.memberships,fairshare.center_operators TO fairshare_writer;
GRANT DELETE ON fairshare.api_rate_limits TO fairshare_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA fairshare TO fairshare_writer;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA fairshare TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.current_organization_id(),fairshare.current_actor_id(),fairshare.actor_role(),fairshare.actor_membership(),fairshare.can_access_center(uuid) TO fairshare_runtime;

CREATE FUNCTION fairshare.authorize(allowed text[], center uuid DEFAULT NULL) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE m fairshare.memberships%ROWTYPE;
BEGIN
 SELECT * INTO m FROM fairshare.memberships WHERE organization_id=fairshare.current_organization_id()
  AND user_id=fairshare.current_actor_id() AND active FOR SHARE;
 IF NOT FOUND OR NOT(m.role=ANY(allowed)) THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 IF m.role='operator' THEN
  PERFORM 1 FROM fairshare.center_operators WHERE organization_id=m.organization_id AND membership_id=m.id AND center_id=center FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'center permission denied' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN m.id;
END $$;
ALTER FUNCTION fairshare.authorize(text[],uuid) OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.authorize(text[],uuid) TO fairshare_runtime;

CREATE FUNCTION fairshare.lock_period(period uuid) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r integer; BEGIN
 IF fairshare.actor_role() IS NULL THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 SELECT revision INTO r FROM fairshare.planning_periods WHERE organization_id=fairshare.current_organization_id() AND id=period AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'period missing or closed' USING ERRCODE='P0002'; END IF;
 RETURN r;
END $$;
ALTER FUNCTION fairshare.lock_period(uuid) OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.lock_period(uuid) TO fairshare_runtime;

CREATE FUNCTION fairshare.claim_request(period uuid, key uuid, hash text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved fairshare.idempotency_records%ROWTYPE; actor uuid; BEGIN
 actor:=fairshare.actor_membership();
 IF actor IS NULL THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 INSERT INTO fairshare.idempotency_records(organization_id,request_key,period_id,actor_id,payload_hash)
 VALUES(fairshare.current_organization_id(),key,period,actor,hash) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN NULL; END IF;
 SELECT * INTO saved FROM fairshare.idempotency_records WHERE organization_id=fairshare.current_organization_id() AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'key belongs to another actor' USING ERRCODE='42501'; END IF;
 IF saved.actor_id<>actor THEN RAISE EXCEPTION 'key belongs to another actor' USING ERRCODE='42501'; END IF;
 IF saved.payload_hash<>hash OR saved.period_id<>period THEN RAISE EXCEPTION 'key payload mismatch' USING ERRCODE='22023'; END IF;
 IF saved.state<>'completed' THEN RAISE EXCEPTION 'incomplete request' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('status',saved.response_status,'body',saved.response_body);
END $$;
ALTER FUNCTION fairshare.claim_request(uuid,uuid,text) OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.claim_request(uuid,uuid,text) TO fairshare_runtime;

CREATE FUNCTION fairshare.finish_request(key uuid, status integer, body jsonb) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE fairshare.idempotency_records SET state='completed',response_status=status,response_body=body,completed_at=now()
 WHERE organization_id=fairshare.current_organization_id() AND request_key=key AND actor_id=fairshare.actor_membership() AND state='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'request claim missing' USING ERRCODE='42501'; END IF;
END $$;
ALTER FUNCTION fairshare.finish_request(uuid,integer,jsonb) OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.finish_request(uuid,integer,jsonb) TO fairshare_runtime;

CREATE FUNCTION fairshare.take_rate_limit() RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE n integer; minute_now bigint:=floor(extract(epoch FROM clock_timestamp())/60); actor uuid:=fairshare.actor_membership(); BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'permission denied' USING ERRCODE='42501'; END IF;
 DELETE FROM fairshare.api_rate_limits WHERE organization_id=fairshare.current_organization_id() AND actor_id=actor AND minute<minute_now-1;
 INSERT INTO fairshare.api_rate_limits VALUES(fairshare.current_organization_id(),actor,minute_now,1)
 ON CONFLICT(organization_id,actor_id,minute) DO UPDATE SET requests=fairshare.api_rate_limits.requests+1 RETURNING requests INTO n;
 RETURN n<=120;
END $$;
ALTER FUNCTION fairshare.take_rate_limit() OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.take_rate_limit() TO fairshare_runtime;

-- Only allow-listed operations have write authority; payloads never become SQL text.
CREATE FUNCTION fairshare.write_record(operation text, p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE org uuid:=fairshare.current_organization_id(); actor uuid; period uuid:=(p->>'periodId')::uuid;
 r integer; item jsonb; center uuid; region uuid; snap uuid; plan uuid; receipt uuid;
 reservation fairshare.reservations%ROWTYPE; movement fairshare.movements%ROWTYPE;
 review uuid; prior numeric; revision_value integer; event_id uuid;
BEGIN
 IF operation IN ('event','conflict','movement','open_review') THEN
  SELECT * INTO reservation FROM fairshare.reservations WHERE organization_id=org AND id=(p->>'reservationId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found' USING ERRCODE='P0002'; END IF;
  period:=reservation.period_id;
  actor:=fairshare.authorize(CASE WHEN operation='event' AND (p->>'eventType'='dispatch' OR p->>'reversesEventId' IS NOT NULL) THEN ARRAY['coordinator'] ELSE ARRAY['coordinator','operator'] END,reservation.center_id);
 ELSIF operation='review' THEN actor:=fairshare.authorize(ARRAY['coordinator','reviewer']);
 ELSE actor:=fairshare.authorize(ARRAY['coordinator']); END IF;
 r:=fairshare.lock_period(period);
 -- Reload after waiting for the period lock: input changes may release this
 -- reservation while the caller waits.
 IF reservation.id IS NOT NULL THEN
  SELECT * INTO reservation FROM fairshare.reservations WHERE organization_id=org AND id=reservation.id;
 END IF;

 IF operation='import' THEN
  IF r<>(p->>'expectedRevision')::integer THEN RAISE EXCEPTION 'stale revision' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT FROM fairshare.period_regions pr JOIN fairshare.regions rg ON rg.organization_id=org AND rg.id=pr.region_id WHERE pr.organization_id=org AND pr.period_id=period AND NOT EXISTS(SELECT FROM jsonb_array_elements(p->'input'->'regions') x WHERE x->>'regionId'=rg.code)) THEN RAISE EXCEPTION 'import omits an assigned region' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'input'->'regions') LOOP
   INSERT INTO fairshare.centers(organization_id,code,name,provenance) VALUES(org,item->>'centerId',item->>'centerId',item->>'provenance') ON CONFLICT(organization_id,code) DO NOTHING;
   SELECT id INTO center FROM fairshare.centers WHERE organization_id=org AND code=item->>'centerId';
   INSERT INTO fairshare.regions(organization_id,code,name,provenance) VALUES(org,item->>'regionId',item->>'regionName',item->>'provenance') ON CONFLICT(organization_id,code) DO NOTHING;
   SELECT id INTO region FROM fairshare.regions WHERE organization_id=org AND code=item->>'regionId';
   INSERT INTO fairshare.period_regions VALUES(org,period,region,center) ON CONFLICT DO NOTHING;
   IF NOT EXISTS(SELECT FROM fairshare.period_regions WHERE organization_id=org AND period_id=period AND region_id=region AND center_id=center) THEN RAISE EXCEPTION 'assignment cannot change in an existing period' USING ERRCODE='22023'; END IF;
   SELECT coalesce(sum(CASE WHEN e.reverses_event_id IS NULL THEN e.quantity_kits ELSE -e.quantity_kits END),0) INTO prior FROM fairshare.movement_events e JOIN fairshare.movements m ON m.organization_id=org AND m.id=e.movement_id WHERE e.organization_id=org AND e.period_id=period AND e.event_type='dispatch' AND m.region_id=region;
   IF prior<>(item->>'priorDispatchedKits')::numeric THEN RAISE EXCEPTION 'import prior differs from ledger' USING ERRCODE='22023'; END IF;
   SELECT coalesce(max(revision),0)+1 INTO revision_value FROM fairshare.demand_records WHERE organization_id=org AND period_id=period AND region_id=region;
   INSERT INTO fairshare.demand_records(organization_id,period_id,region_id,revision,period_revision,quantity_kits,source,observed_at,provenance,recorded_by)
   VALUES(org,period,region,revision_value,1,(item->>'demandKits')::numeric,p->>'source',(p->>'observedAt')::timestamptz,item->>'provenance',actor);
   SELECT coalesce(max(revision),0)+1 INTO revision_value FROM fairshare.capacity_records WHERE organization_id=org AND period_id=period AND center_id=center;
   INSERT INTO fairshare.capacity_records(organization_id,period_id,center_id,revision,period_revision,quantity_kits,is_closed,source,observed_at,provenance,recorded_by)
   VALUES(org,period,center,revision_value,1,(item->>'capacityKits')::numeric,item->>'status'='closed',p->>'source',(p->>'observedAt')::timestamptz,item->>'provenance',actor);
  END LOOP;
  SELECT coalesce(max(revision),0)+1 INTO revision_value FROM fairshare.stock_records WHERE organization_id=org AND period_id=period AND stock_type='confirmed';
  INSERT INTO fairshare.stock_records(organization_id,period_id,revision,period_revision,stock_type,quantity_kits,source,observed_at,provenance,recorded_by)
  VALUES(org,period,revision_value,1,'confirmed',(p->'input'->>'stockKits')::numeric,p->>'source',(p->>'observedAt')::timestamptz,p->>'provenance',actor);
  UPDATE fairshare.reservations SET released_kits=reserved_kits-fulfilled_kits WHERE organization_id=org AND period_id=period;

 ELSIF operation='accept' THEN
  IF r<>(p->>'expectedRevision')::integer OR r<>(p->'record'->'snapshot'->>'revision')::integer THEN RAISE EXCEPTION 'stale revision' USING ERRCODE='40001'; END IF;
  snap:=gen_random_uuid(); plan:=(p->>'planId')::uuid; receipt:=(p->>'receiptId')::uuid;
  INSERT INTO fairshare.input_snapshots(organization_id,id,period_id,revision,payload,canonical_payload,fingerprint,assumptions,provenance)
  VALUES(org,snap,period,r,p->'record'->'snapshot',p->>'snapshotCanonical',p->>'snapshotHash',p->'record'->'snapshot'->'assumptions',p->>'provenance');
  INSERT INTO fairshare.plans(organization_id,id,period_id,snapshot_id,input_revision,accepted_revision,algorithm,engine_version,policy_version,accepted_by,reason,provenance)
  VALUES(org,plan,period,snap,r,r+1,p->'record'->'choice'->>'algorithm',p->'record'->>'engineVersion',p->'record'->>'policyVersion',actor,p->'record'->'choice'->>'reason',p->>'provenance');
  UPDATE fairshare.reservations SET released_kits=reserved_kits-fulfilled_kits WHERE organization_id=org AND period_id=period;
  FOR item IN SELECT * FROM jsonb_array_elements(p->'record'->'result'->'allocations') LOOP
   SELECT rg.id,pr.center_id INTO region,center FROM fairshare.regions rg JOIN fairshare.period_regions pr ON pr.organization_id=org AND pr.region_id=rg.id AND pr.period_id=period WHERE rg.organization_id=org AND rg.code=item->>'regionId';
   INSERT INTO fairshare.allocations VALUES(org,period,plan,region,center,(item->>'allocatedKits')::numeric,(item->>'allocatedKits')::numeric-(item->>'newlyAllocatedKits')::numeric,(item->>'newlyAllocatedKits')::numeric);
   INSERT INTO fairshare.reservations(organization_id,period_id,plan_id,region_id,center_id,reserved_kits) VALUES(org,period,plan,region,center,(item->>'newlyAllocatedKits')::numeric);
  END LOOP;
  INSERT INTO fairshare.decision_receipts(organization_id,id,period_id,plan_id,payload,canonical_payload,fingerprint,provenance)
  VALUES(org,receipt,period,plan,p->'record',p->>'canonical',p->>'hash',p->>'provenance');
  UPDATE fairshare.planning_periods SET revision=revision+1 WHERE organization_id=org AND id=period;

 ELSIF operation='movement' THEN
  INSERT INTO fairshare.movements(organization_id,id,period_id,reservation_id,region_id,center_id,reference,provenance,created_by)
  VALUES(org,(p->>'movementId')::uuid,period,reservation.id,reservation.region_id,reservation.center_id,p->>'reference',p->>'provenance',actor) ON CONFLICT DO NOTHING;
  IF NOT EXISTS(SELECT FROM fairshare.movements WHERE organization_id=org AND id=(p->>'movementId')::uuid AND reservation_id=reservation.id) THEN RAISE EXCEPTION 'movement binding mismatch' USING ERRCODE='22023'; END IF;

 ELSIF operation='event' THEN
  SELECT * INTO movement FROM fairshare.movements WHERE organization_id=org AND id=(p->>'movementId')::uuid AND reservation_id=reservation.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'movement not found' USING ERRCODE='P0002'; END IF;
  IF p->>'eventType'='dispatch' THEN
   prior:=(p->>'quantityKits')::numeric * CASE WHEN p->>'reversesEventId' IS NULL THEN 1 ELSE -1 END;
   IF prior>0 AND (reservation.released_kits>0 OR NOT EXISTS(SELECT FROM fairshare.plans WHERE organization_id=org AND period_id=period AND id=reservation.plan_id AND accepted_revision=(SELECT max(accepted_revision) FROM fairshare.plans WHERE organization_id=org AND period_id=period))) THEN RAISE EXCEPTION 'reservation superseded' USING ERRCODE='40001'; END IF;
   UPDATE fairshare.reservations SET fulfilled_kits=fulfilled_kits+prior WHERE organization_id=org AND id=reservation.id;
  END IF;
  event_id:=(p->>'id')::uuid;
  INSERT INTO fairshare.movement_events(organization_id,id,period_id,movement_id,event_key,event_type,quantity_kits,reverses_event_id,reference_doc,reason,source,provenance,occurred_at,recorded_by)
  VALUES(org,event_id,period,movement.id,(p->>'eventKey')::uuid,p->>'eventType',(p->>'quantityKits')::numeric,(p->>'reversesEventId')::uuid,p->>'reference',p->>'reason',p->>'source',p->>'provenance',(p->>'occurredAt')::timestamptz,actor);

 ELSIF operation='conflict' THEN
  review:=gen_random_uuid();
  INSERT INTO fairshare.reviews(organization_id,id,period_id,movement_id,reason,created_by,provenance) VALUES(org,review,period,(p->>'movementId')::uuid,'Conflicting report requires review',actor,p->>'provenance');
  INSERT INTO fairshare.conflicting_reports(organization_id,period_id,movement_id,event_key,actor_id,payload,findings,review_id)
  VALUES(org,period,(p->>'movementId')::uuid,(p->>'eventKey')::uuid,actor,p->'report',p->'findings',review);
 ELSIF operation='open_review' THEN
  review:=gen_random_uuid();
  INSERT INTO fairshare.reviews(organization_id,id,period_id,movement_id,reason,created_by,provenance) VALUES(org,review,period,(p->>'movementId')::uuid,p->>'reason',actor,p->>'provenance');
 ELSIF operation='review' THEN
  UPDATE fairshare.reviews SET status=p->>'status',resolution_reason=CASE WHEN p->>'status' IN ('resolved','dismissed') THEN p->>'reason' END,
   resolved_by=CASE WHEN p->>'status' IN ('resolved','dismissed') THEN actor END,resolved_at=CASE WHEN p->>'status' IN ('resolved','dismissed') THEN now() END,updated_at=now()
  WHERE organization_id=org AND id=(p->>'reviewId')::uuid AND period_id=period;
  IF NOT FOUND THEN RAISE EXCEPTION 'review not found' USING ERRCODE='P0002'; END IF;
 ELSE RAISE EXCEPTION 'unknown operation' USING ERRCODE='22023'; END IF;
 INSERT INTO fairshare.audit_events(organization_id,period_id,actor_id,action,request_id,details,provenance)
 VALUES(org,period,actor,operation,(p->>'requestId')::uuid,jsonb_build_object('planId',plan,'movementId',p->>'movementId','reviewId',coalesce(review,(p->>'reviewId')::uuid),'reason',p->>'reason','status',p->>'status'),p->>'provenance');
 SELECT revision INTO r FROM fairshare.planning_periods WHERE organization_id=org AND id=period;
 RETURN jsonb_build_object('revision',r,'planId',plan,'receiptId',receipt,'reviewId',review);
END $$;
ALTER FUNCTION fairshare.write_record(text,jsonb) OWNER TO fairshare_writer;
GRANT EXECUTE ON FUNCTION fairshare.write_record(text,jsonb) TO fairshare_runtime;
REVOKE ALL ON fairshare.api_rate_limits FROM fairshare_runtime;
REVOKE EXECUTE ON FUNCTION fairshare.authorize(text[],uuid),fairshare.lock_period(uuid),fairshare.claim_request(uuid,uuid,text),fairshare.finish_request(uuid,integer,jsonb),fairshare.take_rate_limit(),fairshare.write_record(text,jsonb) FROM PUBLIC;
COMMIT;
