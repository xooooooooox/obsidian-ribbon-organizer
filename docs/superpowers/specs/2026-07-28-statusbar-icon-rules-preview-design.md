# Status Bar Rewrite Rules: Icon Targets, Live Preview, Auto-Template — Design

Mockup (定稿): https://claude.ai/code/artifact/7badc141-5c42-48ea-81fa-60f382aa8b4c

## Goal

Two field-feedback items on the per-item customize modal ("<item> — how it shows"):

1. A rewrite rule's target can only be another piece of text. Extend it to **icon + text, icon optional** — including icon-only (e.g. `Syncing...` → a lone spinner icon).
2. Rule authoring is too hard: even with the `{name}` note, users don't know how to write templates. Lower the barrier with **auto-generated templates on seen-chip click** and a **live preview** of every seen sample under the current rules.

Out of scope (decided): value transforms such as reformatting a captured `5 hours ago` into `hh:mm:ss`. The status text is the only data RO sees and it carries no sub-hour precision; computing a clock time from it would be invented precision. `{x}` stays pure carry-over. No `{x|...}` pipe syntax.

## Data model

`StatusBarRule` (src/core/statusBarRules.ts) gains one optional field:

```ts
export interface StatusBarRule {
  find: string;    // template: literal text with {name} placeholders
  replace: string; // output text: placeholders carry captured text over; may be ""
  icon?: string;   // optional icon id (Obsidian built-in or iconize pack), shown before the text
}
```

**Active-rule condition changes.** Today a rule participates iff `find !== ""`. New condition: `find !== ""` **and** (`replace !== ""` or `icon` set). A rule with both target parts empty is a draft row and never matches.

Behavior change (accepted): a legacy rule `{find: "x", replace: ""}` used to blank the matched text; it now becomes inert. Blanking an item wholesale is what the Icon only / hide controls are for.

`normalizeStatusBarRules` keeps `icon` when it is a non-empty string; anything else drops the field (not the rule). Old data.json files load unchanged; new files opened by old plugin versions lose only the icon field (their normalize ignores unknown keys) — fail-soft in both directions.

## Pure layer (src/core/statusBarRules.ts)

### applyStatusBarRules

Signature changes from `(text, rules) => string` to:

```ts
export interface RuleResult { text: string; icon: string | null }
export function applyStatusBarRules(text: string, rules: StatusBarRule[]): RuleResult
```

First matching **active** rule wins (per the condition above). Match → `{ text: <replacement>, icon: rule.icon ?? null }`. No match → `{ text, icon: null }`. Replacement expansion (single-pass, no re-scan of captures) is unchanged.

### autoTemplateRule (new)

```ts
export function autoTemplateRule(sample: string, others: string[]): StatusBarRule
```

Called when a seen chip is clicked, with the other seen samples as context.

Algorithm (prefix-first; the template deliberately covers only ONE shared edge so the rule stays broad — templating both edges would narrow the match and strip units, turning `Successfully synced 5 hours ago` into a meaningless `5`):
1. Among candidates in `others` (excluding exact duplicates of `sample`), find the longest common **prefix** `P` with `sample` such that both remainders after `P` are non-empty. Winner → `{ find: P + "{x}", replace: "{x}" }` — the canonical pair yields find `Successfully synced {x}`, which also matches future `…just now` / `…33 minutes ago` states.
2. No prefix winner → same with the longest common **suffix** `S` (both remainders before `S` non-empty) → `{ find: "{x}" + S, replace: "{x}" }` (covers trailing-unit shapes like `{x} words`).
3. Ties on length: first candidate in `others` order wins.
4. No winner at all (no others, all identical, nothing shared) → literal fallback `{ find: sample, replace: sample }`, today's behavior.

Per the mockup, the clicked chip immediately shortens (the static edge is exactly the noise a rewrite exists to drop, and replace = `{x}` makes that visible at once in preview + live status bar); the user then adds an icon or edits the text.

The generated placeholder is always the single `{x}`; multiple changing regions are hand-edited afterwards (YAGNI).

## DOM engine (src/main.ts)

The engine keeps its "text nodes only" core, with one structural addition: a plugin-owned icon span.

- `rewriteStatusBarItem` applies `applyStatusBarRules` per text node as today. When the result carries an icon, ensure a `span.ribbon-organizer-sb-ricon` sits **immediately before that text node**, rendered via `renderIcon(span, icon, undefined, this.app)` (same helper as ribbon/picker, so iconize packs work). When the icon id changes, re-render the span; when the node's result has no icon (rule without icon, or no match), remove the span if present.
- The per-node memo extends to `{ original, written, iconEl?: HTMLElement }`. Icon-only means `written === ""` — a legal memo value; the `node.data === memo.written` self-write check is unaffected.
- `restoreStatusBarText` removes memoized icon spans along with restoring text. The childList MutationObserver on the status bar container ignores our span inserts the same way it ignores everything below item level (it observes the container without `subtree`).
- Raw-text derivation (`rawStatusBarText`, seen learning, Compact hover title) reads text nodes only and never sees the span — unchanged.

CSS (styles.css): `.ribbon-organizer-sb-ricon` — inline-flex, vertically centered, svg sized `var(--icon-s, 16px)` to match the existing `sb-icononly` sizing. The engine adds a modifier class `ribbon-organizer-sb-ricon-solo` when the rewritten text is empty; the base class carries a small `margin-right` and the solo modifier zeroes it, so icon-only never shows a stray trailing gap.

## Modal (src/ui/StatusBarItemModal.ts)

Per the mockup:

**Seen section → live preview.** Header unchanged ("Seen on this device — click one to start a rule"). Each sample becomes a row: `[chip original] → [rendered result]`. The result is `applyStatusBarRules(sample, rules)` rendered with the real icon (renderIcon) + text; a sample no rule matches renders as-is in a dashed "unchanged" style. Any rule edit re-renders the section. Chip click appends `autoTemplateRule(sample, others)` and re-renders.

**Rule rows.** `[find input] → [icon button] [replace input] [trash]`.
- Icon button states: unset → dashed `plus`; set → the chosen icon with a hover `×` badge that clears it. Click (either state) opens `IconSelectModal` (existing, reused as-is); choosing saves the rule's `icon`.
- Replace input placeholder: `Text (optional)`. Find placeholder unchanged (`Text to match`).
- Save-on-change semantics unchanged (commit on `change`, re-apply immediately).

**Note copy (final):** "Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both. Anything that doesn't match a rule is shown as-is."

## Testing

Extend `tests/statusBarRules.test.ts` (pure layer only, matching repo style):
- `applyStatusBarRules`: returns the matching rule's icon; `icon: null` when the rule has none or nothing matches; icon-only rule (replace `""` + icon) matches and yields `text: ""`; a rule with non-empty find but empty replace and no icon is inert (the legacy-blanking behavior change).
- `normalizeStatusBarRules`: keeps valid `icon`, drops non-string/empty icon, legacy entries unchanged.
- `autoTemplateRule`: prefix pair (`Successfully synced 5 hours ago` / `…4 hours ago` → find `Successfully synced {x}`, replace `{x}`); suffix fallback (`22 words` / `39 words` → find `{x} words`); prefix wins over suffix when both exist; empty-remainder guard (one sample being a pure prefix of the other); no others → literal identity; identical others → literal identity; longest-prefix partner selection among several.

DOM-side (icon span insert/replace/remove/restore) is covered by manual verification in the dev vault + the user's real-vault pass, consistent with how the existing rewrite engine is tested.

## Compatibility & docs

- data.json: additive field; old versions ignore it (their normalize drops unknown keys).
- docs/ARCHITECTURE.md status-bar section: rules paragraph gains the icon field, the icon-span structural exception, and autoTemplateRule.
- README feature blurb + screenshot refresh for the customize modal (queued with the store-submission screenshot pass).

## Addendum (2026-07-29): two batched extras

**Preview-strip drift fix.** Field bug: with the Status bar tab scrolled, the Workspaces Plus item's icon drifts relative to the preview strip. Root cause (verified on the live DOM): the plugin's icon child is `position: absolute` while the item, the strip, and the real status bar are all `static` — the icon's containing block sits outside the settings scroller, so it does not scroll with the strip. Fix: the strip becomes `position: relative !important` (was an explicit `static`), making it the containing block; auto offsets then resolve to the icon's static position inside the strip and the icon scrolls with it. `!important` is required: quick-explorer forces `.status-bar { position: static }` from a body-level selector whose specificity outguns our two classes (verified live in the dev vault).

**Owner-id chip.** Field feedback: a row's content preview ("Not shown right now", "6 hours ago") and its owner id ("obsidian-markmind") sit side by side in near-identical styling. Per the mockup (定稿): `ribbon-organizer-rg-plugin` becomes a monospace chip (mono font, subtle border + secondary background, small radius/padding); content preview styles unchanged. The class is shared with the Ribbon groups rows, which get the same treatment by design.
