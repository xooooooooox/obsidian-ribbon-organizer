# Status Bar Icon Rules + Live Preview + Auto-Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite-rule targets gain an optional icon (including icon-only), the customize modal's seen section becomes a live preview, and clicking a seen chip auto-generates a `{x}` template.

**Architecture:** The pure template engine (`src/core/statusBarRules.ts`) returns `{text, icon}` instead of a string and gains `autoTemplateRule`; the DOM engine (`src/main.ts`) keeps its text-node-only core but manages one plugin-owned icon `<span>` per rewritten node; the modal (`src/ui/StatusBarItemModal.ts`) renders preview rows and an icon button reusing `IconSelectModal`.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Obsidian plugin API, vitest, esbuild.

**Spec:** `docs/superpowers/specs/2026-07-28-statusbar-icon-rules-preview-design.md`

## Global Constraints

- **No git commits.** Leave all changes uncommitted — the owner reviews the diff, then authorizes a cut separately. (This overrides the per-task commit steps normally found in plans; tasks end at "tests pass".)
- Active-rule condition: a rule participates iff `find !== ""` AND (`replace !== ""` OR icon set). Both target parts empty = inert draft.
- Auto-template: prefix-first, suffix-fallback, ONE edge only; generated rule is `{ find: P + "{x}", replace: "{x}" }` (or `{x}` + S). Placeholder name is always `x`.
- Final UI copy (verbatim): note = `Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both. Anything that doesn't match a rule is shown as-is.` — replace-input placeholder = `Text (optional)`.
- Icons render via `renderIcon(el, iconId, undefined, app)` from `src/ui/iconRender.ts` (iconize-pack aware), never bare `setIcon`, except the `plus`/`x` chrome glyphs which are built-ins and use `setIcon`.
- CSS class names: status bar span `ribbon-organizer-sb-ricon` (+ `-solo` modifier); all modal classes keep the `ribbon-organizer-sbm-` prefix.
- Match repo comment style: dense "why" comments at function level, no change-narration comments.
- Gates for the whole branch: `npm test`, `npm run lint` (0 errors), `npm run build`.

---

### Task 1: Pure layer — RuleResult, active-rule condition, icon-aware normalize

**Files:**
- Modify: `src/core/statusBarRules.ts` (interface `StatusBarRule`, `applyStatusBarRules`, `normalizeStatusBarRules`)
- Modify: `src/main.ts:405-425` (`rewriteStatusBarItem` call-site type fix only — icon DOM work is Task 3)
- Test: `tests/statusBarRules.test.ts`

**Interfaces:**
- Consumes: existing `compileFind` (private) unchanged.
- Produces: `interface RuleResult { text: string; icon: string | null }`; `applyStatusBarRules(text: string, rules: StatusBarRule[]): RuleResult`; `StatusBarRule` gains `icon?: string`. Tasks 3 and 4 rely on exactly these.

- [ ] **Step 1: Update existing tests to the new return shape and add icon tests**

In `tests/statusBarRules.test.ts`, every existing `applyStatusBarRules` assertion changes from `.toBe(v)` to `.toEqual({ text: v, icon: null })`. Example of the mechanical change (apply to all 13 assertions in the `applyStatusBarRules` describe):

```ts
    expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "⟳" }])).toEqual({ text: "⟳", icon: null });
```

Then add inside the same `describe("applyStatusBarRules", ...)`:

```ts
  it("returns the matching rule's icon; icon-only yields empty text", () => {
    const rules = [{ find: "Syncing...", replace: "", icon: "refresh-cw" }];
    expect(applyStatusBarRules("Syncing...", rules)).toEqual({ text: "", icon: "refresh-cw" });
    expect(applyStatusBarRules("Never Synced", rules)).toEqual({ text: "Never Synced", icon: null });
  });

  it("treats a rule with empty replace and no icon as an inert draft", () => {
    expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "" }])).toEqual({ text: "Syncing...", icon: null });
  });
```

And a new case inside `describe("normalizeStatusBarRules", ...)`:

```ts
  it("keeps a non-empty string icon and drops other icon shapes", () => {
    const raw = { a: [{ find: "x", replace: "y", icon: "check" }, { find: "x", replace: "y", icon: "" }, { find: "x", replace: "y", icon: 3 }] };
    expect(normalizeStatusBarRules(raw)).toEqual({ a: [{ find: "x", replace: "y", icon: "check" }, { find: "x", replace: "y" }, { find: "x", replace: "y" }] });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/statusBarRules.test.ts`
Expected: FAIL — existing assertions get a string where `{text, icon}` is expected; new tests fail on shape/typing.

- [ ] **Step 3: Implement in `src/core/statusBarRules.ts`**

Replace the `StatusBarRule` interface and add `RuleResult`:

```ts
export interface StatusBarRule {
  find: string;    // template: literal text with {name} placeholders for the changing parts
  replace: string; // output text: placeholders carry the captured text over; may be ""
  icon?: string;   // optional icon id (Obsidian built-in or iconize pack), shown before the text
}

export interface RuleResult {
  text: string;
  icon: string | null;
}
```

Replace `applyStatusBarRules` (keep the existing replacement-expansion loop verbatim; only the header comment, the skip conditions, and the returns change):

```ts
// First matching active rule wins; unmatched text returns unchanged. Active needs a find
// plus at least one target part (text or icon) — a rule with both target parts empty is a
// mid-edit draft and never matches, like empty finds. An icon-only rule (icon, empty
// replace) legitimately blanks the text: the icon takes its place.
export function applyStatusBarRules(text: string, rules: StatusBarRule[]): RuleResult {
  for (const rule of rules) {
    if (rule.find === "") continue;
    const icon = rule.icon ?? "";
    if (rule.replace === "" && icon === "") continue;
    const compiled = compileFind(rule.find);
    if (compiled === null) continue;
    const match = compiled.re.exec(text);
    if (match === null) continue;
    // Single left-to-right pass over the replacement: captured values are inserted verbatim
    // and never re-scanned, so a capture that happens to contain another placeholder's
    // literal token cannot be substituted a second time.
    let out = "";
    let rest = rule.replace;
    while (rest !== "") {
      const open = rest.indexOf("{");
      if (open === -1) {
        out += rest;
        break;
      }
      const close = rest.indexOf("}", open + 1);
      if (close === -1) {
        out += rest;
        break;
      }
      const name = rest.slice(open + 1, close).trim();
      const nameIndex = compiled.names.indexOf(name);
      out += rest.slice(0, open);
      out += nameIndex === -1 ? rest.slice(open, close + 1) : (match[nameIndex + 1] ?? "");
      rest = rest.slice(close + 1);
    }
    return { text: out, icon: icon === "" ? null : icon };
  }
  return { text, icon: null };
}
```

In `normalizeStatusBarRules`, replace the push line:

```ts
      if (typeof find === "string" && typeof replace === "string") {
        const icon = entryObj.icon;
        rules.push(typeof icon === "string" && icon !== "" ? { find, replace, icon } : { find, replace });
      }
```

- [ ] **Step 4: Fix the one call site so the build stays green (`src/main.ts`, in `rewriteStatusBarItem`)**

Change:

```ts
      const out = applyStatusBarRules(raw, rules);
      if (out !== raw) {
        this.statusBarNodeMemo.set(node, { original: raw, written: out });
        node.data = out;
      }
```

to (icon is intentionally unused until Task 3):

```ts
      const out = applyStatusBarRules(raw, rules);
      if (out.text !== raw) {
        this.statusBarNodeMemo.set(node, { original: raw, written: out.text });
        node.data = out.text;
      }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/statusBarRules.test.ts && npm run build`
Expected: all tests PASS, build clean.

---

### Task 2: `autoTemplateRule`

**Files:**
- Modify: `src/core/statusBarRules.ts` (new export, place after `applyStatusBarRules`)
- Test: `tests/statusBarRules.test.ts`

**Interfaces:**
- Produces: `autoTemplateRule(sample: string, others: string[]): StatusBarRule` — Task 4's chip click consumes it.

- [ ] **Step 1: Write the failing tests**

Add to `tests/statusBarRules.test.ts` (and add `autoTemplateRule` to the import list):

```ts
describe("autoTemplateRule", () => {
  it("templates the changing tail after the longest shared prefix", () => {
    expect(autoTemplateRule("Successfully synced 5 hours ago", ["Successfully synced 4 hours ago", "Syncing..."]))
      .toEqual({ find: "Successfully synced {x}", replace: "{x}" });
  });

  it("falls back to a shared suffix when no prefix is shared", () => {
    expect(autoTemplateRule("22 words", ["39 words"])).toEqual({ find: "{x} words", replace: "{x}" });
  });

  it("prefers the prefix when both edges are shared", () => {
    expect(autoTemplateRule("sync ok 5m", ["sync ok 9m"])).toEqual({ find: "sync ok {x}", replace: "{x}" });
  });

  it("ignores partners that would leave an empty changing part", () => {
    expect(autoTemplateRule("Syncing", ["Syncing..."])).toEqual({ find: "Syncing", replace: "Syncing" });
  });

  it("returns a literal identity rule with no usable partner", () => {
    expect(autoTemplateRule("Syncing...", [])).toEqual({ find: "Syncing...", replace: "Syncing..." });
    expect(autoTemplateRule("Syncing...", ["Syncing..."])).toEqual({ find: "Syncing...", replace: "Syncing..." });
  });

  it("picks the longest shared prefix among several partners", () => {
    expect(autoTemplateRule("Successfully synced 5 hours ago", ["Sync error", "Successfully synced just now"]))
      .toEqual({ find: "Successfully synced {x}", replace: "{x}" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/statusBarRules.test.ts`
Expected: FAIL — `autoTemplateRule` is not exported.

- [ ] **Step 3: Implement**

```ts
// Rule template from a clicked seen sample: the longest prefix (else suffix) shared with
// another sample becomes the literal part, the changing remainder becomes {x}. ONE edge
// only — templating both edges would narrow the match (a "{x} hours ago" tail excludes
// "just now") and strip units ("5" instead of "5 hours ago"). replace is bare {x}: the
// static edge is exactly the noise a rewrite exists to drop. No usable partner falls back
// to a literal identity rule, the pre-template chip behavior.
export function autoTemplateRule(sample: string, others: string[]): StatusBarRule {
  let prefix = "";
  let suffix = "";
  for (const other of others) {
    if (other === sample) continue;
    const max = Math.min(sample.length, other.length);
    let p = 0;
    while (p < max && sample[p] === other[p]) p++;
    if (p > prefix.length && p < sample.length && p < other.length) prefix = sample.slice(0, p);
    let s = 0;
    while (s < max && sample[sample.length - 1 - s] === other[other.length - 1 - s]) s++;
    if (s > suffix.length && s < sample.length && s < other.length) suffix = sample.slice(sample.length - s);
  }
  if (prefix !== "") return { find: prefix + "{x}", replace: "{x}" };
  if (suffix !== "") return { find: "{x}" + suffix, replace: "{x}" };
  return { find: sample, replace: sample };
}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/statusBarRules.test.ts`
Expected: PASS (all, including Task 1's).

---

### Task 3: DOM engine — plugin-owned icon span

**Files:**
- Modify: `src/main.ts` — memo type (line ~146), `rewriteStatusBarItem` (~405), `restoreStatusBarText` (~445), new private `syncRuleIconSpan`
- Modify: `styles.css` — new `sb-ricon` block next to the existing `sb-icononly` rules (~line 156)

**Interfaces:**
- Consumes: `RuleResult` from Task 1; `renderIcon` (already imported in main.ts).
- Produces: DOM contract for Task 5's docs — a `span.ribbon-organizer-sb-ricon` sits immediately before a rewritten Text node whose matched rule has an icon; `-solo` modifier when the rewritten text is `""`.

- [ ] **Step 1: Extend the memo type (`src/main.ts` line ~146)**

```ts
  private statusBarNodeMemo = new WeakMap<Text, { original: string; written: string; iconEl?: HTMLElement }>();
```

- [ ] **Step 2: Replace `rewriteStatusBarItem`**

Replace the whole method (the Task 1 interim version) with:

```ts
  // Rewrites one item's Text nodes per its rules, feeds seen-learning with raw values, and
  // (Compact mode) keeps the hover title = raw text. A matched rule with an icon gets a
  // plugin-owned span immediately before the text node — the engine's only structural
  // touch; everything else stays text-node-scoped. Fail-open: unmatched nodes untouched.
  // A node whose rules stopped producing output is restored here in place (the observer
  // teardown only restores when an item loses ALL rules), so icon edits and rule deletions
  // take effect without an element rebuild.
  private rewriteStatusBarItem(id: string, el: HTMLElement): void {
    const rules = this.settings.statusBarRules[id] ?? [];
    let rawFull = "";
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      const prior = memo !== undefined && node.data === memo.written ? memo : undefined;
      if (memo !== undefined && prior === undefined) {
        // The plugin overwrote our rewrite in place: its text wins, and the icon span that
        // decorated the stale rewrite must not survive it (a fresh match re-creates one).
        memo.iconEl?.remove();
        this.statusBarNodeMemo.delete(node);
      }
      const raw = prior === undefined ? node.data : prior.original;
      rawFull += raw;
      if (prior === undefined) this.learnStatusBarText(id, raw);
      if (rules.length === 0) {
        // Rules emptied while our write still stands: restore here — a Compact item keeps
        // its observer (hover-title tracking), so the teardown restore never fires for it.
        if (prior !== undefined) {
          prior.iconEl?.remove();
          this.statusBarNodeMemo.delete(node);
          node.data = raw;
        }
        continue;
      }
      const out = applyStatusBarRules(raw, rules);
      if (out.text === raw && out.icon === null) {
        if (prior !== undefined) {
          prior.iconEl?.remove();
          this.statusBarNodeMemo.delete(node);
          node.data = raw;
        }
        continue;
      }
      const iconEl = this.syncRuleIconSpan(node, prior?.iconEl, out.icon, out.text === "");
      if (iconEl === undefined) this.statusBarNodeMemo.set(node, { original: raw, written: out.text });
      else this.statusBarNodeMemo.set(node, { original: raw, written: out.text, iconEl });
      if (node.data !== out.text) node.data = out.text;
    }
    if (this.settings.statusBarModes[id] === "compact") el.title = rawFull.replace(/\s+/g, " ").trim();
  }
```

- [ ] **Step 3: Add `syncRuleIconSpan` (below `rewriteStatusBarItem`)**

```ts
  // The plugin-owned icon span for one rewritten node: created (or moved back) to sit
  // immediately before the text node, re-rendered only when the icon id changes, removed
  // when the matched rule carries no icon. Solo (empty rewritten text) drops the text gap.
  private syncRuleIconSpan(node: Text, existing: HTMLElement | undefined, icon: string | null, solo: boolean): HTMLElement | undefined {
    if (icon === null) {
      existing?.remove();
      return undefined;
    }
    const span = existing !== undefined && existing.isConnected ? existing : createSpan({ cls: "ribbon-organizer-sb-ricon" });
    if (span.nextSibling !== node) node.before(span);
    if (span.getAttribute("data-ricon") !== icon) {
      renderIcon(span, icon, undefined, this.app);
      span.setAttribute("data-ricon", icon);
    }
    span.toggleClass("ribbon-organizer-sb-ricon-solo", solo);
    return span;
  }
```

- [ ] **Step 4: Extend `restoreStatusBarText`**

```ts
  // Best-effort undo of our rewrites on one element: nodes the plugin has since overwritten
  // keep the plugin's newer text (its next update wins anyway), but our icon spans and memo
  // entries are removed unconditionally — a span must never outlive the teardown that owns it.
  private restoreStatusBarText(el: HTMLElement): void {
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      if (memo === undefined) continue;
      memo.iconEl?.remove();
      if (node.data === memo.written) node.data = memo.original;
      this.statusBarNodeMemo.delete(node);
    }
  }
```

- [ ] **Step 5: styles.css — add after the `.ribbon-organizer-sb-icononly` block (~line 158)**

```css
/* Rule icons: one plugin-owned span before a rewritten text node (the rewrite engine's only
   structural touch). Sized like Icon-only mode; solo = icon-only result, no text gap. */
.ribbon-organizer-sb-ricon { display: inline-flex; align-items: center; vertical-align: middle; margin-right: 4px; }
.ribbon-organizer-sb-ricon svg,
.ribbon-organizer-sb-ricon .svg-icon { width: var(--icon-s, 16px); height: var(--icon-s, 16px); }
.ribbon-organizer-sb-ricon-solo { margin-right: 0; }
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run build`
Expected: PASS / clean. (DOM behavior is covered by the manual pass in Task 5, per spec.)

---

### Task 4: Modal — live preview, auto-template chips, icon button

**Files:**
- Modify: `src/ui/StatusBarItemModal.ts` (full `renderContent` rework + new `renderSeen`)
- Modify: `styles.css` (`ribbon-organizer-sbm-` additions; the `-seen` container rule changes)

**Interfaces:**
- Consumes: `applyStatusBarRules` + `autoTemplateRule` (Tasks 1-2), `renderIcon`, `IconSelectModal` (existing: `new IconSelectModal(app, (icon: string) => void)`).

- [ ] **Step 1: Rewrite `src/ui/StatusBarItemModal.ts`**

Full file content:

```ts
import { App, ButtonComponent, ExtraButtonComponent, Modal, setIcon } from "obsidian";
import { StatusBarRule, applyStatusBarRules, autoTemplateRule } from "../core/statusBarRules";
import { renderIcon } from "./iconRender";
import { IconSelectModal } from "./IconSelectModal";
import type RibbonOrganizerPlugin from "../main";

// Per-item customize modal: display-mode pills, the seen-state preview (each learned raw
// value shown alongside what the current rules make of it; click one to start a rule via
// auto-templating), and the rewrite-rule editor with an optional per-rule icon. Every
// change saves and re-applies immediately; the section behind refreshes via onDone when
// the modal closes.
export class StatusBarItemModal extends Modal {
  private seenEl: HTMLElement | null = null;

  constructor(
    app: App,
    private plugin: RibbonOrganizerPlugin,
    private id: string,
    private itemName: string,
    private onDone: () => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("ribbon-organizer-sbm");
    this.renderContent();
  }

  onClose(): void {
    this.contentEl.empty();
    this.onDone();
  }

  private renderContent(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(`${this.itemName} — how it shows`);

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Display" });
    const modesEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-modes" });
    const current = this.plugin.settings.statusBarModes[this.id] ?? "full";
    const MODES: { value: "full" | "compact" | "icon"; label: string }[] = [
      { value: "full", label: "Full" },
      { value: "compact", label: "Compact" },
      { value: "icon", label: "Icon only" },
    ];
    for (const mode of MODES) {
      const pill = modesEl.createEl("button", { cls: "ribbon-organizer-sbm-pill", text: mode.label });
      if (mode.value === current) pill.addClass("is-selected");
      pill.addEventListener("click", () => {
        void this.plugin.setStatusBarItemMode(this.id, mode.value).then(() => this.renderContent());
      });
    }

    const seen = this.plugin.settings.statusBarSeen[this.id] ?? [];
    this.seenEl = null;
    if (seen.length > 0) {
      contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Seen on this device — click one to start a rule" });
      this.seenEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-seen" });
      this.renderSeen(seen);
    }

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Rewrite rules" });
    this.rules().forEach((rule, index) => {
      const rowEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-rule" });
      const findEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text to match" } });
      findEl.value = rule.find;
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });

      const iconBtn = rowEl.createEl("button", { cls: "ribbon-organizer-sbm-iconbtn", attr: { "aria-label": "Pick an icon" } });
      if (rule.icon === undefined) {
        iconBtn.addClass("is-unset");
        setIcon(iconBtn, "plus");
      } else {
        renderIcon(iconBtn, rule.icon, undefined, this.app);
        const clearEl = iconBtn.createSpan({ cls: "ribbon-organizer-sbm-iconclear", attr: { "aria-label": "Remove icon" } });
        setIcon(clearEl, "x");
        clearEl.addEventListener("click", (event) => {
          event.stopPropagation();
          const next = this.rules();
          const prev = next[index];
          if (prev !== undefined) next[index] = { find: prev.find, replace: prev.replace };
          void this.saveRules(next).then(() => this.renderContent());
        });
      }
      iconBtn.addEventListener("click", () => {
        new IconSelectModal(this.app, (icon) => {
          const next = this.rules();
          const prev = next[index];
          if (prev !== undefined) next[index] = { ...prev, icon };
          void this.saveRules(next).then(() => this.renderContent());
        }).open();
      });

      const replaceEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text (optional)" } });
      replaceEl.value = rule.replace;
      const commit = (): void => {
        const next = this.rules();
        const icon = next[index]?.icon;
        next[index] = icon === undefined ? { find: findEl.value, replace: replaceEl.value } : { find: findEl.value, replace: replaceEl.value, icon };
        void this.saveRules(next).then(() => this.renderSeen(this.plugin.settings.statusBarSeen[this.id] ?? []));
      };
      findEl.addEventListener("change", commit);
      replaceEl.addEventListener("change", commit);
      new ExtraButtonComponent(rowEl).setIcon("trash-2").setTooltip("Remove rule").onClick(() => {
        void this.saveRules(this.rules().filter((_, j) => j !== index)).then(() => this.renderContent());
      });
    });
    new ButtonComponent(contentEl.createDiv({ cls: "ribbon-organizer-sbm-addbar" })).setButtonText("Add rule").onClick(() => {
      void this.saveRules([...this.rules(), { find: "", replace: "" }]).then(() => this.renderContent());
    });

    contentEl.createDiv({
      cls: "ribbon-organizer-sbm-note",
      text: "Use {x} for the part that changes; it carries over to the result. Give a rule an icon, some text, or both. Anything that doesn't match a rule is shown as-is.",
    });
  }

  // The preview half of the seen section, re-rendered alone on rule edits so a mid-tab
  // focus never gets torn down with the whole modal body.
  private renderSeen(seen: string[]): void {
    if (this.seenEl === null) return;
    this.seenEl.empty();
    const rules = this.rules();
    for (const sample of [...seen].reverse()) {
      const rowEl = this.seenEl.createDiv({ cls: "ribbon-organizer-sbm-seenrow" });
      const chip = rowEl.createEl("button", { cls: "ribbon-organizer-sbm-chip", text: sample });
      chip.addEventListener("click", () => {
        void this.saveRules([...this.rules(), autoTemplateRule(sample, seen.filter((s) => s !== sample))]).then(() => this.renderContent());
      });
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });
      const out = applyStatusBarRules(sample, rules);
      const resultEl = rowEl.createSpan({ cls: "ribbon-organizer-sbm-result" });
      if (out.text === sample && out.icon === null) {
        resultEl.addClass("is-asis");
        resultEl.setText(sample);
        continue;
      }
      if (out.icon !== null) renderIcon(resultEl.createSpan({ cls: "ribbon-organizer-sbm-result-icon" }), out.icon, undefined, this.app);
      if (out.text !== "") resultEl.createSpan({ text: out.text });
    }
  }

  private rules(): StatusBarRule[] {
    return (this.plugin.settings.statusBarRules[this.id] ?? []).map((rule) => ({ ...rule }));
  }

  private async saveRules(rules: StatusBarRule[]): Promise<void> {
    await this.plugin.setStatusBarItemRules(this.id, rules);
  }
}
```

- [ ] **Step 2: styles.css — replace the `-seen` rule and add the new classes (in the sbm block, ~line 163)**

Replace:

```css
.ribbon-organizer-sbm-seen { display: flex; flex-wrap: wrap; gap: 6px; }
```

with:

```css
.ribbon-organizer-sbm-seen { display: flex; flex-direction: column; gap: 4px; }
.ribbon-organizer-sbm-seenrow { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ribbon-organizer-sbm-seenrow .ribbon-organizer-sbm-chip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; flex: none; }
.ribbon-organizer-sbm-result { display: inline-flex; align-items: center; gap: 5px; font-size: var(--font-ui-smaller); color: var(--text-muted); border: 1px solid var(--background-modifier-border); border-radius: 5px; padding: 2px 8px; min-height: 22px; min-width: 0; overflow: hidden; }
.ribbon-organizer-sbm-result.is-asis { border-style: dashed; color: var(--text-faint); }
.ribbon-organizer-sbm-result-icon { display: inline-flex; align-items: center; }
.ribbon-organizer-sbm-result-icon svg,
.ribbon-organizer-sbm-result-icon .svg-icon { width: var(--icon-s, 16px); height: var(--icon-s, 16px); }
```

And add after the `.ribbon-organizer-sbm-rule input` rule:

```css
.ribbon-organizer-sbm-iconbtn { position: relative; flex: none; width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.ribbon-organizer-sbm-iconbtn.is-unset { border: 1px dashed var(--background-modifier-border); background: var(--background-primary); box-shadow: none; color: var(--text-faint); }
.ribbon-organizer-sbm-iconbtn svg,
.ribbon-organizer-sbm-iconbtn .svg-icon { width: var(--icon-s, 16px); height: var(--icon-s, 16px); }
.ribbon-organizer-sbm-iconclear { position: absolute; top: -6px; right: -6px; width: 14px; height: 14px; border-radius: 50%; background: var(--background-modifier-border); color: var(--text-muted); display: none; align-items: center; justify-content: center; }
.ribbon-organizer-sbm-iconclear svg { width: 9px; height: 9px; }
.ribbon-organizer-sbm-iconbtn:hover .ribbon-organizer-sbm-iconclear { display: inline-flex; }
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS / clean.

---

### Task 5: Docs + full gates + manual checklist

**Files:**
- Modify: `docs/ARCHITECTURE.md` (four spots)

- [ ] **Step 1: ARCHITECTURE.md edits**

Line 33 (`core/statusBarRules.ts` bullet) — extend to:

```
- **`core/statusBarRules.ts`** — status bar text rewriting, pure: the `{name}` template engine (`applyStatusBarRules` — literal parts escaped, placeholders become lazy capture groups, anchored full-match, first active rule wins, malformed/empty templates never match; returns `{text, icon}`, a rule needs find plus at least one target part), `autoTemplateRule` (chip click → longest shared prefix, else suffix, becomes the literal part and the remainder `{x}`; replace is bare `{x}`; one edge only), `pushSeen` (collapsed/deduped/capped LRU), and the three normalizers for `statusBarModes`/`statusBarRules`/`statusBarSeen`.
```

Line 42 (`ui/StatusBarItemModal.ts` bullet) — extend to:

```
- **`ui/StatusBarItemModal.ts`** — the per-item customize modal: display-mode pills, the seen-state preview (each learned value shown with what the current rules make of it; click to start an auto-templated rule), and the rewrite-rule editor with a per-rule optional icon (IconSelectModal; icon or text or both — both empty is an inert draft). Every change saves and re-applies immediately; find/replace text edits refresh only the preview (keeping other rows' inputs alive), while icon pick/clear and row add/delete re-render the modal body.
```

Invariant 15 (line ~68) — replace the first sentence:

```
15. **Rewriting is fail-open and text-node-scoped, with one structural exception.** Rules touch individual `Text` nodes; a matched rule with an icon additionally owns one `span.ribbon-organizer-sb-ricon` immediately before the node (re-rendered on id change, removed with the rewrite). Unmatched or malformed templates leave the plugin's text exactly as written. Loop safety: a `WeakMap<Text, {original, written, iconEl?}>` — a node whose data equals `written` is our own write and is skipped; unload and rule removal remove the span and memo entry unconditionally, restoring `original` only where `written` still stands (a host-overwritten node keeps its newer text; the rewrite pass sweeps such stale spans too). One MutationObserver per rule-bearing OR Compact-mode item (Compact needs churn tracking to keep the hover title = raw text), recreated when its element is rebuilt.
```

Line 101 (data-model list) — replace with:

```
- `statusBarRules: Record<id, {find, replace, icon?}[]>` — `{name}` template rewrite rules; `icon` is an optional icon id shown before (or instead of) the text; drafts with no target never match and are kept.
```

- [ ] **Step 2: Full gates**

Run: `npm test && npm run lint && npm run build`
Expected: all tests PASS, lint 0 errors, build clean.

- [ ] **Step 3: Report the manual checklist (do not perform it — it is the owner's real-vault pass)**

- RS rules with icons: `Successfully synced {x}` → ✓ icon + `{x}`; `Syncing...` → icon-only spinner; verify solo spacing.
- Preview rows update live while editing rules; unmatched samples show dashed as-is.
- Chip click on an RS sample generates `Successfully synced {x}` → `{x}`.
- Icon picker opens from both button states; hover × clears; icon survives find/replace edits.
- Rule deletion / icon clear restores the live status bar without a plugin reload.
- Strip drift: scroll the Status bar tab — the Workspaces Plus icon stays inside the preview strip (Task 6).
- Owner-id chips render in both the Status bar and Ribbon groups rows (Task 6).

---

### Task 6: Preview-strip containing block + owner-id chip (batched extras)

Spec: the Addendum section of `docs/superpowers/specs/2026-07-28-statusbar-icon-rules-preview-design.md`. Pure CSS + one doc sentence; no TS changes, no new tests (repo tests are pure-function only).

**Files:**
- Modify: `styles.css:90` (`.ribbon-organizer-rg-plugin`), `styles.css:144-146` (strip comment + rule)
- Modify: `docs/ARCHITECTURE.md` line ~41 (`ui/StatusBarSection.ts` bullet)

- [ ] **Step 1: Strip fix — replace the `position: static` declaration and extend the comment**

The block at `styles.css:144-146` currently reads:

```css
/* The strip reuses the status-bar class so theme/plugin item CSS styles the clones, then
   ... */
.status-bar.ribbon-organizer-sb-strip { display: flex; position: static; width: 100%; max-width: none;
```

Change `position: static` to `position: relative !important` and append to the comment (keep its existing text):

```
   relative, not static: the strip must be the containing block for plugin abspos children
   (workspaces-plus's icon) — anchored outside the settings scroller they stay put while
   the strip scrolls away. !important because .status-bar position is a battleground:
   quick-explorer forces it static from a body-level selector that outguns two classes. */
```

- [ ] **Step 2: Owner-id chip — replace `styles.css:90`**

```css
.ribbon-organizer-rg-plugin { margin-left: auto; font-family: var(--font-monospace); font-size: var(--font-ui-smaller); color: var(--text-faint); background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: 4px; padding: 0 6px; }
```

(Only additions; `margin-left`, size, and color stay. The `.ribbon-organizer-sb-item` margin overrides at lines ~130-131 and the `.is-phone` hides are untouched.)

- [ ] **Step 3: ARCHITECTURE.md — extend the `ui/StatusBarSection.ts` bullet**

Append to the bullet's strip description (after "clone-based preview strip"):

```
(position: relative so plugin abspos children anchor inside it)
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS / clean.
