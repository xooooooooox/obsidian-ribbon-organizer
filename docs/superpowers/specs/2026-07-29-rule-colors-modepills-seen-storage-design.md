# Status Bar Rules: Per-Part Colors, Mode-Icon Pills, Seen → localStorage — Design

Mockup (定稿): https://claude.ai/code/artifact/24daa669-3e95-44eb-8d88-003711411c5c

## Goal

Three batched items for 0.13.0:

1. **Per-part rule colors.** A rewrite rule can color its icon, its text, or both — independently, with different colors allowed. Canonical example: the vimrc-support mode indicator (`NORMAL` green / `INSERT` orange / `VISUAL` yellow / `REPLACE` red), replacing a user CSS snippet; also "icon-only red" error states (Remotely Save ✗ turns red, text stays default).
2. **Mode icons on the Display pills.** The customize modal's Full / Compact / Icon only pills gain the same lucide icons the settings-row mode button uses (`text` / `ellipsis` / `circle-dot`), so the two surfaces read as one control.
3. **Seen states move out of data.json.** `statusBarSeen` is device-local by definition ("Seen on this device") yet lives in data.json, so every learned state dirties the file — config-sync shows a permanent "to capture", and relative-time statuses (Remotely Save) re-dirty it hourly. Move it to Obsidian's vault-scoped device-local storage (`app.loadLocalStorage`/`saveLocalStorage`), with a one-time migration that scrubs the legacy field.

## Data model (src/core/statusBarRules.ts)

```ts
export interface StatusBarRule {
  find: string;       // template: literal text with {name} placeholders
  replace: string;    // output text; may be ""
  icon?: string;      // optional icon id, shown before the text
  iconColor?: string; // optional CSS color for the icon (hex from the color input)
  textColor?: string; // optional CSS color for the rewritten text
}

export interface RuleResult {
  text: string;
  icon: string | null;
  iconColor: string | null;
  textColor: string | null;
}
```

- **Active-rule condition unchanged**: `find !== "" && (replace !== "" || icon set)`. Colors are modifiers and never activate a rule on their own (the chip auto-template always fills the text, so a colors-only draft is not reachable through the happy path).
- `applyStatusBarRules`: a match carries the rule's colors through (`?? null`); no match → both `null`.
- `normalizeStatusBarRules` keeps `iconColor`/`textColor` when each is a non-empty string; anything else drops the field (not the rule). Old data.json loads unchanged. A device still on 0.12.x drops the color fields on save (its normalize keeps only find/replace/icon) — same lockstep-upgrade story as 0.12.0's icon field; release notes repeat the warning.

## DOM engine (src/main.ts)

Two color sinks, matching the two parts:

- **Icon color** lands on the plugin-owned icon span (we own it outright). `syncRuleIconSpan` gains the colors and sets the span's inline `color`:
  - `iconColor` set → that color;
  - `iconColor` unset but `textColor` set → `var(--status-bar-text-color)` — an explicit reset so the host tint (below) does not bleed into an uncolored icon (`--status-bar-text-color: var(--text-muted)` is the bar's own text color in app.css);
  - neither → `""` (inherit, today's behavior).
- **Text color** lands on the host `.status-bar-item` element as inline `color` — text nodes cannot be styled directly and wrapping them would break the text-nodes-only invariant. Semantics: the first node with a colored match wins for the item — an uncolored match doesn't block a later node's color (multi-node items are rare; documented, not configurable).
  - New per-element memo `statusBarHostColor: WeakMap<HTMLElement, string>` records the element's prior inline `style.color` on first tint (usually `""`).
  - A `syncHostTextColor(el, color | null)` helper runs at the end of every `rewriteStatusBarItem` pass: desired color → apply (memoizing prior once); `null` → restore prior + drop memo. Because it runs every pass, the rules-emptied and no-match paths converge without extra branches.
  - `restoreStatusBarText` also calls `syncHostTextColor(el, null)`.

## Modal (src/ui/StatusBarItemModal.ts)

Per the mockup:

**Rule row anatomy**: `[find] → [icon button] [icon color dot] [replace input] [text color dot] [trash]`.

- Dot button (`ribbon-organizer-sbm-dotbtn`, 24px round) — three states matching the icon button: unset = dashed border + hollow dashed swatch; set = filled swatch in the rule's color, with the hover × clear badge (same pattern/classes as the icon clear). aria-labels: "Pick an icon color" / "Pick a text color"; clear badges "Remove icon color" / "Remove text color".
- Click (either state) opens the native color picker via a visually hidden `input[type="color"]` child: value preset to the dot's own color, else the *other* part's color (two clicks = same color on both), else `#888888`. Commit on the input's `change` event → save rule → `renderContent()` (dot state changed).
- Clearing removes the field from the rule (object rebuilt without it, same as icon clear).
- **Seen preview rows** render the colors: result icon span gets inline `color: iconColor` when set; result text span gets `color: textColor` when set.
- **Note copy (final)**: "Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both — each can carry its own color. Anything that doesn't match a rule is shown as-is."

**Display pills**: each pill gains a leading icon span rendered with `setIcon` from the shared mode metadata (below); label text unchanged. CSS: pill becomes inline-flex with a small gap; svg sized 13px.

## Shared mode metadata (new src/ui/statusBarMode.ts)

`MODE_ICON` / `MODE_NAME` / `MODE_NEXT` currently live inline in `StatusBarSection.render`. Extract to a tiny module exporting the three consts (typed `Record<"full" | "compact" | "icon", …>`); `StatusBarSection` imports them (local copies deleted), the modal imports `MODE_ICON`/`MODE_NAME`. No behavior change. (Modal cannot import from `StatusBarSection` — that would be circular.)

## Seen storage (src/main.ts)

- `RibbonOrganizerSettings` loses `statusBarSeen`; the plugin gains an in-memory field `statusBarSeen: Record<string, string[]> = {}`.
- Storage key: `const SEEN_STORAGE_KEY = "ribbon-organizer-status-bar-seen"` — `app.loadLocalStorage`/`app.saveLocalStorage` are vault-scoped and device-local.
- `loadSettings`:
  1. `this.statusBarSeen = normalizeStatusBarSeen(this.app.loadLocalStorage(SEEN_STORAGE_KEY))` (normalize doubles as repair for hand-edited storage);
  2. **Migration**: if `raw.statusBarSeen` is present, normalize it and merge — ids already in device storage win wholesale, legacy-only ids are taken as-is — then `saveLocalStorage` the merged map and `await this.saveSettings()` once to scrub the field from data.json (saveData writes the settings object, which no longer carries it). The save happens only when the legacy field existed, so clean loads never write.
- `learnStatusBarText`: updates the field; the existing 2s debounce now flushes to `saveLocalStorage` instead of `saveSettings` — data.json is never touched by learning again.
- Teardown: a pending debounce timer is cleared AND flushed (`saveLocalStorage` is synchronous, safe in onunload) — today's clear-only path silently drops the last sample.
- Readers move to the field: `statusBarSnapshot`'s `hasText`, the modal's seen list.
- config-sync effect: one capture after the upgrade scrubs `statusBarSeen` from the store, then permanent quiet.

## Out of scope

- Per-segment text coloring inside one item (rejected: breaks the text-nodes-only engine invariant for a need nobody has).
- Color presets/palettes in the picker — the OS picker's own affordances suffice.
- Syncing seen states across devices (they are per-device by definition).

## Testing

Extend `tests/statusBarRules.test.ts` (pure layer only):

- `applyStatusBarRules`: matched rule carries `iconColor`/`textColor`; fields are `null` when the rule lacks them and when nothing matches; existing deep-equality assertions on RuleResult gain the two fields.
- `normalizeStatusBarRules`: keeps valid `iconColor`/`textColor`; drops empty-string/non-string values (field only, rule survives); legacy entries unchanged.

Engine (host tint apply/restore, span reset), modal dots, pills, and the localStorage migration are covered by dev-vault smoke + the user's real-vault pass, consistent with the existing rewrite engine.

## Compatibility & docs

- data.json: additive rule fields; legacy `statusBarSeen` field migrates away on first 0.13 load.
- Release notes must repeat the lockstep warning: saving settings on a 0.12.x device drops rule colors (and a 0.11.x device still loses icons).
- docs/ARCHITECTURE.md: rule/RuleResult fields, the host-tint + span-reset mechanism, seen storage location + migration, the shared mode-metadata module.
- README feature blurb + screenshots stay queued with the store-submission pass.
