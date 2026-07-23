import { describe, expect, it } from "vitest";
import {
  RibbonGroup,
  UNGROUPED_ID,
  addGroup,
  computeMenuRows,
  computeRibbonLayout,
  defaultGroups,
  deleteGroup,
  moveGroup,
  moveItemToGroup,
  normalizeGroups,
  renameGroup,
} from "../src/core/ribbonGroups";

const g = (id: string, items: string[]): RibbonGroup => ({ id, name: id, items });
const g2 = (id: string, name: string, items: string[]): RibbonGroup => ({ id, name, items });
const ungrouped = (): RibbonGroup => ({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
const live = (id: string, hidden = false) => ({ id, hidden });

describe("computeRibbonLayout", () => {
  it("orders claimed items by group walk and unclaimed into the sentinel slot", () => {
    const groups = [g("a", ["p:1", "p:2"]), ungrouped(), g("b", ["p:3"])];
    const items = [live("p:3"), live("p:9"), live("p:1"), live("p:2"), live("p:8")];
    const { orders } = computeRibbonLayout(groups, items);
    // group a, then unclaimed (live order p:9, p:8), then group b
    const sorted = [...orders.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id);
    expect(sorted).toEqual(["p:1", "p:2", "p:9", "p:8", "p:3"]);
  });

  it("skips configured ids absent from the live list", () => {
    const groups = [g("a", ["gone:x", "p:1"]), ungrouped()];
    const { orders } = computeRibbonLayout(groups, [live("p:1")]);
    expect(orders.has("gone:x")).toBe(false);
    expect(orders.has("p:1")).toBe(true);
  });

  it("emits dividers only between adjacent non-empty groups", () => {
    const groups = [g("a", ["p:1"]), g("empty", []), g("b", ["p:2"]), ungrouped()];
    const { orders, dividerOrders } = computeRibbonLayout(groups, [live("p:1"), live("p:2")]);
    // ungrouped is empty too: exactly one divider, between a and b
    expect(dividerOrders).toHaveLength(1);
    const d = dividerOrders[0] ?? NaN;
    expect(d).toBeGreaterThan(orders.get("p:1") ?? NaN);
    expect(d).toBeLessThan(orders.get("p:2") ?? NaN);
  });

  it("treats a group whose members are all natively hidden as empty for dividers", () => {
    const groups = [g("a", ["p:1"]), g("b", ["p:2"]), g("c", ["p:3"]), ungrouped()];
    const items = [live("p:1"), live("p:2", true), live("p:3")];
    const { orders, dividerOrders } = computeRibbonLayout(groups, items);
    expect(dividerOrders).toHaveLength(1); // a|c only — b is invisible
    expect(orders.has("p:2")).toBe(true); // hidden items still get an order value
  });

  it("emits no divider with a single non-empty group", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    expect(computeRibbonLayout(groups, [live("p:1")]).dividerOrders).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const groups = [g("a", ["p:1"]), ungrouped()];
    const items = [live("p:1"), live("p:2")];
    const groupsCopy = structuredClone(groups);
    const itemsCopy = structuredClone(items);
    computeRibbonLayout(groups, items);
    expect(groups).toEqual(groupsCopy);
    expect(items).toEqual(itemsCopy);
  });
});

describe("normalizeGroups", () => {
  it("returns defaults for non-arrays", () => {
    expect(normalizeGroups(undefined)).toEqual(defaultGroups());
    expect(normalizeGroups("junk")).toEqual(defaultGroups());
  });

  it("drops malformed entries and duplicate item claims (first group wins)", () => {
    const out = normalizeGroups([
      { id: "a", name: "A", items: ["p:1", "p:2"] },
      { bogus: true },
      { id: "b", name: "B", items: ["p:2", "p:3", 42] },
      ungrouped(),
    ]);
    expect(out).toEqual([g2("a", "A", ["p:1", "p:2"]), g2("b", "B", ["p:3"]), ungrouped()]);
  });

  it("re-inserts a missing sentinel at the end and collapses extras", () => {
    expect(normalizeGroups([{ id: "a", name: "A", items: [] }])).toEqual([g2("a", "A", []), ungrouped()]);
    const twoSentinels = normalizeGroups([ungrouped(), { id: UNGROUPED_ID, name: "X", items: ["p:1"] }]);
    expect(twoSentinels).toEqual([ungrouped()]);
  });
});

describe("group mutations", () => {
  const base = (): RibbonGroup[] => [g("a", ["p:1", "p:2"]), ungrouped(), g("b", ["p:3"])];

  it("addGroup appends an empty group and rejects duplicate ids", () => {
    const out = addGroup(base(), "c", "New group");
    expect(out[3]).toEqual({ id: "c", name: "New group", items: [] });
    expect(() => addGroup(base(), "a", "Dup")).toThrow(/duplicate/);
  });

  it("renameGroup renames; sentinel and unknown ids throw", () => {
    expect(renameGroup(base(), "a", "Alpha")[0]?.name).toBe("Alpha");
    expect(() => renameGroup(base(), UNGROUPED_ID, "X")).toThrow(/ungrouped/);
    expect(() => renameGroup(base(), "nope", "X")).toThrow(/unknown group/);
  });

  it("deleteGroup removes the group (members implicitly fall to ungrouped); sentinel throws", () => {
    const out = deleteGroup(base(), "a");
    expect(out.map((x) => x.id)).toEqual([UNGROUPED_ID, "b"]);
    expect(() => deleteGroup(base(), UNGROUPED_ID)).toThrow(/ungrouped/);
  });

  it("moveGroup reorders by post-removal index, sentinel included", () => {
    expect(moveGroup(base(), "b", 0).map((x) => x.id)).toEqual(["b", "a", UNGROUPED_ID]);
    expect(moveGroup(base(), UNGROUPED_ID, 0).map((x) => x.id)).toEqual([UNGROUPED_ID, "a", "b"]);
  });

  it("moveItemToGroup removes from source and inserts at index (appends when omitted)", () => {
    const appended = moveItemToGroup(base(), "p:1", "b");
    expect(appended[0]?.items).toEqual(["p:2"]);
    expect(appended[2]?.items).toEqual(["p:3", "p:1"]);
    const inserted = moveItemToGroup(base(), "p:3", "a", 1);
    expect(inserted[0]?.items).toEqual(["p:1", "p:3", "p:2"]);
    expect(inserted[2]?.items).toEqual([]);
  });

  it("moveItemToGroup with target ungrouped only removes the claim", () => {
    const out = moveItemToGroup(base(), "p:1", UNGROUPED_ID);
    expect(out[0]?.items).toEqual(["p:2"]);
    expect(out[1]?.items).toEqual([]); // sentinel items stay empty — membership is derived
  });

  it("mutations never touch their input", () => {
    const groups = base();
    const copy = structuredClone(groups);
    moveItemToGroup(groups, "p:1", "b");
    deleteGroup(groups, "a");
    moveGroup(groups, "b", 0);
    expect(groups).toEqual(copy);
  });
});

describe("computeMenuRows", () => {
  const groups = [
    { id: "g1", name: "A", items: ["p:one", "p:two"] },
    { id: UNGROUPED_ID, name: "Ungrouped", items: [] },
    { id: "g2", name: "B", items: ["p:three"] },
  ];

  it("lists visible members in group order with separators between non-empty groups", () => {
    const live = [
      { id: "p:three", hidden: false },
      { id: "p:one", hidden: false },
      { id: "p:free", hidden: false },
      { id: "p:two", hidden: false },
    ];
    expect(computeMenuRows(groups, live)).toEqual([
      { kind: "item", id: "p:one" },
      { kind: "item", id: "p:two" },
      { kind: "separator" },
      { kind: "item", id: "p:free" },
      { kind: "separator" },
      { kind: "item", id: "p:three" },
    ]);
  });

  it("omits hidden items and emits no separator around all-hidden groups", () => {
    const live = [
      { id: "p:one", hidden: true },
      { id: "p:two", hidden: true },
      { id: "p:free", hidden: false },
      { id: "p:three", hidden: false },
    ];
    expect(computeMenuRows(groups, live)).toEqual([
      { kind: "item", id: "p:free" },
      { kind: "separator" },
      { kind: "item", id: "p:three" },
    ]);
  });

  it("returns empty for no visible items", () => {
    expect(computeMenuRows(groups, [{ id: "p:one", hidden: true }])).toEqual([]);
  });
});
