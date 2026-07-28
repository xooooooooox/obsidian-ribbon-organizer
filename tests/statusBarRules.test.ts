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

  it("never re-substitutes text a capture inserted", () => {
    const rules = [{ find: "{a} and {b}", replace: "{a} - {b}" }];
    expect(applyStatusBarRules("{b} and world", rules)).toBe("{b} - world");
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
