import { describe, expect, it } from "vitest";
import {
  SEEN_CAP,
  applyStatusBarRules,
  autoTemplateRule,
  normalizeStatusBarModes,
  normalizeStatusBarRules,
  normalizeStatusBarSeen,
  pushSeen,
} from "../src/core/statusBarRules";

describe("applyStatusBarRules", () => {
  it("matches a literal template exactly and replaces it", () => {
    expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "⟳" }])).toEqual({ text: "⟳", icon: null, iconColor: null, textColor: null });
  });

  it("captures a {name} placeholder and carries it into the replacement", () => {
    const rules = [{ find: "Successfully synced {time}", replace: "✓ {time}" }];
    expect(applyStatusBarRules("Successfully synced 2 hours ago", rules)).toEqual({ text: "✓ 2 hours ago", icon: null, iconColor: null, textColor: null });
    expect(applyStatusBarRules("Successfully synced just now", rules)).toEqual({ text: "✓ just now", icon: null, iconColor: null, textColor: null });
  });

  it("supports multiple placeholders", () => {
    const rules = [{ find: "{w} words{c} characters", replace: "{w}w {c}c" }];
    expect(applyStatusBarRules("22 words39 characters", rules)).toEqual({ text: "22w 39c", icon: null, iconColor: null, textColor: null });
  });

  it("first matching rule wins", () => {
    const rules = [
      { find: "Syncing...", replace: "first" },
      { find: "{any}", replace: "second" },
    ];
    expect(applyStatusBarRules("Syncing...", rules)).toEqual({ text: "first", icon: null, iconColor: null, textColor: null });
  });

  it("returns the text unchanged when no rule matches (fail-open)", () => {
    expect(applyStatusBarRules("Never Synced", [{ find: "Syncing...", replace: "⟳" }])).toEqual({ text: "Never Synced", icon: null, iconColor: null, textColor: null });
  });

  it("requires a full match, not a substring", () => {
    expect(applyStatusBarRules("prefix Syncing... suffix", [{ find: "Syncing...", replace: "⟳" }])).toEqual({ text: "prefix Syncing... suffix", icon: null, iconColor: null, textColor: null });
  });

  it("treats regex specials in literals literally", () => {
    expect(applyStatusBarRules("(sync) 50% [done]", [{ find: "(sync) {p} [done]", replace: "{p}" }])).toEqual({ text: "50%", icon: null, iconColor: null, textColor: null });
  });

  it("never matches malformed or empty templates (fail-open)", () => {
    expect(applyStatusBarRules("abc", [{ find: "a{b", replace: "x" }])).toEqual({ text: "abc", icon: null, iconColor: null, textColor: null }); // unbalanced
    expect(applyStatusBarRules("abc", [{ find: "{x} and {x}", replace: "y" }])).toEqual({ text: "abc", icon: null, iconColor: null, textColor: null }); // duplicate name
    expect(applyStatusBarRules("abc", [{ find: "{}", replace: "y" }])).toEqual({ text: "abc", icon: null, iconColor: null, textColor: null }); // empty name
    expect(applyStatusBarRules("", [{ find: "", replace: "y" }])).toEqual({ text: "", icon: null, iconColor: null, textColor: null }); // empty find never matches
  });

  it("never re-substitutes text a capture inserted", () => {
    const rules = [{ find: "{a} and {b}", replace: "{a} - {b}" }];
    expect(applyStatusBarRules("{b} and world", rules)).toEqual({ text: "{b} - world", icon: null, iconColor: null, textColor: null });
  });

  it("leaves unknown placeholders in the replacement as literal text", () => {
    expect(applyStatusBarRules("hi", [{ find: "hi", replace: "{other}" }])).toEqual({ text: "{other}", icon: null, iconColor: null, textColor: null });
  });

  it("returns the matching rule's icon; icon-only yields empty text", () => {
    const rules = [{ find: "Syncing...", replace: "", icon: "refresh-cw" }];
    expect(applyStatusBarRules("Syncing...", rules)).toEqual({ text: "", icon: "refresh-cw", iconColor: null, textColor: null });
    expect(applyStatusBarRules("Never Synced", rules)).toEqual({ text: "Never Synced", icon: null, iconColor: null, textColor: null });
  });

  it("treats a rule with empty replace and no icon as an inert draft", () => {
    expect(applyStatusBarRules("Syncing...", [{ find: "Syncing...", replace: "" }])).toEqual({ text: "Syncing...", icon: null, iconColor: null, textColor: null });
  });

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

  it("keeps a non-empty string icon and drops other icon shapes", () => {
    const raw = { a: [{ find: "x", replace: "y", icon: "check" }, { find: "x", replace: "y", icon: "" }, { find: "x", replace: "y", icon: 3 }] };
    expect(normalizeStatusBarRules(raw)).toEqual({ a: [{ find: "x", replace: "y", icon: "check" }, { find: "x", replace: "y" }, { find: "x", replace: "y" }] });
  });

  it("keeps valid rule colors and drops invalid ones (field, not rule)", () => {
    expect(normalizeStatusBarRules({ id: [
      { find: "a", replace: "b", iconColor: "#ff0000", textColor: "#00ff00" },
      { find: "c", replace: "d", iconColor: "", textColor: 5 },
    ] })).toEqual({ id: [
      { find: "a", replace: "b", iconColor: "#ff0000", textColor: "#00ff00" },
      { find: "c", replace: "d" },
    ] });
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
