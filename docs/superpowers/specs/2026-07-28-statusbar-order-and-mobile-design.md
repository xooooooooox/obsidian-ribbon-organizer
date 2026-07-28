# Status Bar Ordering + Mobile Display Design (0.9.0)

Two features for a new **Status bar** settings tab: drag-to-reorder the status bar items (desktop and mobile, one shared order), and an opt-in switch that shows the status bar on phones/tablets as a floating pill above the toolbar — a productization of the owner's `mystyle-mobile.css` snippet.

Mockup (copy on it is final): https://claude.ai/code/artifact/3cc33b1b-7af0-4bdd-98db-e7d1fb340fea

## Goal

Settings → Ribbon Organizer → Status bar shows a toggle ("Show on phones and tablets") and a flat drag list of the status bar items. Dragging persists an order that applies on every device; items a device doesn't have are skipped there. With the toggle on, mobile devices float the status bar above the navbar, sliding away while scrolling or typing.

## Decisions already made

- **MVP is ordering + mobile display only.** No grouping, no dividers, no hide toggle — the data model must not block adding them later, but nothing is built for them now.
- **One shared order across devices** (data.json syncs via config-sync). Absent items keep their stored position so a reorder on one device never evicts another device's items.
- **Third settings tab "Status bar"** (icon `panel-bottom`), parallel to Ribbon and Quick menus.
- **Mechanism: per-item inline flex `order` + MutationObserver** — same as the ribbon (approach A). DOM order untouched, idempotent, fully reverted on unload. Rejected: injected per-class stylesheet (plugin-level granularity only), DOM reordering (fights item-recreating plugins; the ribbon deliberately avoided it too).
- **Identity: `key#index` from DOM classes** (no registry exists — `app.statusBar` is just `{app, containerEl}`). Known limitation accepted: a plugin creating multiple items in unstable order can swap its own items' slots. Mitigation today is the graceful order semantics (skip missing, append new); escalation path if real reports arrive is extra-class fingerprint matching — explicitly not built now.
- **Mobile display default OFF** — upgrading users and users without the snippet see zero change.
- **Mobile pill styling ships statically in `styles.css`**, gated on a body class the plugin toggles. Rejected: dynamic style injection (Commander's `#cmdr` pattern) — nothing here is dynamic except the on/off.

## Data model

`RibbonOrganizerSettings` gains two fields:

```ts
statusBarOrder: string[];        // item ids, left-to-right; [] = live order untouched
statusBarShowOnMobile: boolean;  // default false
```

Order semantics (pure, `computeStatusBarOrder(stored, live)`):

- Stored ids get increasing flex-order values in stored sequence; ids not live on this device are **kept in the array but skipped** (no order emitted).
- Live ids not in stored append after the stored ones, in live DOM order.
- Settings list rows render exactly this sequence (stored order with missing rows interleaved, then new items); persisting after a drag writes the row id sequence verbatim, so absent ids keep their place.

`normalizeStatusBarOrder(raw)` repairs data.json: non-array → `[]`; drops non-strings and duplicates (first wins). `statusBarShowOnMobile` is `=== true`.

## Item identity (`src/core/statusBarItems.ts`)

Pure derivation from an element's class list, per live item in DOM order:

- Generic classes ignored everywhere: `status-bar-item`, `mod-clickable`.
- A `plugin-<id>` class present → **key = `<id>`**, all other classes ignored (state classes like `is-clean` never affect identity).
- No `plugin-` class → key = remaining classes, sorted, joined with `+` (observed cases: `cmdr+cmdr-adder`, `left-region`); no classes left → `item`.
- **id = `${key}#${n}`**, n = 0-based occurrence among live items sharing the key, DOM order.

Display name: `app.plugins.manifests[key]?.name`; fallback (core items, non-plugin keys) prettifies the key's most specific (longest) class — dashes to spaces, first letter capitalized (`word-count` → "Word count", `cmdr+cmdr-adder` → "Cmdr adder"). Rows of a key with ≥2 rows show a muted `· 1` / `· 2` ordinal (1-based). Each live row also shows a muted live-text preview (`textContent`, whitespace collapsed; CSS ellipsis does the truncation) and a plugin-id chip (the key).

## Apply + guard (`src/main.ts`)

- `statusBarInternals()`: `app.statusBar.containerEl instanceof HTMLElement` or null. Null → set a session `statusBarDisabled` flag, `console.error`, Notice "Ribbon Organizer: status bar ordering is incompatible with this Obsidian version." — mirror of the ribbon's incompatibility pattern.
- `applyStatusBarOrder()`: short-circuits to a no-op while `statusBarOrder` is `[]` (fresh install: the bar stays byte-for-byte native). Otherwise: scan direct `.status-bar-item` children, derive ids, compute orders, set inline `order` per element (`setCssStyles`); clear order on elements with no entry. Idempotent. (A drag always persists the full row sequence, so the array never returns to `[]` afterwards.)
- MutationObserver on the container, **childList only, no subtree, no attributes** — item add/remove re-applies; the high-frequency inner text churn (word count, git status) never fires it. Disconnected while applying (the ribbon's anti-self-trigger pattern), reconnected after.
- First apply in `onLayoutReady`; `onunload` disconnects the observer and clears every inline `order`.

## Settings UI (`src/ui/StatusBarSection.ts` + `SettingTab.ts`)

- Third tab `{ id: "statusbar", label: "Status bar", icon: "panel-bottom" }`; declarative `aliases` gain `"status bar"`, `"statusbar"`, `"mobile status bar"`.
- Tab body, top to bottom (copy final per mockup):
  - Toggle **"Show on phones and tablets"** — desc "Obsidian normally hides the status bar on mobile. Turn this on to float it above the toolbar; it slides away while you scroll or type." On change: save + re-apply the body class immediately (no restart).
  - Desc line: "Drag to reorder the status bar. The same order applies on every device; items a device doesn't have are skipped there."
  - Flat drag list: grip + name (+ ordinal) + live preview + key chip; missing rows get a help icon, dashed border, "Not on this device", no preview. Drop target = insert before the hovered row; drag code is a simplified self-contained copy of the GroupsSection pattern (its group semantics don't apply — no shared module extracted, GroupsSection untouched).
  - Footer hint: "New items appear at the end."
- Incompatible internals → the section renders the incompatibility note instead of the list (same as Ribbon tab).
- On drag persist: save settings, `applyStatusBarOrder()`, re-render section. No filter (≈15 items), no eye toggles (no hide in MVP).

## Mobile display

- Body class **`ribbon-organizer-mobile-sb`**: added when `Platform.isMobile && statusBarShowOnMobile`, removed otherwise; toggled on setting change, load, and unload. Desktop DOM never gains the class even when the synced setting is on.
- `styles.css` block, all selectors gated `body.ribbon-organizer-mobile-sb.is-mobile`, ported from `mystyle-mobile.css`:
  - Positioning vars: `--ribbon-organizer-sb-gap: 32px` (snippet-overridable knob, not a setting) and bottom offset `calc(var(--mobile-toolbar-height, 52px) + gap)` — deliberately **no** `safe-area-inset-bottom` (the navbar box already covers it; adding it double-counts).
  - Pill: `display: flex !important` (defeats core's mobile hide), `margin-bottom: 0 !important` (defeats Remotely Save's injected lift), `position: fixed` right/bottom, `flex-wrap: wrap`, `justify-content: flex-end`, radius/border/shadow, opaque two-layer background (solid `--background-primary` + `--background-secondary` gradient — theme surface vars can carry alpha).
  - Auto-hide (not configurable): `.is-hidden-nav` (scrolling) and `:has(.cm-editor.cm-focused)` (typing) slide the pill fully off-screen (`translateY(100% + bottom offset)`) with the navbar's 0.3s ease-out timing.
  - Theme compat layer (commented as such): `transform: none !important` at rest, and `.anp-floating-status-bar .status-bar::before { content: none }` (AnuPpuccin's hover hit-area).
  - Items: `white-space: nowrap`, ellipsis, `max-width: 60vw`.

Migration note (owner vault): after enabling the toggle, disable the `mystyle-mobile.css` snippet — it is status-bar-only, and running both stacks conflicting `!important` rules.

## Edge behaviors

- Late-loading plugin adds an item mid-session → observer re-applies; the new item lands after all ordered ones.
- A plugin removes/re-adds its item → same id re-derived, slot restored.
- Live changes while the settings tab is open are not reflected until the next render (same as the Ribbon tab today).
- Stored ids never garbage-collected automatically: an uninstalled plugin's id stays as a "Not on this device" row everywhere; the user can drag it anywhere or ignore it. (Explicit removal UI is out of scope — the row is harmless and disappears from effect.)
- `statusBarOrder: []` (fresh install) → the apply pass is a no-op until the user first drags; the bar renders exactly as Obsidian built it.

## Out of scope (YAGNI)

- Grouping/dividers and hide toggles for status bar items.
- Per-device orders; a gap/position setting for the pill; auto-hide opt-outs.
- Fingerprint-based identity matching (escalation path only).
- Removing stale stored ids automatically.

## File structure

- Create: `src/core/statusBarItems.ts` — key/id derivation, `computeStatusBarOrder`, `normalizeStatusBarOrder`, fallback-name prettifier (pure).
- Create: `src/ui/StatusBarSection.ts` — toggle + drag list.
- Modify: `src/main.ts` — settings fields, `statusBarInternals()`, `applyStatusBarOrder()`, observer, body-class toggle, onLayoutReady/onunload wiring.
- Modify: `src/ui/SettingTab.ts` — third tab, aliases.
- Modify: `styles.css` — settings list styles (reuse `rg-` row look with `sb-` classes), mobile pill block.
- Create: `tests/statusBarItems.test.ts`.

## Testing

Unit (vitest, pure layer only per repo strategy): key derivation (plugin-prefix, state-class immunity, fallback join, occurrence numbering), `computeStatusBarOrder` (stored-first, missing skipped and retained, new appended in live order), `normalizeStatusBarOrder` (non-array, non-strings, duplicates), fallback-name prettifier.

Live verification (dev vault, desktop): tab renders real items with names/previews/ordinals; drag persists and the bar reorders instantly; reload keeps the order; late plugin enable appends its item and the observer re-applies; plugin unload restores the native bar; toggle flips the setting (no visual effect on desktop).

Real-device verification (phone; the desktop dev vault cannot render the pill): toggle on shows the pill above the navbar; order matches desktop minus absent items; pill hides while scrolling and while the keyboard is up; toggle off restores the hidden bar; owner vault: disable `mystyle-mobile.css` first.

## Docs and release

- Same-branch doc updates (docs-currency gate): `README.md` / `README.zh.md` — new Status bar feature section (ordering + mobile toggle; note that Obsidian hides the status bar on mobile by default and ordering applies wherever the bar is visible); `docs/ARCHITECTURE.md` — new core/UI modules, identity scheme and its accepted limitation, body-class mechanism.
- Version **0.9.0** (new feature; same release flow: bare tag, CI draft, hand-written notes, publish).
