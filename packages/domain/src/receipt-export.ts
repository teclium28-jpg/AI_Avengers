import type { DecisionRecord } from './decision.ts';

export const escapeHtml = (text: unknown) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  // Check after stripping leading whitespace, C0/C1 controls, zero-width format marks.
  const visible = text.replace(/^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*/u, '');
  if (/^[=+@-]/.test(visible) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportDecisionCsv(record: DecisionRecord, hash: string): string {
  const rows: unknown[][] = [['period', 'region', 'total_kits', 'new_kits', 'coverage', 'reason', 'fingerprint']];
  for (const a of record.result.allocations) rows.push([record.snapshot.input.periodId, a.regionId, a.allocatedKits, a.newlyAllocatedKits, a.coverage ?? 'N/A', record.choice.reason, hash]);
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function exportDecisionHtml(record: DecisionRecord, hash: string): string {
  const rows = record.result.allocations.map(a => `<tr><td>${escapeHtml(a.regionId)}</td><td>${a.allocatedKits}</td><td>${a.newlyAllocatedKits}</td><td>${a.coverage === null ? 'N/A' : escapeHtml(a.coverage)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>FairShare decision receipt</title><style>body{font:16px system-ui;margin:2rem}table{border-collapse:collapse;width:100%}td,th{border:1px solid #555;padding:.5rem}@media print{body{margin:0}tr{break-inside:avoid}}</style><h1>FairShare decision receipt</h1><p>Period ${escapeHtml(record.snapshot.input.periodId)} · Revision ${record.snapshot.revision} · ${escapeHtml(record.snapshot.provenance)}</p><p>${escapeHtml(record.choice.reason)}</p><table><thead><tr><th>Region</th><th>Total kits</th><th>New kits</th><th>Coverage</th></tr></thead><tbody>${rows}</tbody></table><p>Policy: ${escapeHtml(record.policyVersion)}</p><p>Content fingerprint: ${escapeHtml(hash)}</p><p>A matching hash identifies matching content; it does not establish authenticity.</p></html>`;
}
