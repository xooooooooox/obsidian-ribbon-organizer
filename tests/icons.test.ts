import { describe, expect, it } from "vitest";
import { BRAND_ICON_ID, BRAND_ICON_SVG, iconChoices, IconPack } from "../src/core/icons";

const feishu: IconPack = {
  name: "feishu",
  prefix: "Fe",
  icons: [{ name: "SyncFeishu", prefix: "Fe" }, { name: "FetchFeishu", prefix: "Fe" }],
};
const lucide: IconPack = { name: "lucide-icons", prefix: "Li", icons: [{ name: "Home", prefix: "Li" }] };

describe("iconChoices", () => {
  it("passes built-in ids through as pack:null", () => {
    expect(iconChoices(["home", "star"], [])).toEqual([
      { id: "home", text: "home", pack: null },
      { id: "star", text: "star", pack: null },
    ]);
  });

  it("appends custom-pack icons with prefix+name id and pack tag", () => {
    expect(iconChoices(["home"], [feishu])).toEqual([
      { id: "home", text: "home", pack: null },
      { id: "FeSyncFeishu", text: "feishu SyncFeishu FeSyncFeishu", pack: "feishu" },
      { id: "FeFetchFeishu", text: "feishu FetchFeishu FeFetchFeishu", pack: "feishu" },
    ]);
  });

  it("excludes the lucide-icons pack (Obsidian already provides Lucide)", () => {
    expect(iconChoices([], [lucide, feishu]).map((c) => c.pack)).toEqual(["feishu", "feishu"]);
  });
});

describe("brand icon", () => {
  it("is addIcon-ready: scaled to the 100-viewBox grid, no <svg> root", () => {
    expect(BRAND_ICON_ID).toBe("ribbon-organizer");
    expect(BRAND_ICON_SVG).toContain('transform="scale(4.1667)"');
    expect(BRAND_ICON_SVG).not.toContain("<svg");
  });
});
