import { describe, expect, it } from "vitest";
import { defaultMenus, normalizeMenus, uniqueMenuName } from "../src/core/quickMenus";

describe("normalizeMenus", () => {
  it("returns the default single menu when nothing is stored", () => {
    const out = normalizeMenus(undefined, undefined);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu", entries: [] });
    expect(out[0]?.id).toBeTruthy();
  });

  it("migrates a legacy quickCommands list into the first menu", () => {
    const legacy = [{ commandId: "a:x", label: "X", icon: "cloud" }, { kind: "separator" }];
    const out = normalizeMenus(undefined, legacy);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu" });
    expect(out[0]?.entries).toEqual(legacy);
  });

  it("migrates an empty legacy list to one empty menu", () => {
    const out = normalizeMenus(undefined, []);
    expect(out).toHaveLength(1);
    expect(out[0]?.entries).toEqual([]);
  });

  it("keeps zero menus when the user deleted them all", () => {
    expect(normalizeMenus([], [{ commandId: "a:x", label: "X", icon: "i" }])).toEqual([]);
  });

  it("fills missing ids and drops malformed menus and entries", () => {
    const out = normalizeMenus(
      [
        { name: "Good", icon: "zap", entries: [{ commandId: "a:x", label: "X", icon: "i" }, null, { bogus: true }, { kind: "separator" }] },
        { name: "  ", icon: "zap", entries: [] }, // blank name: dropped
        { icon: "zap", entries: [] },             // no name: dropped
        { name: "NoIcon", entries: [] },          // no icon: dropped
        "junk",
        null,
      ],
      undefined
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBeTruthy();
    expect(out[0]?.entries).toEqual([{ commandId: "a:x", label: "X", icon: "i" }, { kind: "separator" }]);
  });

  it("treats a non-array entries field as empty", () => {
    const out = normalizeMenus([{ name: "M", icon: "i", entries: "junk" }], undefined);
    expect(out[0]?.entries).toEqual([]);
  });

  it("suffixes duplicate names deterministically", () => {
    const out = normalizeMenus(
      [
        { id: "1", name: "Menu", icon: "a", entries: [] },
        { id: "2", name: "Menu", icon: "b", entries: [] },
        { id: "3", name: "Menu", icon: "c", entries: [] },
      ],
      undefined
    );
    expect(out.map((m) => m.name)).toEqual(["Menu", "Menu 2", "Menu 3"]);
  });

  it("preserves stored ids", () => {
    const out = normalizeMenus([{ id: "keep-me", name: "M", icon: "i", entries: [] }], undefined);
    expect(out[0]?.id).toBe("keep-me");
  });
});

describe("uniqueMenuName", () => {
  it("returns the base when free", () => {
    expect(uniqueMenuName("New menu", [])).toBe("New menu");
  });

  it("suffixes past every taken name", () => {
    expect(uniqueMenuName("New menu", ["New menu", "New menu 2"])).toBe("New menu 3");
  });
});

describe("defaultMenus", () => {
  it("is one empty Ribbon Organizer menu", () => {
    const out = defaultMenus();
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ribbon Organizer", icon: "menu", entries: [] });
  });
});
