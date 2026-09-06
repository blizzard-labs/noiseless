# Noiseless

Capture everything. Make room for what matters. See your progress.

A desktop Obsidian plugin with three quiet, visual Markdown views: **Everything**, **Today**, and **Progress**. LM Studio handles local inference; optional OpenAI and Anthropic adapters handle harder work. A deterministic algorithm applies your weights to model-generated scores.

## Start here

Requires **Obsidian 1.13.1+** on desktop. The vault is usable in plain Markdown; the plugin adds interactive views.

1. Open `starter-vault` as a vault in Obsidian. Enable community plugins and **Noiseless** when prompted. Use `example-vault` to explore fictional data first.
2. Open `Noiseless/Setup.md`. Save your normal weekday/weekend focus minutes using its controls.
3. In LM Studio, load a model capable of structured JSON output and start the server from **Developer**. In Setup's **LM Studio connection** panel, enter the exact model identifier and click **Save LM Studio connection**. The default endpoint is `http://127.0.0.1:1234/v1`.
4. Write your missions, milestones, checkpoints, success criteria, and known dates in `Noiseless/Goal brief.md`. Run **Noiseless: Draft goals from brief**. Review the YAML in `Goal draft.md`, then run **Noiseless: Approve goal draft**.
5. Capture tasks in Everything or with **Noiseless: Capture tasks**. Open Today, work on the suggested sessions, and check tasks complete.

For an existing vault, copy `dist/noiseless` into `<vault>/.obsidian/plugins/noiseless`, reload Obsidian, and enable Noiseless. It initializes only the `Noiseless/` folder; do not use that folder name for unrelated notes. Keep one active desktop instance per vault.

Notes in `Noiseless/` automatically open in Reading view, including when opened from links or the file explorer. You can still switch to editing or Source mode after opening a note.

The included example vault has all provider calls disabled. Its dates are relative to the day the example was generated. It is separate from the clean starter vault.

## Optional cloud setup

In `Noiseless/Setup.md` Reading view:

- Use the OpenAI or Anthropic connection panel to enable the provider, enter its exact model ID, and set current USD input/output prices per million tokens.
- Select **Task analysis** and/or **Draft goals from your brief** for each connection, then save. Unchecked operations cannot use that provider, including as a fallback. Existing configurations retain both selections until changed. These are AI operation types, not individual to-do items.
- Save a positive **Monthly cloud budget (USD)**. Zero pauses cloud processing.
- In **Obsidian Settings → Noiseless**, create or choose API-key secrets. Only their names are written in Markdown. Obsidian encrypts secrets using the operating system; credentials are not exported in the plugin or starter vault.

Requests contain the task, goal definitions, and scoring rubric. There is no external task execution, web browsing, or whole-vault upload. LM Studio may use an optional token through the same secret mechanism.

Routing uses only enabled connections with the corresponding AI task checked. LM Studio extracts and classifies; OpenAI scores ordinary work; Anthropic handles complex ambiguity and graph proposals. Configured cloud providers back each other up. A confident, valid local result remains usable when cloud is unavailable. Low-confidence local results stay pending if escalation fails.

Spending uses configured prices and token usage. A conservative request allowance is reserved before each cloud call. Unknown outcomes retain that reservation; this can pause processing early. This is a local estimated ceiling, not a replacement for provider billing limits. Requests are serialized; two transient retries are allowed. Diagnostics shows sanitized statuses, usage, and errors.

## Goal drafting with your own agent

In Goals or Setup, use **Draft goals with your own agent → Export goal prompt**. This creates a unique Markdown file under `Noiseless/Goal exchange/` containing the same system instructions and input as built-in goal drafting, plus the full output schema. It also creates `Noiseless/Goal exchange/Outputs/`.

Give the exported file to your agent and save its JSON response in `Outputs/result.json` (or a `.md` file containing one fenced JSON block). Enter the filename and click **Import for review**. Noiseless validates the schema and graph, archives the previous draft, and updates `Goal draft.md`. Review it in the interactive goal map: drag or scroll to pan, use zoom or Fit map, search for a goal, and select cards to inspect full details and weighted parent/child connections. Click **Approve draft** to activate it. The button rejects a draft changed since it was loaded; reload and review again. Existing drafts gain the map automatically on plugin startup, preserving their YAML and notes. Export and import make no provider calls and need no API key or cloud budget. They do not change your provider settings; disable cloud connections if you do not want API processing for other operations.

## Markdown is the source of truth

- `Noiseless/Everything.md`: raw capture area with stable ID markers. One line, bullet, or checkbox per task. Checking a captured checkbox completes its canonical task.
- `Noiseless/Tasks/`: canonical task notes with original wording, status, inference, manual `overrides`, sessions, and completion history. Rename files within this folder freely; IDs remain stable. To create a copy, assign a fresh ID.
- `Noiseless/Goals.md`: active graph. Use `Goal draft.md` and the approval command for structural edits; prior versions are archived. Each child connects only to the next level above and its parent weights sum to 1.
- `Noiseless/Setup.md`: capacity, daily overrides, scoring weights, model IDs, credential references, prices, and budget.
- `Noiseless/Days`, `Insights`, and `History`: readable plans, statistical reflections, and audit history. Plugin-managed sections have explicit comment markers; write personal notes outside them.

The three pages contain collapsed Markdown snapshots for use without the plugin. Source-mode captures and checkbox changes reconcile when the plugin resumes. Capture markers are persisted before creating tasks, so a restart does not duplicate an interrupted capture. Do not remove IDs or managed-section closing markers.

## Scores and output

Priority is the normalized weighted mean of urgency (25), L1 alignment (30), expected impact (20), ROI (20), and reputation (5). Edit these relative weights in the **Priority weights** panel in Setup’s Reading view, then click **Save priority weights**. The panel previews each factor’s percentage; weights need not total 100. Expand any task to see every contribution to its priority.

Urgency uses `clamp(10 − 9 × slackDays / 14, 1, 10)`, where slack subtracts remaining estimated workdays from the earlier task/L3 target. Workday size uses normal weekday capacity, then weekend capacity, then 240 minutes as a provisional scoring default. ROI uses `1 + 9 × rate / (rate + 10)`, where rate is impact per estimated hour. The algorithm breaks ties by effective date, capture time, and stable ID.

Mission alignment combines path allocation, substantive task-to-mission fit, and root importance relative to the highest root importance. Allocations conserve effort separately at each goal level; they are not progress percentages. Unsorted tasks have alignment 1.

Today allocates at most one session of up to 60 minutes per eligible task, in priority order. Logged minutes reduce today's capacity. Long tasks stay intact. When all tasks have received a session, the list may leave capacity free; log a session to recompute. Used-up estimates require revision before another session is suggested. No task is automatically split.

Output points equal impact × alignment (1–100). The first logged session—or completion without a session—freezes credit, scoring version, and graph attribution. Completing awards it once; reopening reverses it. Urgency and later weight changes do not inflate past output. Unsorted work earns the minimum alignment contribution but has no goal allocation.

Effort uses logged minutes when present; otherwise completed tasks use their frozen estimated duration. These are labeled separately and never added together for one task. Output is an estimated contribution index. Mark goal `achieved: true` only when you have verified its success criteria; effort alone does not establish attainment.

## Development and verification

```sh
npm ci
npm run check
npm test
npm run package
```

`npm run package` builds the plugin and prepares clean and fictional example vaults. Generated starter content is for distribution, not your working vault: don't keep personal work there while rebuilding packages. Installable ZIPs are in `artifacts/`.

Tests cover graph conservation, scoring, daily sessions, frozen credit, Markdown reconciliation, provider schemas/routing/failures/budgets, stale responses, service workflows, and DOM controls. Live provider calls need your own model setup and credentials. V1 runs only while Obsidian is open and has no calendar, recurring-task engine, automatic subtask generation, or mobile execution.

See [VERIFICATION.md](VERIFICATION.md) for the test and native Obsidian results. `node scripts/preview.mjs` generates an offline layout matrix from the production UI for visual inspection.

API references: [LM Studio structured output](https://lmstudio.ai/docs/developer/openai-compat/structured-output), [OpenAI structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [Anthropic structured output](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [Obsidian secret storage](https://docs.obsidian.md/plugins/guides/secret-storage).

### Editing goals in Reading view

The Goals tab starts with the same interactive graph as Goal draft. Both pages use the full pane width. Select a card and choose **Edit goal** to edit its ID, title, level, description, success criteria, target date, date kind, importance, achieved status, and parent connections with percentage weights. Invalid graphs are rejected without discarding the form. Draft edits save directly to the draft; edits from active Goals use **Save to draft**, archiving the previous draft for recovery. Continue editing the draft and approve when ready. Renaming a draft ID updates parent references within that draft; existing task assignments are not migrated by renaming goal IDs.

All Noiseless tabs use the available Reading-view pane width. Above 960px, Today and Everything place the focus budget or capture box beside tasks, Setup uses paired panels, and Progress places allocation panels side by side. Narrow split panes retain a single-column layout. These width overrides apply only to rendered Noiseless pages.
