# Quick menus: hide missing-command rows from the popup — design

Date: 2026-08-03
Baseline: 0.17.1 (unpublished draft; this change layers on its all-missing-menu gate).

## Context

0.17.1 hides the ribbon icon of a menu whose commands are all missing on this device.
Mixed menus (some commands available, some missing) keep their icon, and the popup renders
missing commands as greyed, unclickable rows — a Non-goal of that round kept them visible.

Decision (user, 2026-08-03): the settings tab's greyed "Not on this device" affordance is
enough; the ribbon popup should not show missing-command rows at all.

## Scope

### 1. `presentQuickMenuEntries` — `src/core/quickCommands.ts`

New exported pure function:

```ts
presentQuickMenuEntries(entries: QuickMenuEntry[]): QuickMenuEntry[]
```

Takes `quickMenuEntries` output, drops every command entry with `disabled: true`, then
re-applies the same separator rules (no leading/trailing/consecutive separators; the list
collapses to `[]` when no command remains) — removal can orphan a separator, e.g. a menu
starting `[missing] [sep] [available]` must not open with a divider on top.

The separator-normalization loop already lives inside `quickMenuEntries`; extract it into
a module-private helper both functions call, rather than duplicating it. `quickMenuEntries`
behavior is unchanged (settings tab and the 0.17.1 ribbon-icon gate keep consuming it).

### 2. `openMenu` — `src/main.ts`

Render `presentQuickMenuEntries(entries)` instead of `entries`. The `e.disabled` branch
(`setDisabled(true)`) is deleted — every rendered command row is clickable. The
empty-placeholder check keys on the presented list; a menu whose commands all vanished
mid-session (registry drift after the last rebuild — normally unreachable, since the
0.17.1 gate hides such menus at rebuild) shows the existing "No commands yet …"
placeholder. Its copy slightly misdescribes that drift state; accepted (record-only), the
state is not reachable through normal use.

### 3. Docs — `docs/GUIDE.md`, Quick menus chapter

Update the availability sentence: the popup lists only commands available on this device
(missing ones stay visible — greyed — in settings, and return automatically once their
plugin is back). Current-state voice.

## Non-goals

- No change to `quickMenuEntries`'s contract, the settings tab, or the 0.17.1 icon gate.
- No mid-session re-evaluation (unchanged from 0.17.1: rebuilds happen at plugin load and
  quick-menu settings edits).
- No new empty-state copy for the drift case.

## Testing

- New Vitest cases in `tests/quickCommands.test.ts` for `presentQuickMenuEntries`:
  - drops disabled rows, keeps available ones;
  - a separator orphaned at the head by removal is dropped;
  - consecutive separators created mid-list by removal collapse to one;
  - all commands disabled → `[]`;
  - nothing disabled → input returned structurally unchanged.
- Existing suite stays green (109 baseline). Gates: `npm run build`, `npm test`,
  `npm run lint`.
- Live verify (dev vault): a mixed menu (one missing + available commands) opens with no
  greyed row and no leading divider; settings tab still greys the missing entry; an
  all-available menu renders identically to 0.17.1.

## Versioning

Cut as **0.17.2**, layered on the unpublished 0.17.1 draft — devices need the chain
published (or side-loaded) to see either behavior.
