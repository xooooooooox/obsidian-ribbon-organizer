import { QuickEntry, isSeparator } from "./types";

export type QuickMenuEntry =
  | { kind: "separator" }
  | { kind: "command"; commandId: string; label: string; icon: string; disabled: boolean };

// A command id's owner prefix (the part before the first ":"): the owning plugin's id for
// plugin commands, a core namespace ("editor", "workspace", "app", …) otherwise. An id
// without a colon is its own owner.
export function commandOwnerId(commandId: string): string {
  return commandId.split(":")[0] ?? commandId;
}

// Maps configured quick entries to ribbon-menu entries: commands carry a `disabled` flag when not
// registered on this device; separators are normalized (no leading/trailing/consecutive dividers,
// and the whole list collapses to [] when it holds no command). Obsidian-free.
export function quickMenuEntries(
  entries: QuickEntry[],
  isRegistered: (commandId: string) => boolean
): QuickMenuEntry[] {
  const mapped: QuickMenuEntry[] = entries.map((e) =>
    isSeparator(e)
      ? { kind: "separator" }
      : { kind: "command", commandId: e.commandId, label: e.label, icon: e.icon, disabled: !isRegistered(e.commandId) }
  );
  return normalizeSeparators(mapped);
}

// Shared separator discipline: no leading/trailing/consecutive dividers, and a list
// holding no command collapses to [].
function normalizeSeparators(list: QuickMenuEntry[]): QuickMenuEntry[] {
  const out: QuickMenuEntry[] = [];
  for (const e of list) {
    if (e.kind === "separator") {
      const last = out[out.length - 1];
      if (last === undefined) continue; // no leading separator
      if (last.kind === "separator") continue; // collapse consecutive
    }
    out.push(e);
  }
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === undefined || last.kind !== "separator") break;
    out.pop(); // no trailing separator
  }
  return out.some((e) => e.kind === "command") ? out : [];
}

// What the ribbon popup actually shows: commands missing on this device are dropped
// (settings keeps their greyed rows), and separators orphaned by the removal re-normalize.
export function presentQuickMenuEntries(entries: QuickMenuEntry[]): QuickMenuEntry[] {
  return normalizeSeparators(entries.filter((e) => e.kind === "separator" || !e.disabled));
}
