# Status Bar Hide + Preview + Pinned-Item Fix Design (0.10.0)

Three additions to the Status bar tab shipped in 0.9.0: per-item hide (asymmetric two-layer with Commander), a live preview (in-tab mini strip + three-way hover spotlight), and the pinned-item fix for the quick-explorer left-region bug found on the owner's vault.

Mockup (copy on it is final): https://claude.ai/code/artifact/3cc33b1b-7af0-4bdd-98db-e7d1fb340fea

## Goal

Every status bar row gets an eye toggle that hides the item on every device. A mini preview strip above the list mirrors the real bar (true element clones, including left/right split), and hovering any one of a row, its strip clone, or the real bar item highlights the other two. Items that position themselves via their own CSS `order` (quick-explorer's left-region, `order: -9999` + `flex-grow: 1`) are recognized as pinned: Ribbon Organizer stops overriding their position — which is the bug fix — and their rows show a lock instead of a drag grip.

## Decisions already made

- **Hide is asymmetric two-layer** (user-ruled): hiding writes ONLY the plugin's own per-item list (Commander's `hide.statusbar` is plugin-id-granular and cannot express single items). Reading merges both layers; showing clears both.
- **Preview is both mechanisms** (user-ruled): mini strip AND hover spotlight.
- **Pinned fix ships in 0.10.0**, not as a 0.9.1 hotfix (user-ruled). Root cause (verified live): inline `order` overrides a plugin's own CSS `order`, so the `flex-grow: 1` spacer that natively pins itself first (`order: -9999`) lands mid-bar and splits it; everything ordered before it falls to the left side.
- Pinned detection is generic (computed `order ≠ 0` with the inline value cleared), not a quick-explorer special case; it equally protects `order: 9999`-style right-pinned items.

## Data model

`RibbonOrganizerSettings` gains:

```ts
statusBarHidden: string[]; // item ids hidden by this plugin's own layer; [] default
```

Normalized by the existing `normalizeStatusBarOrder` (generic id-list repair: non-array → `[]`, non-strings and duplicates dropped) — reused, not duplicated.

## Hide semantics

- **Effective hidden** (what the UI shows and the strip omits) = id ∈ `statusBarHidden` **OR** Commander hides the item's plugin key (`cmdrAccess` ok ∧ `hide.statusbar` contains the key; only meaningful for `plugin-<id>`-keyed items — fallback keys like `cmdr+cmdr-adder` never match).
- **Hide**: append id to `statusBarHidden`, save, re-apply. Commander is never written on hide.
- **Show**: remove id from `statusBarHidden`; if Commander also hides the plugin key: remove the key from `hide.statusbar`, `saveSettings()` on Commander, rebuild `style#cmdr` (existing `withTitle`/`rebuildCmdrStyle`), **and migrate state**: every OTHER live item of that plugin gets added to `statusBarHidden` first — clearing a plugin-level rule must not reveal siblings the user didn't ask to see. Commander `broken` state: own layer still updates; Notice `Ribbon Organizer: Commander settings look unexpected — the item may stay hidden by Commander.`
- **Applying**: own-layer hidden live items get inline `display: none` (`setCssStyles`) in the same apply pass as ordering; cmdr-layer hiding stays cmdr's stylesheet's job (no duplication). Unload clears inline `display` together with `order`.
- Hidden items keep receiving order values (harmless, mirrors the ribbon). Same list syncs everywhere: mobile pill obeys it too. Missing rows have no eye (nothing live to toggle).

## Pinned items (the bug fix)

In the apply pass, per live element: clear its inline `order`, read `getComputedStyle(el).order`, then write. All inside one JS task — the browser never paints between, so there is no flicker.

- Computed order `≠ "0"` → **pinned**: the plugin positions this item itself. No inline `order` is ever written (the cleared value stays cleared, undoing 0.9.0's override); its own `flex-grow`/margin tricks keep working where the plugin put it.
- Computed order `= "0"` → participates in ordering as today.
- `computeStatusBarOrder(stored, live, pinned)` gains a `pinned: Set<string>` parameter: pinned ids get no order entry (signature change; tests updated).
- Pinned ids already stored in `statusBarOrder` (the owner's vault has one) stay in the array harmlessly — kept in the row list at their stored position, but never applied. No migration needed; the bar heals on first apply after upgrade.
- Row rendering: lock icon (`setIcon "lock"`) instead of the grip, not draggable and not a drop target, tag `Keeps its own position`, key chip kept, eye kept (hiding a pinned item is legitimate — inline `display: none` doesn't touch its order).
- Pinned detection result is exposed on the snapshot (`pinned: boolean`) for the UI.

`applyStatusBarOrder()`'s no-op condition widens: it short-circuits only when `statusBarOrder` AND `statusBarHidden` are both empty. With only hides set, the pass writes `display` values and leaves every `order` untouched.

## Snapshot contract (main.ts → UI)

```ts
export interface StatusBarSnapshotItem {
  id: string;
  text: string;     // collapsed textContent preview
  pinned: boolean;  // positions itself via CSS order
  hidden: boolean;  // effective: own layer OR Commander
}
```

Plus `setStatusBarItemHidden(id: string, hidden: boolean): Promise<void>` on the plugin (the eye's target; encapsulates the two-layer logic above), and `statusBarLiveElements(): Map<string, HTMLElement>` for the spotlight and strip cloning (one DOM scan per settings render, not one per row).

## Mini preview strip

- Rendered between the list desc and the list. Label (final copy): `Preview · hover a row or an item to locate it`.
- One entry per **visible** live item (effective-hidden and missing items omitted), built by `cloneNode(true)` of the real element — icons, text, and the item's own plugin/theme CSS come along via its classes, so the strip is pixel-faithful, including the left/right split (a pinned spacer clone keeps its `order: -9999` + `flex-grow: 1`).
- Clone hygiene: strip every `id` attribute from the clone and its descendants (quick-explorer's `#quick-explorer` must not duplicate), set `aria-hidden="true"` on the strip container; `cloneNode` copies no event listeners. Static snapshot; re-rendered with the section on every persist/eye toggle.
- Container: `<div class="status-bar ribbon-organizer-sb-strip">` — the `status-bar` class makes theme/plugin item selectors match the clones; `ribbon-organizer-sb-strip` re-asserts layout (static position, full width, wrap, radius/border) after core's rules. Plugin styles load after core CSS, so equal-specificity overrides win. Consequence handled: every selector in the 0.9.0 mobile-pill block gains `:not(.ribbon-organizer-sb-strip)` so the pill styling can never grab the strip inside the settings modal, and the strip sets its own `display: flex` so core's mobile `display: none` on `.status-bar` doesn't blank it on phones (where the strip is the only preview available, the spotlight being useless under a full-screen settings view).

## Hover spotlight (three-way)

- Hovering a settings row, its strip clone, or the real bar item highlights the other two: `mouseenter`/`mouseleave` toggle `ribbon-organizer-sb-spot` on the real element and the strip clone, and `is-hovered` on the row.
- CSS: `outline: 1.5px solid var(--interactive-accent)` + offset + small radius on `.ribbon-organizer-sb-spot`; row `is-hovered` gets an accent border (mockup look).
- The real bar item also gets mouseenter/mouseleave listeners while the tab is rendered (registered per render, cleaned up on re-render/section teardown via a stored cleanup list).
- Missing rows: no spotlight (nothing live). Hidden rows: spotlight skipped (target is `display: none`).

## Copy (final, per mockup)

- List desc becomes: `Drag to reorder the status bar; the eye hides an item everywhere. The same order and visibility apply on every device; items a device doesn't have are skipped there.`
- Eye tooltips: `Hide this item` / `Show this item`. Pinned tag: `Keeps its own position`. Strip label: `Preview · hover a row or an item to locate it`.
- Commander-broken Notice as under Hide semantics.

## Edge behaviors

- Showing an item whose plugin Commander hides, while Commander is `absent`: own layer clears; if the item stays invisible it is because Commander's stale stylesheet is gone with it — nothing to do.
- A pinned item that is also stored-hidden: hidden wins visually (inline `display: none`); unhide restores its self-positioned spot.
- Strip with zero visible items renders empty (no placeholder needed; the hint below still explains the list).
- Spotlight class left behind by a mid-hover re-render: cleanup list removes listeners and strips `ribbon-organizer-sb-spot` from any live element on teardown.

## Out of scope (YAGNI)

- Grouping/dividers; per-device visibility; live-updating strip text; drag within the strip; spotlight on phones.

## File structure

- Modify: `src/core/statusBarItems.ts` — `computeStatusBarOrder` pinned param; `cmdrHiddenSiblings(key: string, liveIds: string[], shownId: string): string[]` (pure: the other live ids sharing the key).
- Modify: `src/main.ts` — `statusBarHidden` field + load; apply pass (pinned detect, display writes, widened no-op); snapshot fields; `setStatusBarItemHidden`; `statusBarLiveElement`; unload clears `display`.
- Modify: `src/ui/StatusBarSection.ts` — eye buttons, pinned rows, strip, spotlight wiring + cleanup.
- Modify: `styles.css` — hidden/pinned row states, strip layout, spot outline, `:not(.ribbon-organizer-sb-strip)` on the pill block.
- Modify: `tests/statusBarItems.test.ts` — pinned-aware order cases, `cmdrHiddenSiblings`.
- Modify: `README.md` / `README.zh.md` / `docs/ARCHITECTURE.md` — hide + preview + pinned semantics (equal README line counts).

## Testing

Unit (pure layer): `computeStatusBarOrder` with pinned ids (no entry emitted, numbering unaffected for others), `cmdrHiddenSiblings` (same-key siblings minus the shown id; empty for fallback keys with one item).

Live verification (config-sync dev vault unless the RO dev vault is open — back up its installed build first, restore after): pinned detection on a synthetic `order:-9999; flex-grow:1` item (bar splits correctly and RO leaves it alone; list shows the lock row); eye hides/shows instantly and survives reload; show-on-cmdr-hidden clears cmdr's rule, siblings stay hidden, `style#cmdr` rebuilt byte-format-identical; strip mirrors order/visibility incl. the split; hover row/strip/real-item highlights the other two; unload restores everything (orders, displays, spot classes).

Owner-vault check after release: the left-region split heals on first load without touching `statusBarOrder`.

## Docs and release

- Same-branch docs (docs-currency gate); version **0.10.0**, same release flow (bare tag, CI draft, hand-written notes; pinned fix called out as the headline bug fix for 0.9.0 upgraders).
