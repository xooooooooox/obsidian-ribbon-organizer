# Group Collapse Design (0.3.0)

Small UX feature for the **Ribbon groups** settings tab: each group's member list is collapsible, and every group starts collapsed when the settings panel opens. Today all member rows are always expanded, which makes the single-column list long once real groups exist.

## Goal

Opening Settings → Ribbon Organizer → Ribbon groups shows a compact list of group headers only. Clicking a header expands/collapses that group's member rows. Filtering still finds icons inside collapsed groups.

## Decisions already made

- **Default collapsed, every group** — including the Ungrouped sentinel. The header shows a member count, so new icons landing in Ungrouped are visible at a glance without expanding.
- **State is session-only.** Expanded-group ids live in memory on the `GroupsSection` instance (like `filterQuery`), so edit-triggered re-renders keep the state, but reopening the settings panel starts fully collapsed. Nothing is written to `data.json`.
- **Filter overrides collapse.** While the filter query is non-empty, matching rows are shown even inside collapsed groups (a temporary expand that does not touch the stored state); clearing the query restores each group's own collapsed/expanded state.
- **Rendering strategy: rows always render, collapse is CSS hiding** — same mechanism as the existing `is-filtered-out` class. Rejected: skipping DOM for collapsed members, because the filter must search collapsed groups' members and therefore needs their haystacks (and rows) to exist.

## UI changes (header row)

- A **chevron** span after the drag grip: `chevron-right` when collapsed, `chevron-down` when expanded (via `setIcon`).
- A **member count** in muted text after the group name (e.g. `· 5`), always visible. For real groups it counts `items` (stale ids included — they are rows too); for Ungrouped it counts the derived unclaimed live icons.
- **Click anywhere on the header toggles** the group, except clicks inside the buttons area (`.ribbon-organizer-rg-btns`) or on the inline-rename input (guard on `e.target`). Header drag-to-reorder and dropping an item onto a header (append to that group) are unchanged — so icons can be dropped into a collapsed group without expanding it.

## Visibility rule

`GroupsSection` gains `private expanded = new Set<string>()` (group ids; empty set = all collapsed). `itemRows` entries additionally record their group id. `applyFilter` becomes the single visibility pass:

- Query empty: row hidden ⟺ its group is not in `expanded`.
- Query non-empty: row hidden ⟺ haystack does not match (group state ignored).

Implemented as two independent class toggles per row, each with its own `display: none` rule: the existing `is-filtered-out` (query active and no match) and a new `is-collapsed` (query empty and group not expanded) — each class keeps one crisp meaning. The pass stays in-place DOM toggling: no re-render, filter input keeps focus. Chevrons keep showing the stored state during a filter; the temporary expand is visual only.

## Edge behaviors

- **New group**: after the "New group" button creates one, its id is added to `expanded` before `persist()` — the user's next action is renaming it and dragging icons in.
- **Delete group**: remove the id from `expanded` (members fall to Ungrouped as today; whether Ungrouped is expanded is untouched).
- Stale ids left in `expanded` (e.g. after a cross-device config change) are harmless — lookups just miss.

## Out of scope (YAGNI)

- Auto-expand on drag-hover over a collapsed header (drop-on-header already appends).
- Persisting collapse state to `data.json`.
- Expand-all/collapse-all controls.

## File structure

- `src/ui/GroupsSection.ts` — modify: `expanded` set, chevron + count in `renderGroupHeader`, header click toggle, visibility pass, new-group/delete-group set maintenance.
- `styles.css` — add: chevron sizing/alignment, count text style, hidden-row rule if a new class is used.

## Testing

No core change — `computeRibbonLayout` and the mutation helpers are untouched, so the existing suite (23 tests) stands and no new unit tests are added (collapse is UI-only interaction, same as the existing filter logic, per the repo strategy of testing the pure layer only).

Live verification (dev vault): opens fully collapsed; header click toggles and rename/delete buttons do not; count correct for real groups and Ungrouped; filter reveals matches inside collapsed groups and clearing restores state; drop onto a collapsed header lands in that group; edit-triggered re-render keeps expanded state; new group appears expanded.

## Docs and release

- Same-branch doc updates (docs-currency gate): `README.md` / `README.zh.md` — one clause in the ribbon-groups bullet ("groups are collapsed by default; click a header to expand"); `docs/ARCHITECTURE.md` — GroupsSection description gains the session-only collapse state and the filter-overrides-collapse rule.
- Version **0.3.0** (user-visible behavior change in settings; same release flow: bare tag, CI draft, hand-written notes, publish Latest).
