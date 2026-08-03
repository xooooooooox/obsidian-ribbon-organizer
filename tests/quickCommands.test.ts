import { describe, expect, it } from "vitest";
import { commandOwnerId, presentQuickMenuEntries, quickMenuEntries } from "../src/core/quickCommands";
import type { QuickMenuEntry } from "../src/core/quickCommands";

const reg = (ids: string[]) => (id: string): boolean => ids.includes(id);

describe("quickMenuEntries", () => {
  it("maps commands, setting disabled from registration", () => {
    const out = quickMenuEntries(
      [{ commandId: "a:x", label: "X", icon: "cloud" }, { commandId: "b:y", label: "Y", icon: "star" }],
      reg(["a:x"])
    );
    expect(out).toEqual([
      { kind: "command", commandId: "a:x", label: "X", icon: "cloud", disabled: false },
      { kind: "command", commandId: "b:y", label: "Y", icon: "star", disabled: true },
    ]);
  });

  it("keeps a separator between two commands", () => {
    const out = quickMenuEntries(
      [{ commandId: "a:x", label: "X", icon: "i" }, { kind: "separator" }, { commandId: "b:y", label: "Y", icon: "i" }],
      reg(["a:x", "b:y"])
    );
    expect(out.map((e) => e.kind)).toEqual(["command", "separator", "command"]);
  });

  it("drops leading, trailing and consecutive separators", () => {
    const out = quickMenuEntries(
      [
        { kind: "separator" },
        { commandId: "a:x", label: "X", icon: "i" },
        { kind: "separator" },
        { kind: "separator" },
        { commandId: "b:y", label: "Y", icon: "i" },
        { kind: "separator" },
      ],
      reg(["a:x", "b:y"])
    );
    expect(out.map((e) => e.kind)).toEqual(["command", "separator", "command"]);
  });

  it("returns [] when there is no command", () => {
    expect(quickMenuEntries([{ kind: "separator" }], reg([]))).toEqual([]);
    expect(quickMenuEntries([], reg([]))).toEqual([]);
  });

  it("keeps all-missing commands as disabled entries (not an empty list)", () => {
    const out = quickMenuEntries(
      [{ commandId: "a:x", label: "X", icon: "i" }, { commandId: "b:y", label: "Y", icon: "i" }],
      reg([])
    );
    expect(out.map((e) => e.kind === "command" && e.disabled)).toEqual([true, true]);
  });
});

const cmd = (id: string, disabled: boolean): QuickMenuEntry => ({ kind: "command", commandId: id, label: id, icon: "i", disabled });
const sep: QuickMenuEntry = { kind: "separator" };

describe("presentQuickMenuEntries", () => {
  it("drops disabled commands and keeps available ones", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), cmd("b:y", false)])).toEqual([cmd("b:y", false)]);
  });

  it("drops a separator orphaned at the head", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), sep, cmd("b:y", false)])).toEqual([cmd("b:y", false)]);
  });

  it("collapses separators left adjacent by a removal", () => {
    expect(
      presentQuickMenuEntries([cmd("a:x", false), sep, cmd("b:y", true), sep, cmd("c:z", false)])
    ).toEqual([cmd("a:x", false), sep, cmd("c:z", false)]);
  });

  it("returns [] when every command is disabled", () => {
    expect(presentQuickMenuEntries([cmd("a:x", true), sep, cmd("b:y", true)])).toEqual([]);
  });

  it("returns an all-available list unchanged", () => {
    const list = [cmd("a:x", false), sep, cmd("b:y", false)];
    expect(presentQuickMenuEntries(list)).toEqual(list);
  });
});

describe("commandOwnerId", () => {
  it("returns the prefix before the first colon", () => {
    expect(commandOwnerId("remotely-save:start-sync")).toBe("remotely-save");
    expect(commandOwnerId("editor:toggle-bold")).toBe("editor");
  });

  it("keeps only the first segment when the rest contains colons", () => {
    expect(commandOwnerId("a:b:c")).toBe("a");
  });

  it("returns the whole id when there is no colon", () => {
    expect(commandOwnerId("standalone")).toBe("standalone");
  });
});
