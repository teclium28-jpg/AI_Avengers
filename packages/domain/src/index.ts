// Shared domain models and allocation engines.
// The progressive max-min fairness engine (context.md "A.") is not implemented yet —
// this package currently exports the data-preparation pipeline and the comparison
// baseline only. See docs/data-preparation.md.

export * from "./types.ts";
export * from "./preprocessing.ts";
export * from "./baseline.ts";
export * from "./fairness.ts";
