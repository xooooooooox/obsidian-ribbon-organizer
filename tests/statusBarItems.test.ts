import { describe, expect, it } from "vitest";
import {
  computeStatusBarOrder,
  deriveStatusBarIds,
  fallbackItemName,
  normalizeStatusBarOrder,
  splitStatusBarId,
  statusBarItemKey,
  statusBarRowIds,
} from "../src/core/statusBarItems";

describe("statusBarItemKey", () => {
  it("uses the plugin- class and ignores every other class", () => {
    expect(statusBarItemKey(["status-bar-item", "plugin-obsidian-git", "mod-clickable"])).toBe("obsidian-git");
    // state classes churn at runtime and must not affect identity
    expect(statusBarItemKey(["plugin-config-sync", "config-sync-statusbar", "mod-clickable", "is-clean"])).toBe("config-sync");
  });

  it("falls back to the sorted non-generic classes joined with +", () => {
    expect(statusBarItemKey(["cmdr", "status-bar-item", "cmdr-adder"])).toBe("cmdr+cmdr-adder");
    expect(statusBarItemKey(["status-bar-item", "left-region"])).toBe("left-region");
  });

  it("keys a bare item as \"item\"", () => {
    expect(statusBarItemKey(["status-bar-item", "mod-clickable"])).toBe("item");
    expect(statusBarItemKey([])).toBe("item");
  });
});

describe("deriveStatusBarIds", () => {
  it("numbers same-key items by DOM occurrence, 0-based", () => {
    const ids = deriveStatusBarIds([
      ["status-bar-item", "plugin-obsidian-git"],
      ["status-bar-item", "plugin-word-count"],
      ["status-bar-item", "plugin-obsidian-git", "mod-clickable"],
    ]);
    expect(ids).toEqual(["obsidian-git#0", "word-count#0", "obsidian-git#1"]);
  });

  it("returns one id per input in input order", () => {
    expect(deriveStatusBarIds([])).toEqual([]);
    expect(deriveStatusBarIds([["status-bar-item"], ["status-bar-item"]])).toEqual(["item#0", "item#1"]);
  });
});

describe("splitStatusBarId", () => {
  it("splits key and index at the last #", () => {
    expect(splitStatusBarId("obsidian-git#1")).toEqual({ key: "obsidian-git", index: 1 });
    expect(splitStatusBarId("cmdr+cmdr-adder#0")).toEqual({ key: "cmdr+cmdr-adder", index: 0 });
  });

  it("treats a malformed id as index 0", () => {
    expect(splitStatusBarId("no-hash")).toEqual({ key: "no-hash", index: 0 });
    expect(splitStatusBarId("bad#x")).toEqual({ key: "bad", index: 0 });
  });
});

describe("computeStatusBarOrder", () => {
  it("orders stored ids first, then appends unknown live ids in live order", () => {
    const orders = computeStatusBarOrder(["b#0", "a#0"], ["a#0", "b#0", "c#0", "d#0"]);
    const sorted = [...orders.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(sorted).toEqual(["b#0", "a#0", "c#0", "d#0"]);
  });

  it("skips stored ids absent from live but emits an entry for every live id", () => {
    const orders = computeStatusBarOrder(["gone#0", "a#0"], ["a#0", "new#0"]);
    expect(orders.has("gone#0")).toBe(false);
    expect(orders.size).toBe(2);
  });

  it("assigns strictly increasing values starting at 1", () => {
    const orders = computeStatusBarOrder(["a#0"], ["a#0", "b#0"]);
    expect(orders.get("a#0")).toBe(1);
    expect(orders.get("b#0")).toBe(2);
  });
});

describe("statusBarRowIds", () => {
  it("keeps absent stored ids in place and appends new live ids", () => {
    expect(statusBarRowIds(["desk-only#0", "a#0"], ["a#0", "b#0"])).toEqual(["desk-only#0", "a#0", "b#0"]);
  });

  it("returns live order when nothing is stored", () => {
    expect(statusBarRowIds([], ["a#0", "b#0"])).toEqual(["a#0", "b#0"]);
  });
});

describe("normalizeStatusBarOrder", () => {
  it("returns [] for a non-array", () => {
    expect(normalizeStatusBarOrder(undefined)).toEqual([]);
    expect(normalizeStatusBarOrder({ a: 1 })).toEqual([]);
  });

  it("drops non-strings and duplicates, first wins", () => {
    expect(normalizeStatusBarOrder(["a#0", 3, "b#0", "a#0", null])).toEqual(["a#0", "b#0"]);
  });
});

describe("fallbackItemName", () => {
  it("prettifies a simple key", () => {
    expect(fallbackItemName("word-count")).toBe("Word count");
    expect(fallbackItemName("left-region")).toBe("Left region");
  });

  it("uses the most specific (longest) class of a joined key", () => {
    expect(fallbackItemName("cmdr+cmdr-adder")).toBe("Cmdr adder");
  });

  it("never returns an empty name", () => {
    expect(fallbackItemName("")).toBe("Item");
  });
});
