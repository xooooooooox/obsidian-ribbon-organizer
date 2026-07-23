# Architecture

Ribbon Organizer ships two features, both configured from one settings panel and persisted in the plugin's `data.json`:

1. **Ribbon groups** (desktop): orders the left-ribbon icons into named groups separated by thin divider lines.
2. **Quick commands**: a ribbon-menu launcher for user-picked commands with editable labels and icons (including iconize custom packs).

## Overview — three layers

- **`src/core/`** — pure functions, no `obsidian` import. All grouping arithmetic and menu-entry shaping lives here; this is the only layer with unit tests.
- **`src/ui/`** — the settings panel and fuzzy pickers. Thin: every state change delegates to a core function, saves, and re-renders its own container.
- **`src/main.ts`** — the plugin shell, and the only file that touches non-public API (`app.workspace.leftRibbon`, `app.commands`, `app.plugins` via `ui/iconRender.ts`'s iconize accessor). Private shapes are runtime-validated, never trusted.

## Module map (`src/`)

- **`main.ts`** — lifecycle and the two feature drivers.
  - Settings: `{ quickCommands: QuickEntry[], groups: RibbonGroup[] }`; `loadSettings()` runs `normalizeGroups` so a hand-edited `data.json` can never crash the plugin.
  - `ribbonInternals(app)` validates `app.workspace.leftRibbon` (`items[]` with `id`/`buttonEl`, plus `ribbonItemsEl`); returns null on any shape mismatch.
  - `applyGrouping()` writes flex `order` onto each icon's `buttonEl` and injects `.ribbon-organizer-divider` divs per `computeRibbonLayout`; idempotent; guarded by `Platform.isDesktop` and a session latch (`groupingDisabled`) set when internals validation fails (console.error + one Notice).
  - `observeRibbon()` — a MutationObserver (childList + subtree + `class` attribute, 100 ms debounce) re-applies when icons appear late (lazy-loading plugins) or native hide/unhide toggles; it is disconnected while `applyGrouping` writes (so our own edits can't re-trigger it) and on unload.
  - `onunload()` clears every inline `order` and removes every injected divider — the stock ribbon returns instantly.
  - `openMenu()` builds the quick-commands menu from `quickMenuEntries`; `menu.setUseNativeMenu(false)` forces a DOM menu because native macOS menus cannot render command/iconize icons.
  - `ribbonSnapshot()` is the settings UI's read-only view of the live ribbon.
- **`core/ribbonGroups.ts`** — the grouping model. `RibbonGroup` (`id`/`name`/`items`), the `UNGROUPED_ID` sentinel, `defaultGroups`, `normalizeGroups`, `computeRibbonLayout`, and the pure mutations `addGroup` / `renameGroup` / `deleteGroup` / `moveGroup` / `moveItemToGroup` — all return fresh arrays and throw on unknown ids or sentinel violations.
- **`core/quickCommands.ts`** — `quickMenuEntries()`: flags commands not registered on this device as `disabled` and normalizes separators (no leading/trailing/consecutive; a list with no runnable command collapses to `[]`).
- **`core/icons.ts`** — `iconChoices()`: composes Obsidian's built-in icon ids with iconize custom packs into one picker list (the `lucide-icons` pack is dropped — Obsidian already ships Lucide).
- **`core/types.ts`** — `QuickCommand` / `QuickSeparator` / `QuickEntry` and the `isSeparator` guard.
- **`ui/SettingTab.ts`** — the dual-path, two-tab panel. `getSettingDefinitions()` (Obsidian 1.13+) returns one render-type definition whose name/desc/aliases feed settings search and whose row element hosts the whole tabbed panel; `display()` renders the same panel as the official < 1.13 fallback. Also owns the Quick commands section (rows, reorder, icon/label editing, add bar).
- **`ui/GroupsSection.ts`** — the Ribbon groups tab: a single column mirroring the ribbon's final order (group headers mark where dividers render), with in-place filter, collapsible groups (default collapsed; session-only `expanded` set, chevron + member count on headers; a non-empty filter query temporarily reveals matches inside collapsed groups without touching the stored state — two distinct hidden classes, `is-filtered-out` vs `is-collapsed`), HTML5 drag-and-drop (items within/across groups, whole groups onto headers; dropping on a collapsed header appends without expanding), a ⋮ "Move to group" menu, and inline rename. One instance lives on the SettingTab so filter text and collapse state survive re-renders; `persist()` = save → `applyGrouping()` → re-render own container (outer scroll position holds).
- **`ui/iconRender.ts`** — `renderIcon()` fallback chain: Obsidian `setIcon` → iconize `setIconForNode` → the command's own icon → `"command"`; plus the iconize public-API accessor.
- **`ui/IconSelectModal.ts` / `ui/CommandSelectModal.ts`** — `FuzzySuggestModal` pickers over the icon catalog / command registry.

## Core invariants

1. **Grouping is visual-only.** Flex `order` + injected divider divs on `.side-dock-actions` (a flex column, so `order` fully controls visual sequence). Obsidian's items array, DOM node order, drag persistence, and hide/unhide are never touched; unload or disable restores the stock ribbon.
2. **Private API is validated, never trusted.** `ribbonInternals()` returning null means "internals changed shape" — grouping disables itself for the session with one Notice. No partial writes, no guessing.
3. **Match key = registration id** (`pluginId:title`, e.g. `config-sync:Config Sync`) — stable at runtime, unlike aria-labels which localize and change with state.
4. **Sentinel semantics.** Exactly one group with id `ungrouped` always exists in `settings.groups`; its `items` stays empty — membership is derived at layout time as "every live icon no other group claims". Its array position sets where unclaimed icons render. It cannot be renamed or deleted; `normalizeGroups` re-inserts it (at the end) when missing and repairs duplicates/malformed entries.
5. **Divider rule.** A divider renders only between ADJACENT NON-EMPTY groups, where non-empty means "has at least one live, not natively hidden member" — so hidden-only or absent-on-this-device groups never produce stray lines.
6. **Cross-device tolerance.** A configured item id absent from the live ribbon is skipped by layout and shown greyed ("Not on this device") in settings; it recovers automatically when its plugin returns. Same contract as quick commands' `disabled` flag.
7. **Settings tab is dual-path** (see module map). `minAppVersion` stays 1.8.7 until the `display()` fallback is dropped.
8. **Platform split.** Grouping is desktop-only (`Platform.isDesktop`); quick commands run everywhere (`isDesktopOnly: false`).

## Data model

`data.json` (rides whatever vault sync the user runs):

```json
{
  "quickCommands": [
    { "commandId": "remotely-save:start-sync", "label": "Sync now", "icon": "refresh-cw" },
    { "kind": "separator" }
  ],
  "groups": [
    { "id": "b2f1…", "name": "Sync", "items": ["config-sync:Config Sync", "remotely-save:remotely-save"] },
    { "id": "ungrouped", "name": "Ungrouped", "items": [] }
  ]
}
```

`normalizeGroups` makes this hand-editable: malformed entries and duplicate group ids are dropped, duplicate item claims deduplicate first-group-wins, the sentinel's name/items are forced.

## Testing & gates

- `npm test` — vitest over `src/core/` only. `vitest.config.ts` aliases `obsidian` to `tests/mock-obsidian.ts` as an escape hatch, but that file does not exist yet: core stays `obsidian`-free by design, so nothing resolves the alias. Create the mock only when a test first genuinely needs an `obsidian` import.
- `npm run build` — `tsc -noEmit` + esbuild production bundle; run before finishing any change.
- `npm run lint` — zero-warning baseline; no inline disables (see CLAUDE.md).
- End-to-end: obsidian-cli against `dev/vault` (see CLAUDE.md "Smoke testing").

## How to extend

- **A new grouping behavior**: add a pure function to `core/ribbonGroups.ts` with tests, then wire it from `GroupsSection` (state change → `persist()`). `computeRibbonLayout` is the single source of truth for what the ribbon looks like.
- **A new quick-entry kind**: extend the `QuickEntry` union in `core/types.ts`, teach `quickMenuEntries` its menu shape, and add its row renderer in `SettingTab.renderQuickCommands`.
- **When every target device runs Obsidian ≥ 1.13**: raise `minAppVersion`, delete `display()` in `ui/SettingTab.ts` and the matching `no-deprecated` scope-off in `eslint.config.mts`.
