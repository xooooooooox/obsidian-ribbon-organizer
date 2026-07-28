# Status Bar Modes + Rewrite Rules + UX Fixes Implementation Plan (0.11.0)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Not shown right now" row state, half-zone drag insertion, per-item display modes (Full/Compact/Icon only), per-text-node template rewrite rules with seen-state learning, and a per-item customize modal.

**Architecture:** A new pure module `core/statusBarRules.ts` owns the template engine, seen-list LRU, and three normalizers; `main.ts` grows a per-item rules-observer manager with a `WeakMap<Text, {original, written}>` loop guard, mode styles in the apply pass, and a lazy seen-persist; the UI adds two row buttons (wand, mode cycle) and a `StatusBarItemModal`.

**Tech Stack:** TypeScript, esbuild, vitest, eslint-plugin-obsidianmd preset.

Spec: `docs/superpowers/specs/2026-07-28-statusbar-modes-and-rewrite-design.md`

## Global Constraints

- **NO GIT COMMITS.** Working tree = user review state. Never add Claude/AI attribution anywhere.
- Gates after each task: `npm run build` clean, `npm test` (83 after Task 1: 65 baseline + 18 new incl. the single-pass substitution regression test), `npm run lint` **0 problems**; no inline eslint-disable ever; `.instanceOf(HTMLElement)` for real-DOM checks; `setCssStyles` for style writes.
- **Fail-open is a hard constraint**: text matching no rule renders exactly as the plugin wrote it; empty/malformed `find` templates never match. Rules touch individual `Text` nodes only — never element structure.
- Copy verbatim (mockup-final): tag `Not shown right now`; modal title `` `${displayName} — how it shows` ``; sections `Display` / `Seen on this device — click one to start a rule` / `Rewrite rules`; pills `Full` / `Compact` / `Icon only`; note `Use {name} for the part that changes; it carries over to the result. Anything that doesn't match a rule is shown as-is.`; wand tooltip `Rewrite rules`; rule placeholders `Text to match` / `Show instead`; add button `Add rule`; trash tooltip `Remove rule`.
- `statusBarSeen` alone never makes the apply pass active (learning must not change rendering). Seen cap = 8, LRU newest-last, collapsed whitespace, persisted lazily (only a genuinely new value schedules a save).
- Compact = inline `max-width: 12em` + ellipsis + `title` hover; Icon only = class `ribbon-organizer-sb-icononly` (CSS `font-size: 0`, icons restored). Both cleared on unload.
- README.md / README.zh.md keep EQUAL line counts (currently 60/60; replacements are 1-for-1).
- Version bump/tag/release are NOT part of this plan (user-triggered cut).

---

### Task 1: Pure layer — template engine, seen LRU, normalizers

**Files:**
- Create: `src/core/statusBarRules.ts`
- Test: `tests/statusBarRules.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (Tasks 2–3 rely on these exact signatures):
  - `interface StatusBarRule { find: string; replace: string }`
  - `applyStatusBarRules(text: string, rules: StatusBarRule[]): string`
  - `pushSeen(list: string[], text: string, cap: number): string[]`
  - `SEEN_CAP = 8`
  - `normalizeStatusBarModes(raw: unknown): Record<string, "compact" | "icon">`
  - `normalizeStatusBarRules(raw: unknown): Record<string, StatusBarRule[]>`
  - `normalizeStatusBarSeen(raw: unknown): Record<string, string[]>`

- [ ] **Step 1: Write the failing tests**

Create `tests/statusBarRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  SEEN_CAP,
  applyStatusBarRules,
  normalizeStatusBarModes,
  normalizeStatusBarRules,
  normalizeStatusBarSeen,
  pushSeen,
} from "../src/core/statusBarRules";

describe("applyStatusBarRules", () => {
  it("matches a literal template exactly and replaces it", () => {
    expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "⟳" }])).toBe("⟳");
  });

  it("captures a {name} placeholder and carries it into the replacement", () => {
    const rules = [{ find: "Successfully synced {time}", replace: "✓ {time}" }];
    expect(applyStatusBarRules("Successfully synced 2 hours ago", rules)).toBe("✓ 2 hours ago");
    expect(applyStatusBarRules("Successfully synced just now", rules)).toBe("✓ just now");
  });

  it("supports multiple placeholders", () => {
    const rules = [{ find: "{w} words{c} characters", replace: "{w}w {c}c" }];
    expect(applyStatusBarRules("22 words39 characters", rules)).toBe("22w 39c");
  });

  it("first matching rule wins", () => {
    const rules = [
      { find: "Syncing...", replace: "first" },
      { find: "{any}", replace: "second" },
    ];
    expect(applyStatusBarRules("Syncing...", rules)).toBe("first");
  });

  it("returns the text unchanged when no rule matches (fail-open)", () => {
    expect(applyStatusBarRules("Never Synced", [{ find: "Syncing...", replace: "⟳" }])).toBe("Never Synced");
  });

  it("requires a full match, not a substring", () => {
    expect(applyStatusBarRules("prefix Syncing... suffix", [{ find: "Syncing...", replace: "⟳" }])).toBe("prefix Syncing... suffix");
  });

  it("treats regex specials in literals literally", () => {
    expect(applyStatusBarRules("(sync) 50% [done]", [{ find: "(sync) {p} [done]", replace: "{p}" }])).toBe("50%");
  });

  it("never matches malformed or empty templates (fail-open)", () => {
    expect(applyStatusBarRules("abc", [{ find: "a{b", replace: "x" }])).toBe("abc"); // unbalanced
    expect(applyStatusBarRules("abc", [{ find: "{x} and {x}", replace: "y" }])).toBe("abc"); // duplicate name
    expect(applyStatusBarRules("abc", [{ find: "{}", replace: "y" }])).toBe("abc"); // empty name
    expect(applyStatusBarRules("", [{ find: "", replace: "y" }])).toBe(""); // empty find never matches
  });

  it("leaves unknown placeholders in the replacement as literal text", () => {
    expect(applyStatusBarRules("hi", [{ find: "hi", replace: "{other}" }])).toBe("{other}");
  });
});

describe("pushSeen", () => {
  it("appends a new value and collapses whitespace", () => {
    expect(pushSeen([], "  a   b ", 8)).toEqual(["a b"]);
  });

  it("moves a re-seen value to the end without duplicating", () => {
    expect(pushSeen(["a", "b"], "a", 8)).toEqual(["b", "a"]);
  });

  it("drops empty text", () => {
    expect(pushSeen(["a"], "   ", 8)).toEqual(["a"]);
  });

  it("caps from the front (oldest evicted)", () => {
    expect(pushSeen(["a", "b", "c"], "d", 3)).toEqual(["b", "c", "d"]);
  });
});

describe("normalizeStatusBarModes", () => {
  it("returns {} for non-objects and drops unknown values", () => {
    expect(normalizeStatusBarModes(undefined)).toEqual({});
    expect(normalizeStatusBarModes([1])).toEqual({});
    expect(normalizeStatusBarModes({ a: "compact", b: "icon", c: "huge", d: 3 })).toEqual({ a: "compact", b: "icon" });
  });
});

describe("normalizeStatusBarRules", () => {
  it("keeps well-formed rules including empty-find drafts, drops malformed entries", () => {
    const raw = { a: [{ find: "x", replace: "y" }, { find: "", replace: "draft" }, { find: 3 }, "junk"], b: "junk", c: [] };
    expect(normalizeStatusBarRules(raw)).toEqual({ a: [{ find: "x", replace: "y" }, { find: "", replace: "draft" }] });
  });

  it("returns {} for non-objects", () => {
    expect(normalizeStatusBarRules(null)).toEqual({});
  });
});

describe("normalizeStatusBarSeen", () => {
  it("dedupes, drops non-strings, and enforces the cap", () => {
    const raw = { a: ["x", "x", 3, "y"], b: Array.from({ length: 12 }, (_, i) => `v${String(i)}`) };
    const out = normalizeStatusBarSeen(raw);
    expect(out["a"]).toEqual(["x", "y"]);
    expect(out["b"]).toHaveLength(SEEN_CAP);
    expect(out["b"]?.[SEEN_CAP - 1]).toBe("v11");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/statusBarRules.test.ts`
Expected: FAIL — cannot resolve `../src/core/statusBarRules`.

- [ ] **Step 3: Implement `src/core/statusBarRules.ts`**

```ts
// Per-item status bar text rewriting: template rules and the learned "seen states" list.
// Everything here is pure; the DOM-facing engine lives in main.ts.

export interface StatusBarRule {
  find: string;    // template: literal text with {name} placeholders for the changing parts
  replace: string; // output: placeholders carry the captured text over
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

// Compiles a find template: literal segments match exactly (regex specials escaped), each
// {name} becomes a lazy capture group; anchored to the whole text. Returns null for
// malformed templates (unbalanced braces, empty or duplicate names) — a malformed rule
// never matches, keeping rewriting fail-open.
function compileFind(find: string): { re: RegExp; names: string[] } | null {
  const names: string[] = [];
  let pattern = "^";
  let rest = find;
  while (rest !== "") {
    const open = rest.indexOf("{");
    if (open === -1) {
      pattern += rest.replace(REGEX_SPECIALS, "\\$&");
      break;
    }
    const close = rest.indexOf("}", open + 1);
    if (close === -1) return null; // unbalanced
    const name = rest.slice(open + 1, close).trim();
    if (name === "" || names.includes(name)) return null;
    names.push(name);
    pattern += rest.slice(0, open).replace(REGEX_SPECIALS, "\\$&") + "([\\s\\S]+?)";
    rest = rest.slice(close + 1);
  }
  return { re: new RegExp(pattern + "$"), names };
}

// First matching rule wins; unmatched text returns unchanged — a rule set can shorten,
// never blank. Empty finds (mid-edit draft rows) never match.
export function applyStatusBarRules(text: string, rules: StatusBarRule[]): string {
  for (const rule of rules) {
    if (rule.find === "") continue;
    const compiled = compileFind(rule.find);
    if (compiled === null) continue;
    const match = compiled.re.exec(text);
    if (match === null) continue;
    let out = rule.replace;
    compiled.names.forEach((name, i) => {
      out = out.split(`{${name}}`).join(match[i + 1] ?? "");
    });
    return out;
  }
  return text;
}

export const SEEN_CAP = 8;

// Whitespace-collapsed, deduped (re-seen values move to the end), capped from the front.
export function pushSeen(list: string[], text: string, cap: number): string[] {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed === "") return list;
  const out = [...list.filter((s) => s !== collapsed), collapsed];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// data.json repair (hand-editable): non-objects become {}, malformed members are dropped.
export function normalizeStatusBarModes(raw: unknown): Record<string, "compact" | "icon"> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, "compact" | "icon"> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === "compact" || value === "icon") out[key] = value;
  }
  return out;
}

// Empty-find entries are KEPT: they never match (see applyStatusBarRules), and dropping
// them would delete a mid-edit rule row on reload.
export function normalizeStatusBarRules(raw: unknown): Record<string, StatusBarRule[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, StatusBarRule[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    const rules: StatusBarRule[] = [];
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const { find, replace } = entry as { find?: unknown; replace?: unknown };
      if (typeof find === "string" && typeof replace === "string") rules.push({ find, replace });
    }
    if (rules.length > 0) out[key] = rules;
  }
  return out;
}

export function normalizeStatusBarSeen(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    let list: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") list = pushSeen(list, entry, SEEN_CAP);
    }
    if (list.length > 0) out[key] = list;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/statusBarRules.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 5: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 83 tests (7 files); lint 0 problems.

---

### Task 2: main.ts runtime — settings, modes in apply, rules engine, learning

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes (Task 1): everything exported by `src/core/statusBarRules.ts`.
- Produces (Task 3 relies on these):
  - `settings.statusBarModes` / `statusBarRules` / `statusBarSeen` (types per Task 1)
  - `StatusBarSnapshotItem` gains `shown: boolean; mode: "full" | "compact" | "icon"; ruleCount: number; hasText: boolean; textDisplayed: string;`
  - `setStatusBarItemMode(id: string, mode: "full" | "compact" | "icon"): Promise<void>`
  - `setStatusBarItemRules(id: string, rules: StatusBarRule[]): Promise<void>`

- [ ] **Step 1: Settings fields, import, load**

Add the import:

```ts
import { SEEN_CAP, StatusBarRule, applyStatusBarRules, normalizeStatusBarModes, normalizeStatusBarRules, normalizeStatusBarSeen, pushSeen } from "./core/statusBarRules";
```

Extend `RibbonOrganizerSettings` (after `statusBarHidden`):

```ts
  statusBarModes: Record<string, "compact" | "icon">; // absent id = Full (not stored)
  statusBarRules: Record<string, StatusBarRule[]>;    // per-item text rewrite templates
  statusBarSeen: Record<string, string[]>;            // learned raw status texts (cap 8, LRU newest-last)
```

Field initializer gains `statusBarModes: {}, statusBarRules: {}, statusBarSeen: {}`. In `loadSettings()`, add the three raw-cast fields and:

```ts
      statusBarModes: normalizeStatusBarModes(raw.statusBarModes),
      statusBarRules: normalizeStatusBarRules(raw.statusBarRules),
      statusBarSeen: normalizeStatusBarSeen(raw.statusBarSeen),
```

Replace the `StatusBarSnapshotItem` interface with:

```ts
// A live status bar item as exposed to the settings UI.
export interface StatusBarSnapshotItem {
  id: string;
  text: string;                      // RAW plugin text (pre-rewrite, collapsed) — seen learning and rule authoring use this
  textDisplayed: string;             // what the bar currently shows (post-rewrite); === text when no rule matched
  pinned: boolean;                   // positions itself via its own CSS order; ordering leaves it alone
  hidden: boolean;                   // effective: own hidden list OR Commander's plugin-level hide
  shown: boolean;                    // actually painted: offsetWidth > 0, display ≠ none, opacity ≠ 0
  mode: "full" | "compact" | "icon"; // resolved display mode
  ruleCount: number;                 // rewrite rules configured for this id
  hasText: boolean;                  // text now, or rules/seen entries exist (wand eligibility)
}
```

Add plugin fields below `private statusBarStylesApplied = false;`:

```ts
  // One observer per rule-bearing live item, keyed by id; recreated when the element changes.
  private statusBarRuleObservers = new Map<string, { obs: MutationObserver; el: HTMLElement }>();
  // Per Text node: the raw value we transformed and the value we wrote. A node whose data
  // equals `written` is our own write (skip — kills observer loops and oscillating rules);
  // restore paths put `original` back while `written` still stands.
  private statusBarNodeMemo = new WeakMap<Text, { original: string; written: string }>();
  private statusBarSeenTimer: number | null = null;
```

- [ ] **Step 2: Rules engine + learning helpers**

Add these methods after `applyMobileStatusBarClass()`:

```ts
  // All Text nodes under a status bar item — rules touch these, never element structure.
  private textNodesOf(el: HTMLElement): Text[] {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out: Text[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      out.push(node as Text);
      node = walker.nextNode();
    }
    return out;
  }

  // The item's text as its plugin wrote it (memoized originals substituted for our rewrites).
  private rawStatusBarText(el: HTMLElement): string {
    let raw = "";
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      raw += memo !== undefined && node.data === memo.written ? memo.original : node.data;
    }
    return raw.replace(/\s+/g, " ").trim();
  }

  // Rewrites one item's Text nodes per its rules, feeds seen-learning with raw values, and
  // (Compact mode) keeps the hover title = raw text. Fail-open: unmatched nodes untouched.
  private rewriteStatusBarItem(id: string, el: HTMLElement): void {
    const rules = this.settings.statusBarRules[id] ?? [];
    let rawFull = "";
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      if (memo !== undefined && node.data === memo.written) {
        rawFull += memo.original; // our own write — skip, but keep the raw text intact
        continue;
      }
      const raw = node.data;
      rawFull += raw;
      this.learnStatusBarText(id, raw);
      if (rules.length === 0) continue;
      const out = applyStatusBarRules(raw, rules);
      if (out !== raw) {
        this.statusBarNodeMemo.set(node, { original: raw, written: out });
        node.data = out;
      }
    }
    if (this.settings.statusBarModes[id] === "compact") el.title = rawFull.replace(/\s+/g, " ").trim();
  }

  // Seen-state learning. Only a genuinely new value schedules a (debounced) save, so
  // high-frequency status churn never write-storms data.json.
  private learnStatusBarText(id: string, raw: string): void {
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (collapsed === "") return;
    const current = this.settings.statusBarSeen[id] ?? [];
    const isNew = !current.includes(collapsed);
    this.settings.statusBarSeen[id] = pushSeen(current, collapsed, SEEN_CAP);
    if (isNew && this.statusBarSeenTimer === null) {
      this.statusBarSeenTimer = window.setTimeout(() => {
        this.statusBarSeenTimer = null;
        void this.saveSettings();
      }, 2000);
    }
  }

  // Best-effort undo of our rewrites on one element: nodes the plugin has since overwritten
  // keep the plugin's newer text (its next update wins anyway).
  private restoreStatusBarText(el: HTMLElement): void {
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      if (memo !== undefined && node.data === memo.written) node.data = memo.original;
    }
  }

  // One observer per rule-bearing live item; recreated when the plugin rebuilt its element,
  // disconnected (with text restored) when the rules are gone or the item disappeared.
  private syncStatusBarRuleObservers(live: { id: string; el: HTMLElement }[]): void {
    const wanted = new Map(
      live.filter((i) => (this.settings.statusBarRules[i.id] ?? []).length > 0).map((i) => [i.id, i.el])
    );
    for (const [id, entry] of Array.from(this.statusBarRuleObservers)) {
      if (wanted.get(id) !== entry.el) {
        entry.obs.disconnect();
        this.restoreStatusBarText(entry.el);
        this.statusBarRuleObservers.delete(id);
      }
    }
    for (const [id, el] of wanted) {
      if (this.statusBarRuleObservers.has(id)) continue;
      const obs = new MutationObserver(() => this.rewriteStatusBarItem(id, el));
      obs.observe(el, { characterData: true, childList: true, subtree: true });
      this.statusBarRuleObservers.set(id, { obs, el });
      this.rewriteStatusBarItem(id, el);
    }
  }
```

- [ ] **Step 3: Apply pass, snapshot, setters, unload**

Replace `applyStatusBarOrder()` with:

```ts
  // Applies the stored order, this plugin's own hide layer, and display modes as inline
  // styles/classes, then syncs the rewrite observers. Strict no-op while every config source
  // is empty and nothing was applied this session; an emptied config gets ONE clearing pass.
  // statusBarSeen never activates the pass — learning must not change rendering. Pinned
  // items never receive an order (the 0.9.x left-region bug). Idempotent.
  applyStatusBarOrder(): void {
    const active =
      this.settings.statusBarOrder.length > 0 ||
      this.settings.statusBarHidden.length > 0 ||
      Object.keys(this.settings.statusBarModes).length > 0 ||
      Object.keys(this.settings.statusBarRules).length > 0;
    if (!active && !this.statusBarStylesApplied) return;
    const live = this.liveStatusBarItems();
    if (live === null) return;
    this.statusBarObserver?.disconnect();
    const pinned = new Set(live.filter((i) => i.pinned).map((i) => i.id));
    const writeOrders = this.settings.statusBarOrder.length > 0;
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id), pinned);
    const hidden = new Set(this.settings.statusBarHidden);
    for (const { id, el } of live) {
      const order = writeOrders ? orders.get(id) : undefined;
      const mode = this.settings.statusBarModes[id];
      el.setCssStyles({
        order: order === undefined ? "" : String(order),
        display: hidden.has(id) ? "none" : "",
        maxWidth: mode === "compact" ? "12em" : "",
        overflow: mode === "compact" ? "hidden" : "",
        textOverflow: mode === "compact" ? "ellipsis" : "",
        whiteSpace: mode === "compact" ? "nowrap" : "",
      });
      el.toggleClass("ribbon-organizer-sb-icononly", mode === "icon");
      if (mode !== "compact") el.removeAttribute("title");
      this.rewriteStatusBarItem(id, el); // rules + seen sampling + compact title, every apply
    }
    this.syncStatusBarRuleObservers(live);
    this.statusBarStylesApplied = active;
    const container = statusBarContainer(this.app);
    if (active && container !== null) this.observeStatusBar(container);
  }
```

Replace `statusBarSnapshot()` with:

```ts
  // The settings UI's view of the live status bar. hidden merges this plugin's own list
  // with Commander's plugin-level hide; text is RAW (pre-rewrite), textDisplayed is what
  // the bar shows. Rendering a snapshot also samples seen-learning (spec sample point).
  statusBarSnapshot(): StatusBarSnapshotItem[] | null {
    const live = this.liveStatusBarItems();
    if (live === null) return null;
    const ownHidden = new Set(this.settings.statusBarHidden);
    const cmdrKeys = this.cmdrHiddenStatusBarKeys();
    return live.map(({ id, el, pinned }) => {
      const raw = this.rawStatusBarText(el);
      this.learnStatusBarText(id, raw);
      const rules = this.settings.statusBarRules[id] ?? [];
      const style = getComputedStyle(el);
      return {
        id,
        text: raw,
        textDisplayed: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        pinned,
        hidden: ownHidden.has(id) || cmdrKeys.has(splitStatusBarId(id).key),
        shown: el.offsetWidth > 0 && style.display !== "none" && style.opacity !== "0",
        mode: this.settings.statusBarModes[id] ?? "full",
        ruleCount: rules.length,
        hasText: raw !== "" || rules.length > 0 || (this.settings.statusBarSeen[id] ?? []).length > 0,
      };
    });
  }
```

Add the two setters after `setStatusBarItemHidden`:

```ts
  // Display mode per item: Full is the absence of an entry, so untouched items keep a
  // byte-for-byte native element.
  async setStatusBarItemMode(id: string, mode: "full" | "compact" | "icon"): Promise<void> {
    if (mode === "full") delete this.settings.statusBarModes[id];
    else this.settings.statusBarModes[id] = mode;
    await this.saveSettings();
    this.applyStatusBarOrder();
  }

  // Rewrite rules per item; an emptied list removes the entry, and the next apply pass
  // disconnects the item's observer and restores its text.
  async setStatusBarItemRules(id: string, rules: StatusBarRule[]): Promise<void> {
    if (rules.length === 0) delete this.settings.statusBarRules[id];
    else this.settings.statusBarRules[id] = rules;
    await this.saveSettings();
    this.applyStatusBarOrder();
  }
```

In `onunload()`, replace the status-bar sweep block with (observer teardown FIRST so restores aren't re-rewritten):

```ts
    if (this.statusBarSeenTimer !== null) {
      window.clearTimeout(this.statusBarSeenTimer);
      this.statusBarSeenTimer = null;
    }
    for (const { obs, el } of this.statusBarRuleObservers.values()) {
      obs.disconnect();
      this.restoreStatusBarText(el);
    }
    this.statusBarRuleObservers.clear();
    const sbContainer = statusBarContainer(this.app);
    if (sbContainer !== null) {
      for (const el of Array.from(sbContainer.children)) {
        if (el.instanceOf(HTMLElement) && el.classList.contains("status-bar-item")) {
          el.setCssStyles({ order: "", display: "", maxWidth: "", overflow: "", textOverflow: "", whiteSpace: "" });
          el.removeClass("ribbon-organizer-sb-icononly");
          el.removeAttribute("title");
        }
      }
    }
```

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 83 tests; lint 0 problems.

---

### Task 3: UI — row buttons, not-shown tag, half-zone drag, customize modal

**Files:**
- Create: `src/ui/StatusBarItemModal.ts`
- Modify: `src/ui/StatusBarSection.ts`
- Modify: `src/ui/SettingTab.ts` (aliases only)
- Modify: `styles.css`

**Interfaces:**
- Consumes (Tasks 1–2): `StatusBarRule`; snapshot fields `shown/mode/ruleCount/hasText/textDisplayed`; `plugin.setStatusBarItemMode`, `plugin.setStatusBarItemRules`, `plugin.settings.statusBarSeen/statusBarModes/statusBarRules`.
- Produces: `StatusBarItemModal` (constructor `(app, plugin, id, displayName, onDone)`).

- [ ] **Step 1: Create `src/ui/StatusBarItemModal.ts`**

```ts
import { App, ButtonComponent, ExtraButtonComponent, Modal } from "obsidian";
import { StatusBarRule } from "../core/statusBarRules";
import type RibbonOrganizerPlugin from "../main";

// Per-item customize modal: display-mode pills, learned "seen" chips (click to start a
// rule), and the rewrite-rule editor. Every change saves and re-applies immediately; the
// section behind refreshes via onDone when the modal closes.
export class StatusBarItemModal extends Modal {
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
    if (seen.length > 0) {
      contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Seen on this device — click one to start a rule" });
      const seenEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-seen" });
      for (const sample of [...seen].reverse()) {
        const chip = seenEl.createEl("button", { cls: "ribbon-organizer-sbm-chip", text: sample });
        chip.addEventListener("click", () => {
          void this.saveRules([...this.rules(), { find: sample, replace: sample }]).then(() => this.renderContent());
        });
      }
    }

    contentEl.createDiv({ cls: "ribbon-organizer-sbm-sec", text: "Rewrite rules" });
    this.rules().forEach((rule, index) => {
      const rowEl = contentEl.createDiv({ cls: "ribbon-organizer-sbm-rule" });
      const findEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Text to match" } });
      findEl.value = rule.find;
      rowEl.createSpan({ cls: "ribbon-organizer-sbm-arrow", text: "→" });
      const replaceEl = rowEl.createEl("input", { attr: { type: "text", placeholder: "Show instead" } });
      replaceEl.value = rule.replace;
      const commit = (): void => {
        const next = this.rules();
        next[index] = { find: findEl.value, replace: replaceEl.value };
        void this.saveRules(next);
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
      text: "Use {name} for the part that changes; it carries over to the result. Anything that doesn't match a rule is shown as-is.",
    });
  }

  private rules(): StatusBarRule[] {
    return (this.plugin.settings.statusBarRules[this.id] ?? []).map((rule) => ({ ...rule }));
  }

  private async saveRules(rules: StatusBarRule[]): Promise<void> {
    await this.plugin.setStatusBarItemRules(this.id, rules);
  }
}
```

- [ ] **Step 2: `src/ui/StatusBarSection.ts` — buttons, tag, half-zone**

Add the import: `import { StatusBarItemModal } from "./StatusBarItemModal";`

In `renderRow`, replace the right-side slot chain (the `if (live === undefined) … else if (pinned) … else if (live.text !== "")` block) with:

```ts
    if (live === undefined) row.createSpan({ cls: "ribbon-organizer-sb-missing", text: "Not on this device" });
    else if (pinned) row.createSpan({ cls: "ribbon-organizer-sb-pintag", text: "Keeps its own position" });
    else if (!live.hidden && !live.shown) row.createSpan({ cls: "ribbon-organizer-sb-notshown", text: "Not shown right now" });
    else if (live.textDisplayed !== "") row.createSpan({ cls: "ribbon-organizer-sb-preview", text: live.textDisplayed });
```

Replace the buttons block (`if (live !== undefined) { const btns = … eye … }`) with:

```ts
    if (live !== undefined) {
      const btns = row.createDiv({ cls: "ribbon-organizer-rg-btns" });
      if (live.hasText) {
        const wand = new ExtraButtonComponent(btns)
          .setIcon("wand-2")
          .setTooltip("Rewrite rules")
          .onClick(() => {
            new StatusBarItemModal(this.app, this.plugin, id, this.displayName(key), () => {
              if (this.containerEl !== null) this.render(this.containerEl);
            }).open();
          });
        wand.extraSettingsEl.toggleClass("is-rules-on", live.ruleCount > 0);
      }
      const MODE_NEXT = { full: "compact", compact: "icon", icon: "full" } as const;
      const MODE_ICON = { full: "text", compact: "ellipsis", icon: "circle-dot" } as const;
      const MODE_NAME = { full: "Full", compact: "Compact", icon: "Icon only" } as const;
      const modeBtn = new ExtraButtonComponent(btns)
        .setIcon(MODE_ICON[live.mode])
        .setTooltip(MODE_NAME[live.mode])
        .onClick(() => {
          void this.plugin.setStatusBarItemMode(id, MODE_NEXT[live.mode]).then(() => {
            if (this.containerEl !== null) this.render(this.containerEl);
          });
        });
      modeBtn.extraSettingsEl.toggleClass("is-mode-on", live.mode !== "full");
      const eye = new ExtraButtonComponent(btns)
        .setIcon(live.hidden ? "eye-off" : "eye")
        .setTooltip(live.hidden ? "Show this item" : "Hide this item")
        .onClick(() => {
          void this.plugin.setStatusBarItemHidden(id, !live.hidden).then(() => {
            if (this.containerEl !== null) this.render(this.containerEl);
          });
        });
      eye.extraSettingsEl.toggleClass("is-eye-off", live.hidden);
    }
```

Change the spotlight gate to `if (live !== undefined && !live.hidden && live.shown) this.wireSpot(row, clone, liveEl);` and the strip's skip in `renderStrip` to `if (item.hidden || !item.shown) continue;`.

Replace the row-drop wiring: the `this.wireDrop(row, …)` call at the end of `renderRow` becomes `this.wireRowDrop(row, id, rowIds);`, and add this method after `wireDrop` (the hint keeps using the generic `wireDrop`):

```ts
  // Half-zone insertion: the pointer's vertical half decides before/after, so the last
  // row's bottom half reaches the end of the list.
  private wireRowDrop(row: HTMLElement, id: string, rowIds: string[]): void {
    const zoneOf = (e: DragEvent): "before" | "after" => {
      const rect = row.getBoundingClientRect();
      return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    };
    const clear = (): void => {
      row.removeClass("is-drop-before");
      row.removeClass("is-drop-after");
    };
    row.addEventListener("dragover", (e) => {
      if (this.drag === null) return;
      e.preventDefault();
      const zone = zoneOf(e);
      row.toggleClass("is-drop-before", zone === "before");
      row.toggleClass("is-drop-after", zone === "after");
    });
    row.addEventListener("dragleave", clear);
    row.addEventListener("dragend", () => {
      this.drag = null;
      clear();
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      const zone = zoneOf(e);
      clear();
      const draggedId = this.drag;
      this.drag = null;
      if (draggedId === null || draggedId === id) return;
      const out = rowIds.filter((r) => r !== draggedId);
      let to = out.indexOf(id);
      if (to === -1) return;
      if (zone === "after") to += 1;
      out.splice(to, 0, draggedId);
      this.persist(out);
    });
  }
```

In `src/ui/SettingTab.ts`, extend the aliases array with `"rewrite", "compact", "icon only", "not shown"` (keep existing entries).

- [ ] **Step 3: styles.css**

Append to the Status bar tab block (after the spot rule):

```css
.ribbon-organizer-sb-notshown { margin-left: auto; color: var(--text-faint); font-size: var(--font-ui-smaller); font-style: italic; }
.ribbon-organizer-sb-item.is-drop-before { box-shadow: inset 0 2px 0 var(--interactive-accent); }
.ribbon-organizer-sb-item.is-drop-after { box-shadow: inset 0 -2px 0 var(--interactive-accent); }
.ribbon-organizer-rg-btns .is-rules-on, .ribbon-organizer-rg-btns .is-mode-on { color: var(--text-accent); }
/* Icon only: zero the text, keep icon children at their normal size */
.status-bar-item.ribbon-organizer-sb-icononly { font-size: 0; letter-spacing: 0; }
.status-bar-item.ribbon-organizer-sb-icononly svg,
.status-bar-item.ribbon-organizer-sb-icononly .svg-icon { width: var(--icon-s, 16px); height: var(--icon-s, 16px); }
/* Customize modal */
.ribbon-organizer-sbm-sec { font-size: var(--font-ui-smaller); color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.05em; margin: 14px 0 6px; }
.ribbon-organizer-sbm-modes { display: flex; gap: 6px; }
.ribbon-organizer-sbm-pill.is-selected { border-color: var(--interactive-accent); color: var(--text-normal); }
.ribbon-organizer-sbm-seen { display: flex; flex-wrap: wrap; gap: 6px; }
.ribbon-organizer-sbm-chip { font-size: var(--font-ui-smaller); border: 1px dashed var(--background-modifier-border); background: var(--background-primary); border-radius: 5px; padding: 2px 8px; box-shadow: none; height: auto; }
.ribbon-organizer-sbm-rule { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.ribbon-organizer-sbm-rule input { flex: 1; font-family: var(--font-monospace); font-size: var(--font-ui-smaller); }
.ribbon-organizer-sbm-arrow { color: var(--text-faint); flex: none; }
.ribbon-organizer-sbm-addbar { margin-top: 8px; }
.ribbon-organizer-sbm-note { margin-top: 12px; color: var(--text-faint); font-size: var(--font-ui-smaller); }
```

- [ ] **Step 4: Gates**

Run: `npm run build && npm test && npm run lint`
Expected: build clean; 83 tests; lint 0 problems.

---

### Task 4: Docs

**Files:**
- Modify: `README.md`, `README.zh.md` (1-for-1 line replacements — counts stay 60/60)
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: README bullet (both languages)**

`README.md` — replace the Status bar Features bullet with:

```markdown
- **Status bar** — drag the status bar items into your own order, hide the ones you don't need, shorten noisy ones (compact and icon-only modes, plus rewrite rules like `Successfully synced {time}` → `✓ {time}`), watch it all in a live preview, and optionally show the status bar on phones and tablets as a floating pill.
```

`README.zh.md` — replace the corresponding bullet with:

```markdown
- **状态栏** — 拖拽排序、眼睛隐藏、收纳吵闹的条目(紧凑/仅图标两档显示模式,以及 `Successfully synced {time}` → `✓ {time}` 这样的重写规则),内置实时预览;还可选择在手机和平板上以浮动胶囊的形式显示状态栏。
```

- [ ] **Step 2: README "### Status bar" paragraph (both languages)**

`README.md` — replace the paragraph under `### Status bar` with:

```markdown
The Status bar tab lists every status bar item; drag to reorder (drop on a row's top or bottom half to land before or after it), hide with the eye, and everything applies live and on every device — items a device doesn't have keep their place. Each row's mode button cycles Full → Compact (capped width with the full text on hover) → Icon only, and the wand opens rewrite rules: `Successfully synced {time}` → `✓ {time}` turns Remotely Save's long message into a glance, `{name}` carries the changing part over, and anything that doesn't match a rule is shown exactly as its plugin wrote it. The tab learns the statuses it has seen so you can start a rule from a real example. Rows for items that exist but aren't visible right now (a Vim pending-key display, a hover-revealed button) say "Not shown right now"; self-positioning items show a lock and stay where their plugin puts them; a preview strip mirrors the real bar and hovering a row, the preview, or the bar itself highlights the same item in all three places. Obsidian hides the status bar on mobile by default: the "Show on phones and tablets" toggle floats it above the toolbar. Items are recognized by their plugin; a plugin showing several items keeps them apart by position, which in rare cases can swap after an update of that plugin.
```

`README.zh.md` — replace the paragraph under `### 状态栏` with:

```markdown
「Status bar」标签页列出所有状态栏条目:拖拽排序(落在行的上/下半区决定插到它前面还是后面)、眼睛隐藏,全部即时生效并同步到所有设备——本设备没有的条目保留原位。每行的模式按钮在 Full → Compact(限宽,悬停看全文)→ Icon only 间循环;魔杖打开重写规则:`Successfully synced {time}` → `✓ {time}` 让 Remotely Save 的长消息一眼可读,`{name}` 会把变化的部分带到结果里,任何没有命中规则的文本都按插件原样显示。标签页会记住见过的状态,你可以从真实样本一键起草规则。挂载但此刻不可见的条目(Vim 待决按键、悬停才显形的按钮)显示「Not shown right now」;自己定位的条目显示锁并保留插件设定的位置;预览条如实映射真实状态栏,悬停设置行、预览条目或状态栏本身,三处会同时高亮同一个条目。Obsidian 在移动端默认隐藏状态栏:打开「Show on phones and tablets」开关后,状态栏会浮动在工具栏上方。条目按所属插件识别;同一插件的多个条目按位置区分,极少数情况下在该插件更新后可能互换。
```

Verify parity: `wc -l README.md README.zh.md` — both 60.

- [ ] **Step 3: ARCHITECTURE updates**

Module map — add after the `core/statusBarItems.ts` bullet:

```markdown
- **`core/statusBarRules.ts`** — status bar text rewriting, pure: the `{name}` template engine (`applyStatusBarRules` — literal parts escaped, placeholders become lazy capture groups, anchored full-match, first rule wins, malformed/empty templates never match), `pushSeen` (collapsed/deduped/capped LRU), and the three normalizers for `statusBarModes`/`statusBarRules`/`statusBarSeen`.
```

Update the `ui/StatusBarSection.ts` bullet's parenthetical to: `(mobile-display toggle, clone-based preview strip, three-way hover spotlight with tracked cleanup, per-item eye + display-mode cycle + rewrite wand, "Not shown right now" state, lock rows for self-positioned items, half-zone drag list — top half inserts before, bottom half after, append via the footer hint)`.

Add after it:

```markdown
- **`ui/StatusBarItemModal.ts`** — the per-item customize modal: display-mode pills, learned seen-state chips (click to start a rule), and the rewrite-rule editor. Every change saves and re-applies immediately.
```

Core invariants — append:

```markdown
- **Rewriting is fail-open and text-node-scoped.** Rules touch individual `Text` nodes only (structure, icons, and handlers untouched); unmatched or malformed templates leave the plugin's text exactly as written. Loop safety: a `WeakMap<Text, {original, written}>` — a node whose data equals `written` is our own write and is skipped; unload and rule removal restore `original` where `written` still stands. One MutationObserver per rule-bearing item, recreated when its element is rebuilt.
- **Learning never renders.** `statusBarSeen` (cap 8 per item, LRU) samples raw pre-rewrite text at apply, settings render, and observer fires; it never makes the apply pass active, and only a genuinely new value schedules a debounced save.
```

Data model — add after the `statusBarHidden` bullet:

```markdown
- `statusBarModes: Record<id, "compact" | "icon">` — display mode per item; Full = no entry.
- `statusBarRules: Record<id, {find, replace}[]>` — `{name}` template rewrite rules; empty-find drafts are kept (they never match).
- `statusBarSeen: Record<id, string[]>` — learned raw status texts, cap 8, newest last.
```

- [ ] **Step 4: Gates + parity**

Run: `npm run build && npm test && npm run lint && wc -l README.md README.zh.md`
Expected: build clean; 83 tests; lint 0 problems; 60/60.

---

## Controller smoke checklist (dev vault, after Tasks 2–3; not implementer steps)

- Not-shown: synthetic `display:none` item → row tag "Not shown right now", strip omits, spotlight not wired.
- Half-zone: eval-driven check of drop math is impractical — verify visually (drag to a row's top/bottom half; last row's bottom half lands the item at the end).
- Modes: set compact on a long-text item → inline max-width/ellipsis + `title` = raw text; icon mode → text invisible, icon intact, strip mirrors; back to full → all cleared.
- Rules engine: synthetic item + fake plugin interval rewriting its text every 200ms; rule `Fake {n}` → `F{n}`; assert the bar shows rewritten text continuously, mutation count stays bounded (no loop), seen list collects raw `Fake 1..n` values (cap 8), rule removal restores plugin text, unload restores + observers gone.
- Modal: open via wand, pills switch mode live, chip prefills a rule, note text exact.
- cmdr-adder investigation (spec Feature 6): synthetic `opacity:0`+`:hover{opacity:1}` item placed as first ordered element after a `flex-grow` pinned spacer; check whether its hover target is reachable; record the finding in the ledger (product response = the Not-shown tag it already gets + optionally one README sentence in a future pass).
- Regression: 0.10.0 smoke set still passes (pinned skip, eye two-layer, clearing pass, teardown-on-close).
