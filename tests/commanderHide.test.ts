import { describe, expect, it } from "vitest";
import { cmdrHideStyleText, withTitle } from "../src/core/commanderHide";

describe("cmdrHideStyleText", () => {
  it("emits Commander's exact ribbon rule per title, in list order", () => {
    expect(cmdrHideStyleText({ leftRibbon: ["Open graph view", "BRAT"], statusbar: [] })).toBe(
      'div.side-dock-ribbon-action[aria-label="Open graph view"] {display: none !important; content-visibility: hidden;}' +
        'div.side-dock-ribbon-action[aria-label="BRAT"] {display: none !important; content-visibility: hidden;}'
    );
  });

  it("appends statusbar rules after ribbon rules, verbatim", () => {
    expect(cmdrHideStyleText({ leftRibbon: ["A"], statusbar: ["word-count"] })).toBe(
      'div.side-dock-ribbon-action[aria-label="A"] {display: none !important; content-visibility: hidden;}' +
        "div.status-bar-item.plugin-word-count {display: none !important; content-visibility: hidden;}"
    );
  });

  it("returns the empty string for empty lists", () => {
    expect(cmdrHideStyleText({ leftRibbon: [], statusbar: [] })).toBe("");
  });
});

describe("withTitle", () => {
  it("adds a title once, even when already present", () => {
    expect(withTitle(["A"], "B", true)).toEqual(["A", "B"]);
    expect(withTitle(["A", "B"], "B", true)).toEqual(["A", "B"]);
  });

  it("removes every occurrence", () => {
    expect(withTitle(["A", "B", "A"], "A", false)).toEqual(["B"]);
  });

  it("never mutates its input", () => {
    const input = ["A"];
    withTitle(input, "B", true);
    withTitle(input, "A", false);
    expect(input).toEqual(["A"]);
  });
});
