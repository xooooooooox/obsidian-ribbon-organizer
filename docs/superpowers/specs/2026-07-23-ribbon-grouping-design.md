# Ribbon Grouping Design (0.2.0)

Sub-project 2 of Ribbon Organizer: visual grouping, ordering, and dividers for the desktop left ribbon. Replaces the vault CSS snippet `mystyle-ribbon.css`, which groups icons by fragile `aria-label` attribute selectors and hand-maintained `order` rules.

## Goal

The user defines named groups of ribbon icons and their order in the plugin settings. The desktop left ribbon renders icons in that order, with a thin divider line between adjacent non-empty groups. Icons not assigned to any group fall into a built-in "Ungrouped" bucket whose position among the groups is movable. Configuration lives in `data.json` and syncs across devices.

## Decisions already made

- **Mechanism: visual ordering via flex `order`** (option A). The container `.side-dock-actions` is flex-column, so setting `buttonEl.style.order` fully controls visual sequence without touching Obsidian's items array, DOM node order, or its per-device order/visibility persistence. Rejected: physically reordering DOM nodes (fights Obsidian's own `left-ribbon` persistence in `workspace.json`; larger private-API surface) and generated CSS snippets (inherits the aria-label fragility this project exists to remove).
- **Match key: ribbon item id** (`pluginId:title`, e.g. `pdf-plus:PDF++: Toggle auto-copy`), read from `app.workspace.leftRibbon.items`. Ids are fixed at registration; unlike aria-labels they are not rewritten at runtime (e.g. Config Sync's live status tooltip). Titles may be localized (`slides-rup:把当前笔记转换为幻灯片`), which is stable across the user's same-language devices.
- **Grouping granularity: individual icon.** One plugin's icons can live in different groups (e.g. `cmdr` macros split across groups today).
- **Dividers: plain lines only** — 1px, inset 10% per side, like the current snippet. No group labels in the ribbon; group names appear only in settings.
- **Visibility is not managed.** Obsidian's native right-click hide remains the only hide mechanism. Hidden icons don't occupy a slot and don't count toward a group being non-empty.
- **Icon replacement is out of scope** (`mystyle-ribbon-icons.css` stays a vault snippet).
- **No import from the existing snippet.** The settings UI lists live ribbon items; the user rebuilds groups once by hand, then retires `mystyle-ribbon.css` from the vault.
- **Settings UI layout: single-column mirror** (mockup approved 2026-07-23): the settings list top-to-bottom equals the ribbon top-to-bottom; group header rows mark where dividers go.

## Data model

`data.json` gains one field next to the existing `quickCommands`:

```ts
// core/ribbonGroups.ts
export const UNGROUPED_ID = "ungrouped";

export interface RibbonGroup {
  id: string;      // stable internal id (crypto.randomUUID()); UNGROUPED_ID is reserved
  name: string;    // shown in settings only; editable (fixed for the ungrouped group)
  items: string[]; // ribbon item ids; order = order within the group
}

interface RibbonOrganizerSettings {
  quickCommands: QuickEntry[];
  groups: RibbonGroup[]; // array order = top-to-bottom group order in the ribbon
}
```

The "Ungrouped" bucket is a sentinel group stored **in** the array: `{ id: UNGROUPED_ID, name: "Ungrouped", items: [] }`. Its `items` stays empty forever — membership is derived at apply time as "every live icon not claimed by another group", ordered by Obsidian's own item order. Keeping it in the array makes group reordering uniform (no separate position index). Invariants:

- Exactly one group with `id === UNGROUPED_ID` exists; it cannot be deleted or renamed.
- An item id appears in at most one group's `items`.
- `DEFAULT_SETTINGS.groups = [{ id: UNGROUPED_ID, name: "Ungrouped", items: [] }]`. `loadSettings` fills the field for pre-0.2.0 `data.json` (same `Object.assign` pattern as today) and re-inserts the sentinel if a hand-edited config lost it.

## Core algorithm (pure, unit-tested)

```ts
// core/ribbonGroups.ts
export interface LiveRibbonItem {
  id: string;
  hidden: boolean;
}

export interface RibbonLayout {
  orders: Map<string, number>; // item id -> flex order value (every live id gets one)
  dividerOrders: number[];     // order values for divider elements
}

export function computeRibbonLayout(groups: RibbonGroup[], live: LiveRibbonItem[]): RibbonLayout;
```

Semantics:

1. Walk `groups` in array order. For the sentinel, the member list is the unclaimed live ids in `live` order. For real groups, the member list is `items` filtered to ids present in `live` (configured-but-absent ids are skipped — device doesn't have that plugin).
2. Assign each member a strictly increasing order number across the whole walk (a running counter; exact values are an implementation detail — only relative order matters). Hidden items get an order too (harmless) but are excluded from the "group is non-empty" test.
3. Between each pair of **adjacent non-empty** groups (non-empty = has ≥1 live, non-hidden member), emit one divider order value strictly between the last order of the earlier group and the first order of the later one. Empty groups produce no divider — the "empty-Others line merge" pixel hack in the current snippet disappears by construction.

Mutation helpers, all pure (`(settings-slice, args) → new slice`, following the `quickCommands.ts` style): `addGroup`, `renameGroup`, `deleteGroup` (removes the group; its items become unclaimed, i.e. fall to Ungrouped — no confirmation, the action is reversible), `moveGroup` (reorder within the array, sentinel movable like any other), and `moveItemToGroup(itemId, targetGroupId, index?)` (remove from any current group, insert into the target's `items` at `index`, append when omitted — the `⋮` menu omits it, drag-drop passes the drop position; target Ungrouped means "remove from current group" only). Within-group reordering is the same-group case of `moveItemToGroup` — no separate helper.

## DOM application

`applyRibbonLayout` (thin DOM layer in `main.ts` or `ui/ribbonRender.ts`):

1. Validate the private API shape (see boundary below) and snapshot `leftRibbon.items` → `LiveRibbonItem[]`.
2. `computeRibbonLayout(...)`.
3. Set `buttonEl.style.order` per the map.
4. Remove all existing `.ribbon-organizer-divider` elements from `ribbonItemsEl`, then insert one `<div class="ribbon-organizer-divider">` per divider order value with `style.order` set (class name carries the repo's `ribbon-organizer-` prefix). Line appearance lives in `styles.css`:

```css
.ribbon-organizer-divider {
  order: 0; /* set inline per divider */
  border-top: 1px solid var(--background-modifier-border);
  margin: 2px 10%;
  flex: none;
}
```

(The container's own `gap` supplies breathing room; exact margin is tuned during dev-vault verification.)

**Triggers and lifecycle:**

- First apply on `this.app.workspace.onLayoutReady`.
- A `MutationObserver` on `ribbonItemsEl` (childList + subtree attribute changes on `class`) re-applies after a 100 ms debounce — this covers late-loading plugins adding icons and native hide/unhide. The observer is disconnected during apply and reconnected after, so our own divider edits and `style.order` writes cannot self-trigger.
- Every settings edit saves and re-applies immediately (live feedback while the settings tab is open).
- `onunload`: disconnect the observer, remove all `.ribbon-organizer-divider` elements, clear `style.order` on every ribbon button — the ribbon returns to stock Obsidian.

## Private API boundary and error handling

Only two internals are touched, accessed through one narrow typed cast (same idiom as the existing `app.commands` cast in `main.ts`):

- `app.workspace.leftRibbon.items`: array of `{ id: string; hidden: boolean; buttonEl: HTMLElement }`
- `app.workspace.leftRibbon.ribbonItemsEl`: `HTMLElement` (the `.side-dock-actions` container)

At first apply, validate the shape at runtime: `items` is an array whose entries have a string `id` and an `HTMLElement` `buttonEl`, and `ribbonItemsEl` is an `HTMLElement`. On mismatch (future Obsidian internals change): show one `Notice` ("Ribbon Organizer: ribbon grouping is incompatible with this Obsidian version"), `console.error` the actual shape found, and disable the grouping feature for the session. Quick commands are unaffected. No silent fallback beyond this explicit disable.

**Mobile:** phones/tablets have no left ribbon. Guard with `Platform.isDesktop`: no observer, no apply. The settings section renders a single muted line "Ribbon grouping applies to desktop only." on mobile (config still syncs; editing happens on desktop).

## Settings UI

The settings panel is split into two tabs — **Ribbon groups** and **Quick commands** — using the same tab-bar pattern as config-sync's settings panel (icon + label buttons, accent underline on the active tab, panel opens on the first tab). Each tab starts with a muted one-line description (the tab label replaces the old section heading). The groups tab is the custom list in `ui/GroupsSection.ts`, not stock `Setting` rows. UI copy in English (matches 0.1.x).

The tab has two rendering paths sharing the same tabbed renderer. On Obsidian 1.13+ the declarative settings API wins: `getSettingDefinitions()` returns one render-type definition (name "Ribbon Organizer", aliases covering both tabs' terms) whose `name`/`desc`/`aliases` feed the settings search index; its render callback takes over the row element and renders the tabbed panel, which the declarative control/list types cannot express (when definitions are non-empty, 1.13+ never calls `display()`). On older versions (`minAppVersion` stays 1.8.7) `display()` remains as the officially sanctioned fallback and renders the same tabbed panel. Sections re-render themselves in place after edits, so the outer settings scroll position holds. The `@typescript-eslint/no-deprecated` scope-off for `SettingTab.ts` exists solely for this fallback override. Per the approved mockup:

- **Single column mirroring the ribbon**: group header rows (drag handle, name, rename, delete) with their member item rows beneath (drag handle, icon, title, plugin id in muted text, `⋮` menu). The section's top-to-bottom order is exactly the ribbon's.
- **Filter field** at the top: substring match against item title and plugin id, hides non-matching item rows; group headers stay visible; clearing restores all rows.
- **Drag and drop** (HTML5 DnD) is the primary interaction: drag an item row within a group (reorder), across groups (reassign at drop position), or a group header (move the whole group, sentinel included). Dragging an item into Ungrouped removes it from its group; reordering *within* Ungrouped is a no-op (order there follows Obsidian) — the UI does not offer item drop positions inside Ungrouped, only the bucket itself as a target.
- **`⋮` menu per item row**: "Move to group → [list of other groups]", appending to the target group's end. Exists because dragging across a ~50-row list is painful.
- **Rename** is inline (click the ✎/name, edit, commit on blur/Enter). **Delete** (✕ on the header) removes the group without confirmation; members fall to Ungrouped. The Ungrouped header shows a badge ("new icons land here") instead of rename/delete controls.
- **"+ New group"** row at the bottom creates a group named "New group" ready for inline rename.
- **Row icon** renders the item's `icon` id via the existing `renderIcon` helper.
- **Stale items** (in a group's `items` but not on this device): greyed row with a "Not on this device" badge, kept in place, `⋮` still works; they contribute nothing to the ribbon and come back automatically when the plugin returns — same behavior and styling as quick commands' missing-command state.
- Every mutation: update settings via the pure helpers → `saveSettings()` → re-apply → re-render the section.

## File structure

- `src/core/ribbonGroups.ts` — new: types, `UNGROUPED_ID`, `computeRibbonLayout`, pure mutation helpers.
- `src/ui/GroupsSection.ts` — new: settings section rendering + DnD wiring.
- `src/main.ts` — modify: settings interface/defaults, apply + observer lifecycle, private-API cast and validation.
- `src/ui/SettingTab.ts` — modify: mount the Groups section above Quick commands.
- `styles.css` — add `.ribbon-organizer-divider` and settings-section styles.
- `tests/ribbonGroups.test.ts` — new: pure-function tests.

## Testing

Vitest on the pure layer only (existing repo strategy — DOM layer stays thin and is verified live in the dev vault):

- `computeRibbonLayout`: claimed vs unclaimed partitioning; sentinel position respected; configured-but-absent ids skipped; hidden items excluded from non-emptiness but still ordered; dividers only between adjacent non-empty groups (cases: empty middle group, empty Ungrouped, single non-empty group → zero dividers); Ungrouped members keep live order.
- Mutation helpers: delete falls members to Ungrouped; sentinel cannot be deleted/renamed; `moveItemToGroup` removes from source; input arrays never mutated (purity, matching repo lint/style rules).
- `loadSettings` migration: pre-0.2.0 data gains the default `groups`; missing sentinel is re-inserted.

Live verification checklist (dev vault, then main vault): grouping applies on startup before/after late plugin loads; native hide/unhide re-flows dividers; unload restores stock ribbon; settings drag/⋮/filter/rename/delete; macOS + at least one non-default theme.

## Release and rollout

- Version **0.2.0** (new feature, same release flow: tag without `v`, CI draft, hand-written notes, publish as Latest).
- Store-facing consequence: the manifest description's "Group your ribbon" claim becomes true — resolves the open concern about advertising an unshipped feature.
- After the user rebuilds their groups in the plugin, delete `mystyle-ribbon.css` from the vault (manual step, outside this repo).
