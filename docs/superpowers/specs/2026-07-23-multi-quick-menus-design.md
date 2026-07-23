# Multiple Quick Menus (composite ribbon icons) — Design (0.4.0)

## Goal

Today the plugin registers exactly one hardcoded composite ribbon icon (`addRibbonIcon("menu", "Ribbon Organizer", …)` in `main.ts`) that opens the single `quickCommands` list; neither its icon nor its name can be changed. This feature replaces it with **multiple user-defined quick menus**: each menu is one ribbon icon (icon and name both editable) opening its own command list.

## Decisions (user-approved)

- **Name editable too** — each menu's name is the ribbon tooltip and must be unique among menus. Documented limitation: the ribbon item id is `ribbon-organizer:<name>`, so renaming a menu drops that icon out of its Ribbon group back into Ungrouped (re-drag to restore). Renaming also resets Obsidian's native hide flag for that icon (same id-keyed mechanism); not worth special handling.
- **Empty menu keeps its icon** — a menu with no commands still shows its ribbon icon; clicking it shows the existing disabled "No commands configured — add them in the plugin settings" item. A freshly created menu is therefore immediately visible.
- **Settings UI: menu sections with collapse** — the Quick commands tab lists one collapsible section per menu, reusing the Ribbon groups collapse pattern (default collapsed, session-only expanded set, new menu starts expanded). Mockup approved 2026-07-23 (`scratchpad/mockup-multi-menus.html`).
- **Ribbon lifecycle: full rebuild** (approach A) — on any menu change, remove all plugin-registered composite icons and re-register from settings, then `applyGrouping()`. Registration order does not matter visually because grouping controls position via flex `order`.
- **No menu reordering in settings** — ribbon position is governed by Ribbon groups; the settings list order is meaningless (YAGNI).
- **No delete confirmation** — deleting a menu removes its icon immediately; a menu is cheap to rebuild (same standard as group deletion).

## Data model

`core/types.ts`:

```ts
// A user-defined ribbon menu: one composite ribbon icon opening its own command list.
export interface QuickMenu {
  id: string;            // uuid; stable settings identity (ribbon id derives from name instead)
  name: string;          // ribbon tooltip; unique among menus; ribbon item id = "ribbon-organizer:<name>"
  icon: string;          // lucide id; editable via the icon picker
  entries: QuickEntry[]; // commands + separators (existing QuickEntry unchanged)
}
```

Settings change: `quickCommands: QuickEntry[]` → `menus: QuickMenu[]`. `DEFAULT_SETTINGS.menus` = one menu `{ name: "Ribbon Organizer", icon: "menu", entries: [] }` (built by a `defaultMenus()` factory, mirroring `defaultGroups()`), so a fresh install behaves exactly like today.

### Migration

In `loadSettings`, raw data runs through a pure `normalizeMenus(data)` (new `core/quickMenus.ts`):

- `menus` present → validate shape (drop malformed menus/entries; fill missing `id` with a fresh uuid), dedupe names deterministically by suffixing `" 2"`, `" 3"`, ….
- `menus` absent but legacy `quickCommands` present (any array, including empty) → one menu `{ name: "Ribbon Organizer", icon: "menu", entries: <legacy list> }`.
- Neither present → `defaultMenus()`.
- Zero menus is a **valid** state (user deleted them all): no composite icons registered.

The stale `quickCommands` key disappears on the next save (settings object no longer carries it).

## Ribbon lifecycle (`main.ts`)

- `onload`: `syncRibbonMenus()` instead of the hardcoded `addRibbonIcon`.
- `syncRibbonMenus()`:
  1. For each previously registered element (tracked in a `{ name: string; el: HTMLElement }[]` field): `el.remove()`, and when `ribbonInternals()` is valid also splice the matching `ribbon-organizer:<name>` entry out of `leftRibbon.items` (keeps our own snapshot/grouping consistent; when internals are invalid grouping is disabled anyway, so DOM removal alone suffices).
  2. For each `settings.menus`: `addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id))`; track the returned element.
  3. `applyGrouping()`.
  - Idempotent; called from `onload` and from the settings section after every menu-level change (add/delete/rename/icon change). Obsidian's per-icon unload cleanups accumulated by re-registration are no-ops on already-detached elements — harmless.
- `openMenu(evt, menuId)`: looks up the menu by id in current settings (menu deleted since → no-op); renders `quickMenuEntries(menu.entries, …)` exactly as today, including the disabled empty-state item.
- `onunload`: unchanged (Obsidian removes registered ribbon icons; observer/divider cleanup as today).

## Settings UI

New `ui/QuickMenusSection.ts` class (extracted from `SettingTab.renderQuickCommands`, same shape as `GroupsSection`: one instance on the SettingTab, session state survives re-renders, re-renders into its own container). `SettingTab` delegates the commands tab to it.

- **Session state**: `expanded = new Set<string>()` of menu ids (default all collapsed), like GroupsSection.
- **Menu section header**: chevron (stored state) + **icon button** (current menu icon; click opens `IconSelectModal`, saves + `syncRibbonMenus()`) + **name input** (inline edit; on blur, trimmed empty or duplicate name reverts to the old name, otherwise saves + `syncRibbonMenus()`) + `· n` count (commands only, separators excluded) + delete button (removes menu, cleans `expanded`, saves + `syncRibbonMenus()`). Clicking header blank space toggles collapse (guard: ignore clicks on the icon button, name input, and delete button).
- **Section body** (hidden when collapsed via an `is-collapsed` class, same mechanism as GroupsSection): the existing per-entry rows (icon button / label input / up-down / remove, separators) scoped to that menu's `entries`, plus that menu's own "Add command" (CTA) + "Add separator" addbar. Entry-level changes call `saveSettings` only (no ribbon rebuild needed).
- **Bottom**: "New menu" button → `{ id: uuid, name: unique "New menu"/"New menu 2"/…, icon: "menu", entries: [] }`, added to `expanded`, save + `syncRibbonMenus()` + re-render.
- No filter box (menus hold few entries; the collapse headers are the overview). No drag-and-drop (keep the existing up/down buttons).

## v2 amendments (2026-07-23, user feedback on the live UI; mockup v2 approved)

- **Entry drag-and-drop replaces the up/down buttons.** Every entry row (commands and separators) gets a grip and is reorderable by drag; the up/down `ExtraButtonComponent`s are removed, only the trash button remains. Drop semantics mirror the Ribbon groups tab: dropping on a row inserts before it (same-menu moves adjust the index after removal); dropping on a menu **header** appends the entry to that menu's end — the own header included, which is also the way to move an entry to the last slot of its own menu (works while collapsed, does not expand it). A cancelled drag (Escape) clears any stranded drop highlight via the grip's `dragend`. The **grip is the drag handle** — rows contain a label input, so whole-row dragging would fight text selection; `setDragImage(row, …)` keeps the drag ghost sensible. Entry moves (including cross-menu) are entry-level changes: save + section re-render only, no ribbon rebuild.
- **Bound command always visible.** Each command row shows its full `commandId` in a faint small-type span right of the label input (same styling family as the Ribbon groups rows' plugin name). Overflow: CSS ellipsis truncation with the full id in the `title` attribute (hover reveals). Editing the label never changes the binding — the span makes that explicit.

## Out of scope

- Menu reordering in settings; per-menu drag-and-drop of entries.
- Preserving group membership across rename (documented limitation).
- Mobile-specific treatment (ribbon icons follow Obsidian's mobile behavior as today).

## Error handling

- `normalizeMenus` silently drops malformed persisted data (defensive read of our own file), never throws on load.
- Name conflicts are prevented at the UI (revert) and healed at load (suffix dedupe) — the ribbon never sees two identical ids from us.
- Internals-shape failure keeps today's behavior: grouping disabled with console error + Notice; menu icons still register/remove at the DOM level.

## Testing

- New `tests/quickMenus.test.ts` (vitest, Obsidian-free) for `normalizeMenus`: legacy migration (non-empty + empty `quickCommands`), absent data → default, malformed shapes dropped, missing ids filled, duplicate names suffixed, zero menus preserved.
- `quickMenuEntries` and its existing tests unchanged. Existing suite stays green: 23 tests today, plus the new file.
- Live verification in the dev vault via obsidian-cli (multi-menu register, icon/name change takes effect immediately, delete removes icon, migration from a 0.3.0 data.json).

## Docs & release

- README.md / README.zh.md: Quick commands section rewritten around multiple menus; note the rename-drops-group-membership limitation.
- docs/ARCHITECTURE.md: module map (new `core/quickMenus.ts`, `ui/QuickMenusSection.ts`), settings shape, ribbon lifecycle.
- Release **0.4.0** (settings schema change + feature), on explicit "cut" only.
