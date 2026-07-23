# Ribbon hide + settings polish + plugin icon — Design (0.5.0)

## Goal

Three user requests on the Ribbon tab plus brand assets:

1. Rename the "Ribbon groups" tab to **"Ribbon"**.
2. **Hide support**: an eye toggle per icon row that hides/shows the ribbon icon, unifying Obsidian's native hide and Commander's hide under one switch.
3. **Group header polish**: drop the pencil button (click the name to rename inline, same interaction as the Quick commands tab) and replace the `· n` count text with a count pill.
4. **Plugin icon** (chosen candidate RO-B: app window + left rail): repo logo assets, README embed, social preview, iconize-importable mono SVG.

Mockups approved 2026-07-23 (`mockup-batch3.html` §1, icon `mockup-ro-icons-r2.html` RO-B).

## Hide semantics (user-specified, 定稿)

RO is a **stateless mirror** over the two existing hide layers — it stores nothing in its own settings:

- **Read**: an icon is *hidden* iff `native ∨ commander` — Obsidian's native flag (`leftRibbon.items[].hidden`, persisted in `workspace.json` → `left-ribbon.hiddenItems`) OR its title is in Commander's `settings.hide.leftRibbon`.
- **Write (hide)**: set BOTH layers — native flag on, title added to Commander's list.
- **Write (unhide)**: clear BOTH layers — otherwise the still-set layer would keep the icon hidden and the toggle would appear broken.
- **Commander absent/disabled**: degrade to native-only, silently (existence guard, no error). Commander's own hide UI stays usable; RO re-reads its list on each render.
- No origin distinction in the UI: a row is either hidden or not (rules 1–4 of the user's truth table).

### Native write path (verified in dev vault 2026-07-23)

```ts
item.hidden = v;                       // item found in leftRibbon.items by ribbon id
leftRibbon.onChange(true);             // toggles every buttonEl, setChildrenInPlace, requestSaveLayout()
this.applyGrouping();                  // MUST follow: setChildrenInPlace drops our injected dividers
```

`onChange` is a stable-looking internal (`function(e){… o.toggle(!r.hidden) … this.ribbonItemsEl.setChildrenInPlace(t), e&&this.workspace.requestSaveLayout()}`). Accessed through the existing `ribbonInternals()` validation; if the shape check fails (no `onChange` function), hide is disabled with the same console-error + Notice pattern as grouping.

### Commander write path

Commander (plugin id `cmdr`) hides via a module-private CSS builder — not callable from outside — so RO replicates its exact effect:

```ts
const cmdr = (this.app as …).plugins?.plugins?.cmdr;      // undefined when absent/disabled
// shape guard: cmdr.settings.hide.leftRibbon is string[] AND cmdr.saveSettings is a function
cmdr.settings.hide.leftRibbon = add/remove(title);         // matched by TITLE (aria-label), cmdr's own convention
await cmdr.saveSettings();
rebuildCmdrStyle(cmdr.settings.hide);                      // re-create style#cmdr with cmdr's exact rule format
```

`rebuildCmdrStyle` (new, `main.ts` or a small helper module) mirrors cmdr's builder byte-for-byte:

```
div.side-dock-ribbon-action[aria-label="${title}"] {display: none !important; content-visibility: hidden;}   // per leftRibbon entry
div.status-bar-item.plugin-${id} {display: none !important; content-visibility: hidden;}                     // per statusbar entry (preserved, not touched by RO)
```

then replaces `document.head` `style#cmdr` (remove + append, exactly like cmdr does). Without this, same-session unhide would not take effect (the stale rule keeps matching until restart). If the shape guard fails while cmdr is enabled: skip the cmdr write, `console.error` + one Notice ("Ribbon Organizer: Commander settings shape unexpected — hid natively only").

Known, documented limitations (cmdr's own): title-keyed matching collides across same-titled icons; renaming an icon (e.g. a quick menu) orphans its cmdr entry → effectively unhidden after rename.

## Effective visibility feeds layout

`main.ts` snapshot construction computes `hidden = nativeHidden || cmdrHidden(title)` per item and passes that into the existing pure `computeRibbonLayout` (`LiveRibbonItem.hidden` — no signature change). This fixes the **phantom divider** bug: today a group whose members are all Commander-hidden still counts as visible and draws a divider. `RibbonSnapshotItem.hidden` likewise becomes the effective value (settings UI reads it).

The cmdr title set is re-read from `cmdr.settings.hide.leftRibbon` at snapshot time (cheap; no caching, no event coupling).

## Settings UI (GroupsSection)

- **Tab**: `TABS[0].label` "Ribbon groups" → "Ribbon" (`ui/SettingTab.ts`); settings-search definition desc "Ribbon groups and quick commands." → "Ribbon and quick commands."; tab description line gains the hide sentence: "Order the left-ribbon icons into groups and toggle their visibility. Hiding here also hides in Obsidian and Commander."
- **Header** (mockup §1 After):
  - Pencil `ExtraButtonComponent` removed. Clicking the name swaps it for an inline input (reuses `startRename` mechanics — Enter/Escape/blur; empty reverts; unchanged reverts). The header click-to-collapse guard already ignores INPUT; it must now also ignore clicks on the name span itself (they start a rename, not a collapse).
  - Count: `· n` span → pill (`.ribbon-organizer-rg-count` restyled): `n` = all member rows (missing included, exactly today's number). When the group has at least one effective-hidden live member, the pill shows `v/n` (total dimmed) where `v = n − hiddenCount`; otherwise it shows plain `n`.
  - Delete ✕ stays; Ungrouped header (badge, no buttons) unchanged.
- **Item rows** (mockup §1 展开组):
  - New eye `ExtraButtonComponent` left of the ⋮ move button: eye = visible (click hides), eye-off = hidden (click shows). Tooltip "Hide this icon" / "Show this icon".
  - Hidden rows: greyed icon + title (new `is-hidden` row class, same visual family as `is-missing`) + a small `hidden` chip after the title; eye-off button accented.
  - Toggle → plugin method `setIconHidden(itemId, hidden)` (native + cmdr writes above) → section re-render.
- Rows for **missing** items (not on this device) get no eye (nothing to hide here).

## Icon assets (RO-B)

New `assets/` directory (repo root, next to README):

- `assets/icon.svg` — the RO-B mark, 24×24, stroke 2, `currentColor`, no background. This is the iconize-importable file (user copies it into an iconize pack).
- `assets/logo.svg` — README tile: rounded-square gradient background (the mockup's orange→purple tile) + white mark, 256×256.
- `assets/social-preview.svg` — 1280×640: dark card, mark + "Ribbon Organizer" wordmark + one-line tagline "Group, reorder and hide your Obsidian ribbon icons". PNG export for GitHub upload is produced at implementation time if a local rasterizer is available (headless Chrome); otherwise the SVG ships and conversion is left to the user (GitHub accepts PNG/JPG only — noted in the task).
- README.md / README.zh.md: logo centered at top (`<img src="assets/logo.svg" width="96">` above the title), plus a "Plugin icon" note in the iconize context is NOT added (YAGNI — the file existing is enough).

## Out of scope

- Hiding from the ribbon context menu, or any always-on watcher reconciling external hide changes mid-session (RO re-reads state on render; live drift resolves on next look).
- Migrating/importing Commander's existing hidden list into anything — the mirror semantics make import meaningless (RO already sees them as hidden).
- Statusbar hiding (cmdr's other half) — RO preserves those rules verbatim when rebuilding `style#cmdr` but never edits them.
- Mobile treatment (unchanged from grouping).

## Error handling

- All internals access behind shape guards; failure = feature-degraded with console error (+ Notice for the cmdr-shape case), never a throw during load or toggle.
- `setIconHidden` on an id no longer live: no-op (row is stale; next render drops it).

## Testing

- Unit (vitest, Obsidian-free): `computeRibbonLayout` phantom-divider case (group with all-hidden members produces no divider — extends existing tests); cmdr style-text builder (pure: `(hide: {leftRibbon, statusbar}) => cssText`) — exact rule format, empty lists → empty string; effective-hidden merge helper if extracted.
- Dev-vault e2e (obsidian-cli): install cmdr into `dev/vault` (copy from the main vault, enable); then — eye-hide sets native flag AND cmdr list AND rebuilds `style#cmdr`; icon disappears; divider re-applied after `onChange`; eye-show clears both layers and the icon reappears same-session; pre-hidden-by-cmdr-only icon renders as hidden row (rule 3); cmdr disabled → toggle still works native-only (rule degradation); count pill `v/n` matches.

## Docs & release

- README.md / README.zh.md: Ribbon tab rename, hide feature (mirror semantics, one paragraph incl. the two cmdr limitations), logo at top.
- docs/ARCHITECTURE.md: hide write/read paths, `rebuildCmdrStyle`, effective-hidden snapshot, assets dir.
- Release **0.5.0** (feature), on explicit "cut" only.
