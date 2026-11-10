export type MovementType = 'dispatch' | 'receipt' | 'collection' | 'in_transit' | 'loss_transit' | 'loss_center' | 'return' | 'return_center';
export interface LedgerEvent {
  id: string; eventType: MovementType; quantityKits: number; reversesEventId?: string | null;
  occurredAt: string; recordedAt: string; reason: string; source: string;
}
/** Input is append order; source occurrence time is evidence, never silently reordered. */
export function reconcile(events: readonly LedgerEvent[]) {
  const findings: { code: string; eventId: string; message: string }[] = [];
  const byId = new Map<string, LedgerEvent>(), cancelled = new Set<string>();
  for (const e of events) {
    if (byId.has(e.id)) findings.push({ code: 'DUPLICATE_EVENT', eventId: e.id, message: 'Event ID must be unique.' });
    if (!Number.isSafeInteger(e.quantityKits) || e.quantityKits < 0 || (e.quantityKits === 0 && !['receipt', 'collection', 'in_transit'].includes(e.eventType))) findings.push({ code: 'INVALID_QUANTITY', eventId: e.id, message: 'Invalid movement quantity.' });
    if (e.reversesEventId) {
      const original = byId.get(e.reversesEventId);
      if (!original || original.reversesEventId || cancelled.has(original.id) || original.eventType !== e.eventType || original.quantityKits !== e.quantityKits) findings.push({ code: 'INVALID_REVERSAL', eventId: e.id, message: 'Correction must reverse one earlier original exactly once.' });
      else cancelled.add(original.id);
    }
    byId.set(e.id, e);
  }
  const active = events.filter(e => !e.reversesEventId && !cancelled.has(e.id));
  const sums: Record<MovementType, number> = { dispatch: 0, receipt: 0, collection: 0, in_transit: 0, loss_transit: 0, loss_center: 0, return: 0, return_center: 0 };
  let inTransit: number | null = null;
  for (const e of active) {
    if (!Object.hasOwn(sums, e.eventType)) { findings.push({ code: 'INVALID_TYPE', eventId: e.id, message: 'Unknown event type.' }); continue; }
    if (e.eventType === 'in_transit') inTransit = e.quantityKits;
    else sums[e.eventType] += e.quantityKits;
    if (['dispatch', 'receipt', 'loss_transit', 'return'].includes(e.eventType)) inTransit = null;
    const transport = sums.dispatch - sums.receipt - sums.loss_transit - sums.return;
    const center = sums.receipt - sums.collection - sums.loss_center - sums.return_center;
    if (transport < 0 || center < 0 || (inTransit !== null && inTransit > transport)) findings.push({ code: 'IMPOSSIBLE_BALANCE', eventId: e.id, message: 'Reported events exceed the available transport or center balance.' });
  }
  const transportBalanceKits = sums.dispatch - sums.receipt - sums.loss_transit - sums.return;
  const centerBalanceKits = sums.receipt - sums.collection - sums.loss_center - sums.return_center;
  return { valid: findings.length === 0, findings, dispatchedKits: sums.dispatch,
    receiptReportedKits: active.some(e => e.eventType === 'receipt') ? sums.receipt : null,
    collectionReportedKits: active.some(e => e.eventType === 'collection') ? sums.collection : null,
    transportBalanceKits, centerBalanceKits, reportedInTransitKits: inTransit,
    unexplainedTransportKits: transportBalanceKits - (inTransit ?? 0),
    knownLossKits: sums.loss_transit + sums.loss_center, returnedKits: sums.return + sums.return_center,
    timeline: events.map(e => ({ ...e, state: e.reversesEventId ? 'correction' : cancelled.has(e.id) ? 'reversed' : 'active' })) };
}
