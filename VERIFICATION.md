# Verification

Verified locally on September 5, 2026 with Node 24.12.0 and Obsidian 1.13.7 on macOS.

## Automated checks

`npm run build` type-checks and bundles the desktop plugin. `npm test` covers 48 scenarios across six suites:

| Area | Evidence |
|---|---|
| Weighted goals | Conservation at each level; converging paths; multiple missions and importance; invalid totals, cycles, duplicate edges/IDs, and cross-level connections; Unsorted behavior |
| Ranking and Today | Normalized weights, boundaries, effective target dates, deterministic ties, blocked/snoozed exclusions, daily capacity, date rollover, bounded sessions and consumed estimates |
| Output and effort | First-session snapshots, history stability, completion/reopening/recompletion, output awarded once, logged-versus-estimated effort without duplication |
| Markdown | Round trips, unknown properties and user prose, duplicate capture text, stable identifiers, interruption recovery, canonical/source edits, renames, concurrent updates and graph approval archives |
| Models | LM Studio/OpenAI/Anthropic request contracts; complexity routing; local/cloud failures, confidence gates, malformed JSON, unknown goals, retries, budget reservations and cache invalidation |
| Service and UI | Capture → enrichment → session → completion → restart; stale results; offline retention; Markdown status edits; accessible controls; text injection protection; preserved capture drafts |

Provider tests use mocked transports. No live cloud requests were made, and the local LM Studio server was not running. Live inference requires the user's chosen model IDs, LM Studio server, and optional cloud credentials/prices/budget.

## Native Obsidian checks

Used an isolated `test-vault` copied from the fictional example vault. The user's existing vault was not modified.

- Enabled the authored Noiseless plugin after explicit user confirmation.
- Inspected Today, Everything, and Progress in Obsidian.
- Captured `QA: prepare the sponsor follow-up` through Everything; verified its canonical Markdown task and pending status with models disabled.
- Logged a 35-minute session for the fictional sponsor task: remaining capacity changed from 160 to 125 minutes.
- Completed that task: all-time output changed from 538 to 610 points, completed count from 10 to 11, and logged effort from 425 to 460 minutes. The task's Markdown stores its 72-point frozen snapshot and completion event.
- Inspected light and dark rendering. The plain Markdown snapshots remain available as collapsible native callouts.
- Reopened the vault and verified persisted task data.

The native automation sometimes returned stale window snapshots. Fresh accessibility queries resolved interaction checks; no frozen-window conclusion was inferred from those stale results.

## Narrow layout checks

`node scripts/preview.mjs` generates an offline visual fixture from the same production Dashboard and stylesheet, with in-memory fictional data and no network calls. Open `artifacts/visual/matrix.html` to inspect the matrix.

Inspected Today, Everything, and Progress in both light and dark mode at a 360-pixel container width. All six reported zero overflowing visible elements. Container queries support narrow Obsidian splits even when the outer window is wide.

## Distribution

The release contains an installable plugin ZIP, an empty starter vault, and a separate fictional example vault. Archives are checked for integrity and inclusion of the current build. No API keys or private task data are included. The starter leaves capacities and model IDs for one-time user setup.
