import { QuickEntry, QuickMenu } from "./types";

// The quick-menus model: validation of persisted data (defensive read of our own data.json —
// malformed menus/entries are dropped, missing ids filled, duplicate names suffixed) and the
// pre-0.4.0 migration (a single flat `quickCommands` list becomes the first menu). Obsidian-free.

export function defaultMenus(): QuickMenu[] {
  return [{ id: crypto.randomUUID(), name: "Ribbon Organizer", icon: "menu", entries: [] }];
}

// First free name among `taken`: base, then "base 2", "base 3", …
export function uniqueMenuName(base: string, taken: string[]): string {
  const set = new Set(taken);
  let name = base;
  for (let n = 2; set.has(name); n++) name = `${base} ${n}`;
  return name;
}

export function normalizeMenus(menusRaw: unknown, legacyQuickCommands: unknown): QuickMenu[] {
  if (Array.isArray(menusRaw)) {
    const out: QuickMenu[] = [];
    const taken: string[] = [];
    for (const raw of menusRaw) {
      if (typeof raw !== "object" || raw === null) continue;
      const m = raw as { id?: unknown; name?: unknown; icon?: unknown; entries?: unknown };
      if (typeof m.name !== "string" || m.name.trim() === "" || typeof m.icon !== "string") continue;
      const name = uniqueMenuName(m.name, taken);
      taken.push(name);
      out.push({
        id: typeof m.id === "string" && m.id !== "" ? m.id : crypto.randomUUID(),
        name,
        icon: m.icon,
        entries: normalizeEntries(m.entries),
      });
    }
    return out;
  }
  if (Array.isArray(legacyQuickCommands)) {
    return [{ id: crypto.randomUUID(), name: "Ribbon Organizer", icon: "menu", entries: normalizeEntries(legacyQuickCommands) }];
  }
  return defaultMenus();
}

function normalizeEntries(raw: unknown): QuickEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: QuickEntry[] = [];
  for (const e of raw) {
    if (typeof e !== "object" || e === null) continue;
    const c = e as { kind?: unknown; commandId?: unknown; label?: unknown; icon?: unknown };
    if (c.kind === "separator") {
      out.push({ kind: "separator" });
      continue;
    }
    if (typeof c.commandId === "string" && typeof c.label === "string" && typeof c.icon === "string") {
      out.push({ commandId: c.commandId, label: c.label, icon: c.icon });
    }
  }
  return out;
}
