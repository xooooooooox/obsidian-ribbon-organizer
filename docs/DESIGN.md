# Design

The visual and copy language of Ribbon and Status Bar Organizer. New UI is measured against this file; when a rule here and the code disagree, one of them is wrong — fix whichever it is, in the same change.

## Voice

- Copy speaks the user's language, never the implementation's. No internal identifiers (`data.json`, observer, CSS classes, setting keys) in any user-visible string. The one developer-facing surface is the "Copy ribbon diagnostics" command, which may name JSON.
- Narrate by device and consequence ("Not on this device", "stays hidden"), not by mechanism.
- Controls say what happens; notices confirm what happened; errors say what failed and what to do next.
- Sentence case throughout. Brand casing is preserved: Ribbon and Status Bar Organizer, Obsidian, Commander, Iconize, Ungrouped.

## Icons

All icons are lucide via `setIcon`, one icon per meaning, everywhere:

| Meaning | Icon |
|---|---|
| Drag handle | `grip-vertical` |
| Expand / collapse | `chevron-down` / `chevron-right` |
| Shown / hidden toggle | `eye` / `eye-off` |
| Remove a container or clear a value (group, menu, badge) | `x` |
| Delete a data row (menu entry, rewrite rule) | `trash-2` |
| Move-to-group menu | `ellipsis-vertical` |
| Absent on this device | `help` |
| Pinned (keeps its own position) | `lock` |
| Rewrite rules | `wand-2` |
| Unset icon placeholder | `plus` |
| Display modes full / compact / icon-only | `text` / `ellipsis` / `circle-dot` — single source `MODE_ICON` (src/ui/statusBarMode.ts); row button and modal pill must stay visually identical |
| Settings tabs Ribbon / Quick menus / Status bar | `rows-3` / `menu` / `panel-bottom` |
| Tuck state on Ungrouped rows | `chevrons-up-down` / `chevrons-down-up` — outward = "Tuck into the menu", inward (lit `--text-accent`) = "Show on the ribbon" |
| More button default icon | `ellipsis` — user-replaceable via the icon picker |

- The brand icon `ribbon-organizer` (src/core/icons.ts) is drawn on a 100×100 grid with stroke weight matched to 24px lucide; it is the default icon for new quick menus and is listed in the icon picker.
- Dashed 1px border (`--background-modifier-border-hover`) on the Ungrouped header's icon slot = "this icon slot is editable" affordance, distinct from the unset-value dashed border under States.
- Icon rendering always goes through the chain in src/ui/iconRender.ts: lucide → Iconize pack (normalized to native metrics) → command default → `command` fallback.
- Icon sizing uses the `--icon-size` container variable (18 / 16 / 14px tiers) or `var(--icon-s, 16px)`; no hard-coded pixel sizes.

## Color

- Only Obsidian CSS variables; `styles.css` contains no literal color values.
- Three dimming tiers: a row that is absent on this device gets `opacity: 0.55`; hidden content gets `color: var(--text-faint)`; secondary info gets `text-faint` + `font-ui-smaller`.
- Accent has exactly three jobs: an active toggle state (`--text-accent` on the button), a selection or drop indicator (`--interactive-accent` underline, border, or inset bar), and the hover spotlight (outline + left bar). Nothing else is accented.

## Layout

- Row skeleton: `grip · [chevron] · icon · title · (inline note) · chip · buttons`, flex, `align-items: center`.
- The right-push spring (`margin-left: auto`) sits on the right-most information element on desktop; on phones, hidden info elements hand the spring to the button group — every phone rule that hides a spring carrier must reassign the spring.
- Gaps: 8px inside rows and headers; 2px inside button groups; Obsidian `--size-*` variables for tab chrome.
- Child rows indent 24px under their group header; flat lists don't indent.
- List frames: `1px solid var(--background-modifier-border)`, `var(--radius-m)`, `overflow: hidden`; rows separated by `border-top` with a first-child exemption.
- Small-caps label pattern (section titles, pack tags, strip label, separators): `font-ui-smaller`, uppercase, `letter-spacing: 0.05em`, `text-faint`.
- Pills and chips: count pill `radius 9px / padding 1px 8px / background-modifier-hover`; monospace plugin chip `radius 4px / background-secondary / 1px border`.

## States

- Hidden: title dimmed to `text-faint`, eye button becomes `eye-off` in accent.
- Absent on this device: row at `opacity 0.55`, `help` in the icon slot, italic faint right-side note "Not on this device"; the row still sorts.
- Right-side notes ("Not shown right now", "Keeps its own position", "Not on this device") share one style: italic, `text-faint`, right-aligned.
- Filtering and collapsing are independent classes: a non-empty search temporarily reveals matches inside collapsed groups without touching the stored collapsed state.
- Drop targets: insert positions use accent inset bars (top = before, bottom = after); an append-to-end container target (group/menu header) highlights whole-frame instead — accent outline (`2px`, offset `-2px`) plus a faint accent wash.

## Mobile

- `.is-phone`: rows wrap to two lines rather than truncate; touch targets ≥ 40px; decorative info (chips, previews) hides and the spring moves to the buttons.
- `body.is-mobile` (no hover anywhere): hover-only affordances become always-visible and grow (clear badge 17px with a 2px ring, color dot 28px, icon button 34px); iOS color input must be a real tap target, not a programmatic `.click()`.
- Floating status-bar pill: gated by `body.ribbon-organizer-mobile-sb`; one theming knob `--ribbon-organizer-sb-gap` (deliberately a CSS variable, not a setting); slides out with the navbar while scrolling or typing; `!important` only where fighting themes, always with a comment saying which fight.

## Interaction

- Drag: insert uses half-zone semantics (upper half = before, lower half = after); a row that contains a permanent input is dragged by its grip only; container headers accept append-to-end drops.
- Rename: click the name to edit in place; Enter commits, Escape restores.
- Entry rows show the owning plugin's name; the raw command id lives in the hover tooltip.
- Collapse: the whole header row toggles; buttons and inputs inside it are exempt. Collapsed state is session-only; newly created items start expanded.
- Pickers are `FuzzySuggestModal`s that render an icon preview next to each suggestion.
- Every section re-render goes through `withScrollPreserved`.
- Unset values (icon, color, seen chip before a rule applies) are expressed with dashed borders.
- The more button is RO-owned ribbon chrome (divider lifecycle), never a registered ribbon item; its menu mirrors the quick-menu pattern (DOM menu, icon + title per row, click = the original icon's action). Hidden icons never appear in it; an empty menu means no button.
