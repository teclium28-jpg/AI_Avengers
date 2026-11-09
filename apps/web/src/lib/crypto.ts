/**
 * Deterministic canonical JSON serialization and SHA-256 fingerprint generation.
 * Follows FairShare specification in docs/FRONTEND.md Section 5.5.
 */

function sortKeys(val: any): any {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sortKeys);
  }
  const sortedObj: Record<string, any> = {};
  const keys = Object.keys(val).sort();
  for (const key of keys) {
    sortedObj[key] = sortKeys(val[key]);
  }
  return sortedObj;
}

export function canonicalJsonStringify(data: any): string {
  const sorted = sortKeys(data);
  return JSON.stringify(sorted);
}

export async function computeSha256Fingerprint(data: any): Promise<string> {
  const canonicalString = canonicalJsonStringify(data);
  const encoder = new TextEncoder();
  const buffer = encoder.encode(canonicalString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex;
}
