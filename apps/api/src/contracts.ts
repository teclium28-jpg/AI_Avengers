import { z } from 'zod';
export const uuid = z.string().uuid();
// PostgreSQL cannot store NUL; reject it here so it is a 422, not an outage.
const noNul = (value: string) => !value.includes('\u0000');
const text = z.string().trim().min(1).max(200).refine(noNul, 'Control character not allowed');
const reason = z.string().trim().min(3).max(1000).refine(noNul, 'Control character not allowed');
// Reports may be delayed, but not dated in the future: the ledger is append-only.
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;
const occurredAt = z.string().datetime({ offset: true }).refine(v => Date.parse(v) <= Date.now() + CLOCK_SKEW_MS, 'Event time is in the future');
const quantity = z.number().int().min(0).max(2147483647);
const provenance = z.enum(['reported', 'simulated']);
export const acceptRequest = z.object({ periodId: uuid, expectedRevision: quantity,
  algorithm: z.enum(['srs-progressive-maxmin', 'hamilton-proportional', 'manual-override']), reason,
  overrides: z.array(z.object({ regionId: text, newlyAllocatedKits: quantity }).strict()).max(100).optional() }).strict()
  .refine(r => r.overrides === undefined || r.algorithm === 'manual-override', { path: ['overrides'], message: 'Overrides require the manual-override algorithm' });
const rawRegion = z.object({ period_id: text, region_id: text, region_name: text, center_id: text,
  demand_kits: text, capacity_kits: text, prior_dispatched_kits: text, status: text, reported_or_simulated: text }).strict();
const rawStock = z.object({ period_id: text, stock_kits: text, stock_type: z.literal('confirmed'), source: text, as_of_date: z.string().datetime({ offset: true }) }).strict();
export const importRequest = z.object({ periodId: uuid, expectedRevision: quantity, provenance,
  regions: z.array(rawRegion).min(1).max(100), stock: rawStock }).strict();
export const eventRequest = z.object({ reservationId: uuid, eventKey: uuid,
  eventType: z.enum(['dispatch','receipt','collection','in_transit','loss_transit','loss_center','return','return_center']),
  quantityKits: quantity, reversesEventId: uuid.optional(), reason, source: text, reference: text,
  provenance, occurredAt }).strict();
export const reviewRequest = z.object({ periodId: uuid, status: z.enum(['open','in_review','resolved','dismissed']), reason, provenance }).strict();
export const pageRequest = z.object({ cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }).strict();
export type AcceptRequest = z.infer<typeof acceptRequest>;
export type ImportRequest = z.infer<typeof importRequest>;
export type EventRequest = z.infer<typeof eventRequest>;
export type ReviewRequest = z.infer<typeof reviewRequest>;
export interface RequestContext { organizationId: string; actorId: string; requestId: string }
export interface WriteResult { status: number; body: Record<string, unknown> }
export class ApiError extends Error {
  status: number; code: string; details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) { super(message); this.status = status; this.code = code; this.details = details; }
}
