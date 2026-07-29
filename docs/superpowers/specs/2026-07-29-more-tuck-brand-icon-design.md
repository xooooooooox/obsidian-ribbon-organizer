# Brand Icon V3, Element-Anchored Commander Hide, More-Menu Tuck — Design

Mockup (定稿, rev 2 / Model B): https://claude.ai/code/artifact/a9baea07-7c1d-4898-9ce1-e1385fe3b931

## Goal

Three items for 0.16.0:

1. **Brand icon** — after the rename to "Ribbon & Status Bar Organizer", the icon still draws only the ribbon half. Redraw per mockup V3: full-width bottom status bar, shortened sidebar.
2. **Bug fix** — a Commander-title-hidden icon reappears in the Ungrouped run while its plugin temporarily rewrites the aria-label (field case: Remotely Save's "syncing from manual" label during sync). Anchor the hide to the element instead of the title.
3. **Feature** — per-icon "tuck into a more menu" for Ungrouped icons: chosen icons leave the ribbon and open from one ⋯ button; the button's icon is customizable (default `ellipsis`).

Out of scope (decided): per-group collapse (Ungrouped only); auto-repairing the native hidden flag when only Commander's layer is set (rejected as silently mutating workspace state); any phone-surface change (the navbar ≡ menu keeps flat-listing every icon, tucked included).

## 1. Brand icon (V3)

`BRAND_ICON_SVG` (src/core/icons.ts), `assets/icon.svg`, and the same glyph embedded in `assets/logo.svg` (README hero, white strokes on gradient) change together (existing sync contract in the file comment). Geometry on the 24-grid, same `scale(4.1667)` wrapper and stroke weight:

- frame `rect x=2.5 y=3 w=19 h=18 rx=3` (unchanged)
- sidebar divider shortens: `M9 3v14.5` (was `v18`)
- full-width status bar: `M2.5 17.5h19` (new)
- sidebar glyphs: dots (5.75, 7.5) and (5.75, 11) r=1.2, dash `M4.4 14h2.7` (the third dot at y=17 is dropped — it would collide with the bar)
- status text dash: `M16.5 19.4h2.4` (new)

## 2. Element-anchored Commander hide (bug fix)

**Root cause.** RO's Commander-compatible hide layer is CSS keyed by title: `div.side-dock-ribbon-action[aria-label="<title>"]`. A plugin that temporarily rewrites its icon's aria-label (Remotely Save during sync) escapes the selector; the icon becomes visible but `computeRibbonLayout` counted it hidden, so it has no owned position and reads as "in Ungrouped". The label reverts on sync end and the icon vanishes again.

**Fix.** `applyGrouping` already computes `cmdrHidden = cmdrHiddenTitles()`. For every internals item with `buttonEl !== null`, toggle the class `ribbon-organizer-cmdr-hidden` on `buttonEl` to match `cmdrHidden.has(title)`. styles.css:

```css
.ribbon-organizer-cmdr-hidden { display: none !important; content-visibility: hidden; }
```

The class is anchored to the element (registration identity), so aria-label churn cannot pierce it. Commander's own title-keyed stylesheet is still rebuilt exactly as today (`rebuildCmdrStyle` untouched — it is Commander's data and other Commander surfaces read it); this class is a second, robust layer on top. The native hidden flag and user data are untouched; layout semantics are unchanged (these items already count as hidden).

Staleness bound: the class updates on every `applyGrouping` pass — same freshness as the existing `cmdrHidden` layout input. Consequence, accepted at final review (record-only, 2026-07-29): an unhide performed inside Commander's OWN settings UI only rebuilds Commander's stylesheet, which no longer suffices to reveal the icon — the element keeps this class until the next ribbon rebuild (any ribbon churn or a restart). Hides in either UI and unhides through RO's own toggle stay immediate (`setIconHidden` re-runs `applyGrouping`). Release-notes item.

## 3. More-menu tuck (Model B)

### Data model (data.json, synced)

```ts
moreTucked: string[]; // ribbon item ids ("pluginId:title") tucked into the menu
moreIcon: string;     // icon id for the more button; default "ellipsis"
```

- `normalizeMoreTucked(raw)`: array → keep unique strings, else `[]`.
- `normalizeMoreIcon(raw)`: non-empty string, else `"ellipsis"` (`DEFAULT_MORE_ICON` in src/core/ribbonGroups.ts).
- **Claim wins.** Tucking is only meaningful for unclaimed (Ungrouped) icons. Pure helper `pruneTucked(groups, moreTucked): string[]` removes every id claimed by a named group; called after load-normalize and after every groups mutation persist. Moving a tucked icon into a group therefore un-tucks it.

Additive fields: old plugin versions ignore them; nothing else in data.json changes shape.

### Layout (src/core/ribbonGroups.ts)

`LiveRibbonItem` gains a required `tucked: boolean` (callers pass it explicitly). `RibbonLayout` gains `moreOrder: number | null`.

`computeRibbonLayout` changes only in the sentinel walk:

- Every member still receives an order (the "every live id gets one" invariant holds; tucked elements are display-hidden so their order is inert).
- After the sentinel's members, if any sentinel member has `hidden === false && tucked === true`, emit `moreOrder = next++`; otherwise `moreOrder = null`.
- The group-visibility rule for dividers is **unchanged**: a non-hidden member keeps the segment visible whether tucked or not — if it is tucked, the more button occupies the segment, so the divider is still earned.
- `tucked` is only honored for sentinel members; a claimed member's flag is ignored (belt to `pruneTucked`'s suspenders).

`computeMenuRows` (phone) ignores `tucked` entirely.

### Ribbon rendering (src/main.ts applyGrouping)

- Tucked set = `settings.moreTucked` restricted to live unclaimed ids; passed into the layout call.
- Toggle class `ribbon-organizer-tucked` on each item's `buttonEl` to match membership (same CSS effect as the cmdr class, separate name — the two states have different owners and different lifecycles).
- **The more button is an RO-owned element, not a registered ribbon item** (registering one would list it inside RO's own settings and recurse). Lifecycle identical to the dividers: removed and re-created on every pass, `cls: "side-dock-ribbon-action ribbon-organizer-more"`, `aria-label: "More"`, icon rendered via the shared `renderIcon` path (so iconize icons work), flex order `String(moreOrder)`. `moreOrder === null` → no element.
- Click opens a standard `Menu` at the button's rect: one entry per tucked, non-hidden live item in live order — item icon (shared `renderIcon` path) + the item's title; `onClick` fires `item.buttonEl.click()` (programmatic click dispatches on a display-hidden element, so this is exactly "clicking the original icon").
- Hidden wins: an item that is natively/Commander-hidden never appears in the menu and never keeps the button alive.
- Known cosmetic edge (accepted): a user who Commander-hid an icon literally titled "More" would also hide this button via Commander's title CSS.

### Settings UI (src/ui/GroupsSection.ts, Ungrouped only)

- **Per-row tuck button** (new ExtraButton next to the eye, Ungrouped rows only), two states per the mockup:
  - untucked: icon `chevrons-up-down`, tooltip **"Tuck into the menu"**
  - tucked: icon `chevrons-down-up`, modifier class `is-tucked` coloring it `var(--text-accent)` (the repo's accent token for lit row buttons) (same modifier-class pattern as the eye's `is-eye-off`), tooltip **"Show on the ribbon"**
  - Click toggles membership in `moreTucked`, persists, re-applies grouping, re-renders.
- **Header icon slot**: on the Ungrouped header (right side), a button showing the current `moreIcon` in a dashed-border editable affordance, tooltip **"Change the menu icon"**. Click opens the existing `IconSelectModal` (same picker as Quick menus, iconize packs included); choosing saves `moreIcon` and re-applies. No reset control — picking `ellipsis` again is the way back (YAGNI).
- Badge, count pill, drag semantics unchanged: tucked items are not hidden, count as visible, and keep live-order rules.

## Testing

Pure layer (existing test files for ribbonGroups):

- `computeRibbonLayout`: `moreOrder` emitted right after the sentinel members; `null` when nothing is tucked; `null` when the only tucked member is hidden; a fully-tucked (non-hidden) sentinel still earns its divider; tucked flag on a claimed member ignored; order invariant (every live id) holds with tucked members.
- `normalizeMoreTucked` / `normalizeMoreIcon`: defaults, dedupe, non-string dropping.
- `pruneTucked`: claimed ids removed, unclaimed kept, order preserved.

DOM side (dev-vault smoke, consistent with how applyGrouping is verified today): tuck/untuck round-trip, menu click-through triggers the action, empty-menu button absence, and the RS repro — simulate an aria-label rewrite on a cmdr-hidden icon and confirm it no longer surfaces.

## Compatibility & docs

- data.json: additive fields only; fail-soft both directions.
- DESIGN.md: icon vocabulary (chevrons pair for tuck states, `ellipsis` default, dashed editable affordance), the more-button element exception (RO-owned, not a ribbon item), and the copy entries above.
- ARCHITECTURE.md: settings-shape enumeration (+`moreTucked`/`moreIcon` and their normalizers, `pruneTucked`), the applyGrouping paragraph (element-anchored classes + more button lifecycle), the Commander section (element-anchored layer + the accepted unhide-staleness above), and the core/ribbonGroups module bullet (`moreOrder`).
- README (EN/中文): feature blurb for the more menu + brand icon note; screenshots queued with the store-submission pass.
- Version candidate: 0.16.0.
