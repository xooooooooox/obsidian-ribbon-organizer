# Status Bar Display Modes + Rewrite Rules + UX Fixes Design (0.11.0)

Five additions from the owner's 0.10.0 field feedback: a "Not shown right now" state for mounted-but-invisible items, half-zone drag semantics, per-item display modes (Full / Compact / Icon only), per-item template rewrite rules with seen-state learning, and a timeboxed investigation of the cmdr-adder position sensitivity.

Mockup (copy on it is final): https://claude.ai/code/artifact/3cc33b1b-7af0-4bdd-98db-e7d1fb340fea

## Goal

Rows for items that are mounted but currently invisible (vimrc pending-keys, markmind's empty state, Commander's opacity-0 adder) say so instead of looking broken. Dragging inserts before or after a row depending on which half the pointer is over. Every text-bearing row gets a wand opening a per-item customize modal: three display modes and template rewrite rules (`Successfully synced {time}` → `✓ {time}`), authored against a learned list of statuses actually seen on this vault. Unmatched text always shows as-is.

## Decisions already made

- **Rewrite is the generic layer only** (user-ruled): seen-state learning + template rules. No curated per-plugin adapter packs (the RS state alphabet extracted from its i18n table informed the template design; it does not ship as data).
- **Both features coexist** (user-ruled "都需要"): display modes for variable-only items (branch names, workspace names), rewrite rules for template-shaped text (RS, word count).
- **Fail-open is a hard constraint**: text matching no rule renders exactly as the plugin wrote it; a rule set can shorten, never blank.
- **Rules operate per text node, never per item**: only individual `Text` nodes are matched and rewritten; element structure, icons, and handlers are untouched. Items whose visible content has no text (metadata-menu's button) get no wand.
- **Rule-matching is template-based, not regex**: `{name}` matches any run of characters and carries into the replacement; everything else matches literally. First matching rule wins.

## Data model

`RibbonOrganizerSettings` gains three fields (all synced via data.json):

```ts
statusBarModes: Record<string, "compact" | "icon">; // absent id = Full (not stored)
statusBarRules: Record<string, { find: string; replace: string }[]>;
statusBarSeen: Record<string, string[]>;            // learned raw texts, per item, cap 8, LRU (newest last)
```

Normalizers (in the new core module): non-object → `{}`; keys must be strings; modes outside the enum dropped; rule entries need string `find`/`replace` (an empty `find` is KEPT — it never matches, and dropping it would delete a mid-edit rule row on reload; the engine skips empty finds explicitly); seen lists deduped, non-strings dropped, trimmed to the cap.

`applyStatusBarOrder()`'s `active` test widens to: any of `statusBarOrder`, `statusBarHidden`, `statusBarModes`, `statusBarRules` non-empty (`statusBarSeen` alone never activates — learning must not change rendering).

## Core module: `src/core/statusBarRules.ts` (pure)

- `applyStatusBarRules(text: string, rules: { find: string; replace: string }[]): string` — compiles each `find` template (literal parts regex-escaped; `{name}` placeholders become lazy `([\s\S]+?)` groups; anchored `^…$`), returns the first match's `replace` with placeholders substituted; no match → `text` unchanged. Malformed templates (unbalanced braces, empty or duplicate names) and empty `find`s simply never match — fail-open.
- `pushSeen(list: string[], text: string, cap: number): string[]` — trimmed, empty dropped, dedupe (move-to-end), cap from the front.
- `normalizeStatusBarModes(raw: unknown)`, `normalizeStatusBarRules(raw: unknown)`, `normalizeStatusBarSeen(raw: unknown)` per Data model.

## Snapshot contract additions (main.ts → UI)

`StatusBarSnapshotItem` gains:

```ts
shown: boolean;                    // the element is actually painted: offsetWidth > 0 AND computed display ≠ none AND computed opacity ≠ 0
mode: "full" | "compact" | "icon"; // resolved from statusBarModes
ruleCount: number;                 // rules configured for this id
hasText: boolean;                  // a non-empty Text node exists now, or rules/seen entries exist (wand eligibility)
textDisplayed: string;             // what the bar currently shows (post-rewrite); === text when no rule matched
```

`text` stays the RAW plugin text (pre-rewrite) — seen learning uses raw only. The row preview shows `textDisplayed` (what the user actually sees on the bar, matching the mockup's `✓ 2 hours ago`).

## Feature 1: "Not shown right now"

- Rows where `!hidden && !missing && !shown`: grey-italic tag `Not shown right now` in the preview slot; strip omits their clones; spotlight not wired (nothing to light). Drag, hide, mode, and rules all remain available.
- Right-side slot precedence: missing tag > pinned tag > not-shown tag > preview text.

## Feature 2: Half-zone drag

- On `dragover`, the pointer's vertical half of the row decides the insertion side: top half = before (`is-drop-before`, inset top accent line), bottom half = after (`is-drop-after`, inset bottom line). Drop computes the index accordingly; the last row's bottom half therefore reaches the end.
- The footer hint stays an append target (habit compatibility). Pinned rows remain neither drag sources nor drop targets.

## Feature 3: Display modes

- Row button cycles Full → Compact → Icon only (icon reflects current mode; tooltip = mode name). The modal offers the same three as pills.
- **Compact**: inline `max-width: 12em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on the item, plus `title` = current raw text (kept fresh by the apply pass and, on rule-bearing items, the rules observer) so hover reveals the full text.
- **Icon only**: a per-item class `ribbon-organizer-sb-icononly` whose styles.css rule zeroes text (`font-size: 0; letter-spacing: 0`) and restores icon children (`.ribbon-organizer-sb-icononly svg, … .svg-icon { font-size: initial }` with explicit icon sizing) — pure CSS, content untouched.
- Applied in the same apply pass as order/display; cleared on unload (inline styles, class, `title`). Strip clones inherit both modes faithfully (class + inline styles clone along).

## Feature 4: Rewrite rules + learning

- **Engine**: per rule-bearing item, one MutationObserver (`characterData: true, childList: true, subtree: true`). On fire (and once at apply): walk the item's `Text` nodes; for each, `out = applyStatusBarRules(node.data, rules)`; write only when `out ≠ node.data`. Loop safety: a `WeakMap<Text, { original: string; written: string }>` remembers, per node, the raw value we transformed and the value we wrote — a node whose data equals its `written` is skipped entirely (kills self-triggering and any oscillating rule set), and a changed `data` re-records `original` before transforming. Observers are created/torn down when rules are added/removed; on unload (and on rule removal) each remembered node whose data still equals `written` is restored to `original` — best effort: if the plugin rewrote meanwhile, its own next update wins anyway.
- **Learning**: raw text-node values (pre-transform, whitespace-collapsed, non-empty) feed `pushSeen` at three sample points: every apply pass, every settings render, every rules-observer fire. `saveSettings()` only when a genuinely new value entered a list (no write churn).
- **Wand button** on rows with `hasText`; purple (accent) when `ruleCount > 0`; tooltip `Rewrite rules`.

## Feature 5: Customize modal (`src/ui/StatusBarItemModal.ts`)

Opened by the wand. Copy final per mockup:

- Title: `{display name} — how it shows`
- Section `Display`: three pills (Full / Compact / Icon only), current selected.
- Section `Seen on this device — click one to start a rule`: chips from `statusBarSeen[id]` (newest first); clicking one appends a rule with `find` prefilled with that text (user then carves out `{name}` themselves).
- Section `Rewrite rules`: one row per rule — `find` input, →, `replace` input, trash; an add button below.
- Footer note: `Use {name} for the part that changes; it carries over to the result. Anything that doesn't match a rule is shown as-is.`
- Every change saves, re-applies, and refreshes the section behind the modal.

## Feature 6: cmdr-adder position investigation (timeboxed, non-blocking)

Reproduce in the dev vault: a synthetic `opacity: 0` hover-reveal item placed as the first ordered element after a `flex-grow` pinned spacer. Verify the hypothesis (the invisible 24px hover target sits in visually empty stretch space and cannot be found/hit). Deliverable: a written finding in the SDD ledger; if confirmed, the "Not shown right now" tag (which the adder already carries) plus one README sentence is the whole product response — no code fix.

## Edge behaviors

- Hidden or missing items: mode/rules stay configured and inert; they re-engage when the item shows again.
- Pinned items: modes and rules apply normally (they only touch text/width, not position).
- An item whose id has rules but is absent on this device: no observer created; config kept.
- Rules on multi-text-node items work per node (word count's two segments need two rules); the engine never concatenates across nodes.
- Compact + rewrite compose: rules shorten the text, Compact caps whatever remains.
- Seen list on a rewrite-bearing item records raw (pre-transform) values only — a rule's own output can never become a "seen" sample.

## Out of scope (YAGNI)

- Regex rules; cross-node matching; per-plugin adapter packs; per-device modes/rules; rule import/export; live re-render of the settings list on every status text change.

## File structure

- Create: `src/core/statusBarRules.ts` (pure: template engine, pushSeen, three normalizers) + `tests/statusBarRules.test.ts`.
- Modify: `src/main.ts` — settings fields + load; snapshot additions (shown/mode/ruleCount/hasText/textDisplayed); apply pass (modes, rules pass, seen sampling, widened active); rules-observer manager; unload teardown.
- Modify: `src/ui/StatusBarSection.ts` — not-shown tag, half-zone dnd, mode + wand buttons.
- Create: `src/ui/StatusBarItemModal.ts`.
- Modify: `styles.css` — not-shown tag, drop-before/after indicators, icononly rule, mode/wand states, modal layout.
- Modify: `README.md` / `README.zh.md` / `docs/ARCHITECTURE.md` (equal README line counts).

## Testing

Unit (pure layer): template compile/apply (literal, single/multi placeholder, first-match-wins, no-match passthrough, malformed-template fail-open, regex-special literals), `pushSeen` (dedupe/LRU/cap), three normalizers.

Live verification (dev vault): not-shown tag on a synthetic `display:none` item; half-zone insert-before/after incl. drag-to-end via last row's bottom half; mode cycling (compact truncation + title, icononly hides text keeps icon, strip mirrors); rules on a synthetic self-rewriting item (fake plugin interval rewrites text; our rule keeps winning without loops — assert via mutation counters); seen list accumulates raw values and caps; modal round-trip; unload restores text/styles/observers.

Real-device: phone pill with modes/rules active.

## Docs and release

Same-branch docs (docs-currency gate). Version **0.11.0**, same release flow.
