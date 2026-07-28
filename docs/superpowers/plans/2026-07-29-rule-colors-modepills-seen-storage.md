# Rule Colors + Mode Pills + Seen Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite rules gain independent icon/text colors, the modal's display pills gain the settings-row mode icons, and learned seen states move from data.json to device-local storage (fixing config-sync's permanent "to capture").

**Architecture:** Colors ride the existing rule pipeline (StatusBarRule fields → RuleResult → DOM engine sinks: the plugin-owned icon span for icon color, an item-level inline tint for text color). Mode metadata is extracted to a shared module. Seen states become a plugin field backed by `app.loadLocalStorage`/`saveLocalStorage` with a one-time data.json migration.

**Tech Stack:** TypeScript (strict), Obsidian API, vitest, esbuild.

**Spec:** docs/superpowers/specs/2026-07-29-rule-colors-modepills-seen-storage-design.md

## Global Constraints

- **NO GIT COMMITS.** The controller snapshots files for review; the single release commit happens at cut time. Never run `git commit`.
- Strict typing; no `any` (narrow `unknown` immediately). Match existing file style: comment density, naming, `el.setCssStyles` over raw style writes where the repo uses it.
- Engine invariant: rules touch Text nodes only; the icon span is the ONLY plugin-owned element; the host-item inline `color` is the ONLY plugin-touched host style, always memoized and restored.
- UI copy verbatim from this plan (mockup copy is final). Modal note: `Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both — each can carry its own color. Anything that doesn't match a rule is shown as-is.`
- Mode icons: full=`text`, compact=`ellipsis`, icon=`circle-dot` (must stay identical to the settings-row button).
- Seen storage key: `ribbon-organizer-status-bar-seen`.
- Gates per task: `npx vitest run` green; `npm run lint` 0 errors; `npm run build` clean when src changed.

---

### Task 1: Pure layer — rule colors

**Files:**
- Modify: `src/core/statusBarRules.ts` (StatusBarRule, RuleResult, applyStatusBarRules returns, normalizeStatusBarRules)
- Test: `tests/statusBarRules.test.ts`

**Interfaces:**
- Consumes: existing pure layer.
- Produces: `StatusBarRule.iconColor?: string; textColor?: string`; `RuleResult { text: string; icon: string | null; iconColor: string | null; textColor: string | null }` — Tasks 3 and 4 rely on these exact names.

- [ ] **Step 1: Write failing tests** — add to `tests/statusBarRules.test.ts`, matching the file's existing describe/it style:

```ts
// under the applyStatusBarRules describe block:
it("carries the matched rule's colors through", () => {
  expect(applyStatusBarRules("NORMAL", [{ find: "NORMAL", replace: "NORMAL", textColor: "#00983d" }]))
    .toEqual({ text: "NORMAL", icon: null, iconColor: null, textColor: "#00983d" });
});
it("carries iconColor independently of textColor", () => {
  expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "", icon: "rotate-cw", iconColor: "#e05252" }]))
    .toEqual({ text: "", icon: "rotate-cw", iconColor: "#e05252", textColor: null });
});
it("returns null colors when nothing matches", () => {
  expect(applyStatusBarRules("other", [{ find: "NORMAL", replace: "x", textColor: "#00983d" }]))
    .toEqual({ text: "other", icon: null, iconColor: null, textColor: null });
});

// under the normalizeStatusBarRules describe block:
it("keeps valid rule colors and drops invalid ones (field, not rule)", () => {
  expect(normalizeStatusBarRules({ id: [
    { find: "a", replace: "b", iconColor: "#ff0000", textColor: "#00ff00" },
    { find: "c", replace: "d", iconColor: "", textColor: 5 },
  ] })).toEqual({ id: [
    { find: "a", replace: "b", iconColor: "#ff0000", textColor: "#00ff00" },
    { find: "c", replace: "d" },
  ] });
});
```

- [ ] **Step 2: Run tests, confirm the new ones fail** (existing RuleResult deep-equality tests will ALSO start failing after Step 3 — that's expected; they get the two null fields in Step 4). Run: `npx vitest run`.

- [ ] **Step 3: Implement.** In `src/core/statusBarRules.ts`:

Interface (extend, keeping existing comments):
```ts
export interface StatusBarRule {
  find: string;       // template: literal text with {name} placeholders for the changing parts
  replace: string;    // output text: placeholders carry the captured text over; may be ""
  icon?: string;      // optional icon id (Obsidian built-in or iconize pack), shown before the text
  iconColor?: string; // optional CSS color for the icon
  textColor?: string; // optional CSS color for the rewritten text
}

export interface RuleResult {
  text: string;
  icon: string | null;
  iconColor: string | null;
  textColor: string | null;
}
```

`applyStatusBarRules` — only the two return statements change:
```ts
    return { text: out, icon: icon === "" ? null : icon, iconColor: rule.iconColor ?? null, textColor: rule.textColor ?? null };
  }
  return { text, icon: null, iconColor: null, textColor: null };
```

`normalizeStatusBarRules` — replace the entry-building block (the `if (typeof find === "string" ...)` body) with incremental construction:
```ts
      if (typeof find === "string" && typeof replace === "string") {
        const rule: StatusBarRule = { find, replace };
        const icon = entryObj.icon;
        if (typeof icon === "string" && icon !== "") rule.icon = icon;
        const iconColor = entryObj.iconColor;
        if (typeof iconColor === "string" && iconColor !== "") rule.iconColor = iconColor;
        const textColor = entryObj.textColor;
        if (typeof textColor === "string" && textColor !== "") rule.textColor = textColor;
        rules.push(rule);
      }
```

- [ ] **Step 4: Update existing RuleResult assertions** — every existing `toEqual({ text: …, icon: … })` on an `applyStatusBarRules` result gains `iconColor: null, textColor: null`. Mechanical sweep of the file.

- [ ] **Step 5: All tests pass.** Run: `npx vitest run` → expect 96 passing (92 + 4 new). Then `npm run lint` (0 errors) and `npm run build`.

---

### Task 2: Seen states → device-local storage

**Files:**
- Modify: `src/main.ts` (settings interface ~line 21, defaults ~131, field block ~147, onunload ~175, loadSettings ~200, hasText ~313, learnStatusBarText ~472)
- Modify: `src/ui/StatusBarItemModal.ts` (lines 56 and 102: seen reads)

**Interfaces:**
- Consumes: `normalizeStatusBarSeen`, `pushSeen`, `SEEN_CAP` (existing exports).
- Produces: public plugin field `statusBarSeen: Record<string, string[]>` — the modal and snapshot read it; data.json never carries seen states again.

- [ ] **Step 1: main.ts changes.**

Module scope (near other consts): `const SEEN_STORAGE_KEY = "ribbon-organizer-status-bar-seen";`

Remove `statusBarSeen: Record<string, string[]>;` from `RibbonOrganizerSettings` and `statusBarSeen: {}` from the defaults object. Keep `statusBarSeen?: unknown;` in `loadSettings`'s raw type (migration still reads it).

Add a public field next to `statusBarSeenTimer` (~line 147):
```ts
  // Learned raw status texts (cap 8, LRU newest-last). Device-local by definition ("seen on
  // this device") — stored via app.saveLocalStorage, never in data.json, which syncs across
  // machines and would churn on every relative-time status tick.
  statusBarSeen: Record<string, string[]> = {};
```

`loadSettings` — after `this.settings = { … }` (with the statusBarSeen line removed from the object):
```ts
    this.statusBarSeen = normalizeStatusBarSeen(this.app.loadLocalStorage(SEEN_STORAGE_KEY));
    // One-time migration: pre-0.13 kept seen states in data.json. Move them to device
    // storage (entries already on this device win) and scrub the field with a single save.
    if (raw.statusBarSeen !== undefined) {
      const legacy = normalizeStatusBarSeen(raw.statusBarSeen);
      for (const [id, list] of Object.entries(legacy)) {
        if (this.statusBarSeen[id] === undefined) this.statusBarSeen[id] = list;
      }
      this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
      await this.saveSettings();
    }
```

`learnStatusBarText` — reads/writes the field; the debounce flushes to device storage (update the method comment: churn no longer touches data.json at all):
```ts
    const current = this.statusBarSeen[id] ?? [];
    const isNew = !current.includes(collapsed);
    this.statusBarSeen[id] = pushSeen(current, collapsed, SEEN_CAP);
    if (isNew && this.statusBarSeenTimer === null) {
      this.statusBarSeenTimer = window.setTimeout(() => {
        this.statusBarSeenTimer = null;
        this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
      }, 2000);
    }
```

`onunload` timer block — flush instead of dropping the pending sample (saveLocalStorage is synchronous):
```ts
    if (this.statusBarSeenTimer !== null) {
      window.clearTimeout(this.statusBarSeenTimer);
      this.statusBarSeenTimer = null;
      this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
    }
```

`statusBarSnapshot` hasText: `(this.statusBarSeen[id] ?? []).length > 0`.

- [ ] **Step 2: Modal reads.** In `StatusBarItemModal.ts` replace both `this.plugin.settings.statusBarSeen[this.id]` with `this.plugin.statusBarSeen[this.id]` (lines 56 and 102).

- [ ] **Step 3: Sweep.** `grep -rn "settings.statusBarSeen" src/` must return nothing.

- [ ] **Step 4: Gates.** `npx vitest run` (96), `npm run lint`, `npm run build`.

---

### Task 3: DOM engine — color sinks

**Files:**
- Modify: `src/main.ts` (`rewriteStatusBarItem` ~410, `syncRuleIconSpan` ~455, `restoreStatusBarText` ~489, new WeakMap + helper)

**Interfaces:**
- Consumes: `RuleResult.iconColor/textColor` (Task 1).
- Produces: item-level tint behavior Task 4's preview mirrors; no exported API.

- [ ] **Step 1: Host-color memo + helper.** Next to `statusBarNodeMemo`:
```ts
  // Per host element: the inline color found before the first rule text-tint (restored when
  // the tint lifts) and the tint value we last wrote (the skip-guard for redundant writes).
  private statusBarHostColor = new WeakMap<HTMLElement, { prior: string; written: string }>();
```
New method after `syncRuleIconSpan` (the skip-guard compares against the value WE wrote — a
`style.color` read-back never string-matches a hex literal because CSSOM serializes it to `rgb()`):
```ts
  // Applies or restores the item-level text tint (rules color the whole item's text: text
  // nodes can't be styled directly, and wrapping them would break the text-nodes-only
  // invariant). Runs once per rewrite pass, so the no-match and rules-emptied paths
  // converge on restore without their own branches.
  private syncHostTextColor(el: HTMLElement, color: string | null): void {
    const memo = this.statusBarHostColor.get(el);
    if (color !== null) {
      // Skip-guard on the value WE wrote, not a style.color read-back: CSSOM serializes a
      // hex write into rgb(), so read-back never string-matches the rule's literal color.
      if (memo === undefined) {
        this.statusBarHostColor.set(el, { prior: el.style.color, written: color });
        el.setCssStyles({ color });
      } else if (memo.written !== color) {
        memo.written = color;
        el.setCssStyles({ color });
      }
      return;
    }
    if (memo !== undefined) {
      el.setCssStyles({ color: memo.prior });
      this.statusBarHostColor.delete(el);
    }
  }
```

- [ ] **Step 2: `syncRuleIconSpan` gains colors.** Signature: `(node: Text, existing: HTMLElement | undefined, icon: string | null, solo: boolean, iconColor: string | null, textColor: string | null)`. After the `toggleClass` line:
```ts
    // Icon color: its own color wins; an uncolored icon under a text tint gets the bar's
    // own color back (--status-bar-text-color) so the host tint doesn't bleed into it.
    span.setCssStyles({ color: iconColor ?? (textColor !== null ? "var(--status-bar-text-color)" : "") });
```

- [ ] **Step 3: `rewriteStatusBarItem` wiring.** Declare `let hostColor: string | null = null;` beside `rawFull`. **CRITICAL — the no-op check must treat colors as output**, or a color-only-visible rule (`NORMAL → NORMAL` + green) restores instead of tinting:
```ts
      const out = applyStatusBarRules(raw, rules);
      if (out.text === raw && out.icon === null && out.iconColor === null && out.textColor === null) {
        …existing restore branch unchanged…
      }
      if (hostColor === null && out.textColor !== null) hostColor = out.textColor; // first node with a colored match wins
      const iconEl = this.syncRuleIconSpan(node, prior?.iconEl, out.icon, out.text === "", out.iconColor, out.textColor);
```
At the end of the method (before the Compact-title line): `this.syncHostTextColor(el, hostColor);` — runs on every pass including rules-empty (loop `continue`s leave hostColor null → restore). Update the method's doc comment to mention the tint.

- [ ] **Step 4: `restoreStatusBarText`** — append `this.syncHostTextColor(el, null);` after the loop, and note it in the method comment.

- [ ] **Step 5: Gates.** `npx vitest run`, `npm run lint`, `npm run build`.

---

### Task 4: Modal — color dots, colored preview, note copy

**Files:**
- Modify: `src/ui/StatusBarItemModal.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `StatusBarRule.iconColor/textColor`, `RuleResult` colors (Task 1).
- Produces: final modal UI; no exports.

- [ ] **Step 1: `colorDot` helper method** (after `renderSeen`):
```ts
  // One per-part color dot: icon color or text color. Unset = dashed hollow dot; set =
  // filled swatch with a hover × badge. Click opens the native color input; its preset
  // falls back to the other part's color, so matching both parts takes two clicks.
  private colorDot(rowEl: HTMLElement, index: number, part: "iconColor" | "textColor"): void {
    const rule = this.rules()[index];
    const value = rule?.[part];
    const other = part === "iconColor" ? rule?.textColor : rule?.iconColor;
    const btn = rowEl.createEl("button", {
      cls: "ribbon-organizer-sbm-dotbtn",
      attr: { "aria-label": part === "iconColor" ? "Pick an icon color" : "Pick a text color" },
    });
    const swatch = btn.createSpan({ cls: "ribbon-organizer-sbm-dotswatch" });
    const input = btn.createEl("input", { cls: "ribbon-organizer-sbm-dotinput", attr: { type: "color" } });
    input.value = value ?? other ?? "#888888";
    if (value === undefined) btn.addClass("is-unset");
    else {
      swatch.setCssStyles({ backgroundColor: value });
      const clearEl = btn.createSpan({
        cls: "ribbon-organizer-sbm-iconclear",
        attr: { "aria-label": part === "iconColor" ? "Remove icon color" : "Remove text color" },
      });
      setIcon(clearEl, "x");
      clearEl.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = this.rules();
        const prev = next[index];
        if (prev !== undefined) {
          const copy = { ...prev };
          delete copy[part];
          next[index] = copy;
        }
        void this.saveRules(next).then(() => this.renderContent());
      });
    }
    btn.addEventListener("click", (event) => {
      if (event.target === input) return; // the programmatic input click bubbling back up
      input.click();
    });
    input.addEventListener("change", () => {
      const next = this.rules();
      const prev = next[index];
      if (prev !== undefined) next[index] = { ...prev, [part]: input.value };
      void this.saveRules(next).then(() => this.renderContent());
    });
  }
```

- [ ] **Step 2: Row wiring.** In the rules `forEach`, call `this.colorDot(rowEl, index, "iconColor");` immediately after the `iconBtn` click wiring (before `replaceEl` creation), and `this.colorDot(rowEl, index, "textColor");` after the `replaceEl` change wiring (before the trash button). Final DOM order: find → arrow → iconBtn → icon dot → replace → text dot → trash. Also: the icon-clear handler (line ~83) rebuilds the rule as `{ find, replace }`, which would silently drop colors — change it to spread-and-delete: `const copy = { ...prev }; delete copy.icon; next[index] = copy;`. Same for `commit` (line ~101): build from the saved rule minus the text fields, i.e. `next[index] = { ...(next[index] ?? {}), find: findEl.value, replace: replaceEl.value };` — preserving icon AND colors.

- [ ] **Step 3: Colored preview.** In `renderSeen`, the as-is condition gains the color fields: `if (out.text === sample && out.icon === null && out.iconColor === null && out.textColor === null)`. Then:
```ts
      if (out.icon !== null) {
        const iconSpanEl = resultEl.createSpan({ cls: "ribbon-organizer-sbm-result-icon" });
        renderIcon(iconSpanEl, out.icon, undefined, this.app);
        if (out.iconColor !== null) iconSpanEl.setCssStyles({ color: out.iconColor });
      }
      if (out.text !== "") {
        const textEl = resultEl.createSpan({ text: out.text });
        if (out.textColor !== null) textEl.setCssStyles({ color: out.textColor });
      }
```

- [ ] **Step 4: Note copy** (verbatim): `Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both — each can carry its own color. Anything that doesn't match a rule is shown as-is.`

- [ ] **Step 5: styles.css** — after the existing `sbm-iconbtn`/`sbm-iconclear` block:
```css
/* Rule color dots: one for the icon, one for the text. Same three states as the icon
 * button. The color input is the native picker trigger — visually hidden but clickable
 * (display:none would mute programmatic .click() in some engines). */
.ribbon-organizer-sbm-dotbtn {
  flex: none; width: 24px; height: 24px; border-radius: 50%; padding: 0;
  display: inline-flex; align-items: center; justify-content: center; position: relative;
  background: var(--background-primary); border: 1px solid var(--background-modifier-border);
  cursor: pointer;
}
.ribbon-organizer-sbm-dotbtn.is-unset { border-style: dashed; }
.ribbon-organizer-sbm-dotswatch { width: 12px; height: 12px; border-radius: 50%; }
.ribbon-organizer-sbm-dotbtn.is-unset .ribbon-organizer-sbm-dotswatch { width: 10px; height: 10px; border: 1.5px dashed var(--text-faint); }
.ribbon-organizer-sbm-dotinput { position: absolute; inset: 0; opacity: 0; pointer-events: none; border: none; padding: 0; }
```
Check how `.ribbon-organizer-sbm-iconclear` is scoped: if its selectors are written under `.ribbon-organizer-sbm-iconbtn`, extend each to also cover `.ribbon-organizer-sbm-dotbtn` (the clear badge must look and hover identically on dots).

- [ ] **Step 6: Gates.** `npx vitest run`, `npm run lint`, `npm run build`.

---

### Task 5: Shared mode metadata + display-pill icons

**Files:**
- Create: `src/ui/statusBarMode.ts`
- Modify: `src/ui/StatusBarSection.ts` (~lines 147-149: delete local consts, import)
- Modify: `src/ui/StatusBarItemModal.ts` (pills loop ~lines 43-54)
- Modify: `styles.css` (pill layout)

**Interfaces:**
- Produces: `export type StatusBarMode = "full" | "compact" | "icon"` and `MODE_NEXT` / `MODE_ICON` / `MODE_NAME` consts (`Record<StatusBarMode, …>`).

- [ ] **Step 1: New module** `src/ui/statusBarMode.ts`:
```ts
// Shared metadata for the three status-bar display modes — the settings row's cycle
// button and the customize modal's pills must stay visually identical.
export type StatusBarMode = "full" | "compact" | "icon";

export const MODE_NEXT: Record<StatusBarMode, StatusBarMode> = { full: "compact", compact: "icon", icon: "full" };
export const MODE_ICON: Record<StatusBarMode, string> = { full: "text", compact: "ellipsis", icon: "circle-dot" };
export const MODE_NAME: Record<StatusBarMode, string> = { full: "Full", compact: "Compact", icon: "Icon only" };
```

- [ ] **Step 2: StatusBarSection** — delete the three inline `MODE_*` consts and import `{ MODE_NEXT, MODE_ICON, MODE_NAME }` from `./statusBarMode`. No behavior change.

- [ ] **Step 3: Modal pills** — replace the `MODES` array + loop with:
```ts
    const MODES: StatusBarMode[] = ["full", "compact", "icon"];
    for (const value of MODES) {
      const pill = modesEl.createEl("button", { cls: "ribbon-organizer-sbm-pill" });
      setIcon(pill.createSpan({ cls: "ribbon-organizer-sbm-pillicon" }), MODE_ICON[value]);
      pill.createSpan({ text: MODE_NAME[value] });
      if (value === current) pill.addClass("is-selected");
      pill.addEventListener("click", () => {
        void this.plugin.setStatusBarItemMode(this.id, value).then(() => this.renderContent());
      });
    }
```
Import `{ MODE_ICON, MODE_NAME, StatusBarMode }` from `./statusBarMode`.

- [ ] **Step 4: styles.css** — extend the existing `.ribbon-organizer-sbm-pill` rule (do not duplicate it) with `display: inline-flex; align-items: center; gap: 6px;` and add:
```css
.ribbon-organizer-sbm-pillicon { display: inline-flex; }
.ribbon-organizer-sbm-pillicon svg { width: 13px; height: 13px; }
```

- [ ] **Step 5: Gates.** `npx vitest run`, `npm run lint`, `npm run build`.

---

### Task 6: Docs — ARCHITECTURE.md

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1:** Update every statement the batch invalidated; current-state prose, no changelog voice:
  - Rule data model: `icon` bullet gains `iconColor`/`textColor` (optional, per-part, independent).
  - RuleResult mention: four fields.
  - Engine section: the icon span is joined by a second, style-only touch — the host item's memoized inline `color` tint (WeakMap prior-value, restored on every no-tint pass and in `restoreStatusBarText`); the span's explicit `var(--status-bar-text-color)` reset under a text tint.
  - Seen states: stored via `app.saveLocalStorage` (device-local, key `ribbon-organizer-status-bar-seen`), never in data.json; one-time migration scrubs the legacy field; debounce flush on unload.
  - Module list: add `src/ui/statusBarMode.ts`.
  - Any invariant wording that says data.json is the only persisted state.

- [ ] **Step 2:** Self-check each edited paragraph against the code produced in Tasks 1-5 (read the files, don't trust this plan's prose).
