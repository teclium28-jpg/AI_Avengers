# Shared project skills

23 skill folders are committed under `.agents/skills/`: all 15 Superpowers
skills and eight Sentry skills (code-review, find-bugs, code-simplifier,
iterate-pr, security-review, secret-serialization, gha-security-review,
pr-writer). Supporting files and upstream licenses are retained.

Codex: open this repository in a fresh chat/environment. Root AGENTS.md provides
workflow defaults; relevant skills are discovered and read on demand. Ask Codex
to list accessible skills and read using-superpowers and code-simplifier to
verify discovery. No automatic invocation guarantee or native hook is implied.
Other coding agents may need their own discovery configuration. Do not install
a duplicate global/plugin copy just to use this repository's skills.

LOCAL_POLICY.md documents adaptations: proportionate planning/testing,
project conventions, evidence before deletion, opt-in delegation, and preservation
of user code. manifest.json pins upstream source revisions. These are locally
adapted snapshots; review updates and retain adaptations and licenses.

The root AGENTS.md is maintained by the team. Do not import upstream Sentry
branding or technology choices as this project's defaults.

Scripts are optional, not executed on repository checkout. Read them before use.
PR helpers require authenticated GitHub CLI and uv; other helpers may require
Bash, Node, or Python. Windows may need Git Bash/WSL for shell helpers. Report
missing tools rather than claiming checks passed. No credentials, model config,
local session files, global installer, or machine-specific paths are included.

Validation: 23 names/descriptions and local adaptations checked; supporting files
compared to the prepared bundle; git whitespace checks run. Fresh cloud skill
discovery and behavioral evaluations require a new Codex session.
