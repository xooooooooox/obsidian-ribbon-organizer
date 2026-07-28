const GENERIC_CLASSES = new Set(["status-bar-item", "mod-clickable"]);

// Identity key for one status bar item, derived from its DOM class list. There is no
// registry like leftRibbon.items (app.statusBar is just { app, containerEl }), so classes
// are the only stable handle. A `plugin-<id>` class wins and every other class is ignored
// (state classes like `is-clean` churn at runtime and must never move an item's identity);
// otherwise the remaining non-generic classes, sorted and joined with "+", identify
// core/injected items (observed: "cmdr+cmdr-adder", "left-region").
export function statusBarItemKey(classes: string[]): string {
  const pluginClass = classes.find((c) => c.startsWith("plugin-"));
  if (pluginClass !== undefined) return pluginClass.slice("plugin-".length);
  const rest = classes.filter((c) => !GENERIC_CLASSES.has(c)).sort();
  return rest.length === 0 ? "item" : rest.join("+");
}

// Ids for the live items in DOM order: key + "#" + 0-based occurrence among same-key items.
// Accepted limitation (spec): a plugin creating multiple items in unstable order can swap
// its own items' slots — the index is the only cross-session handle available.
export function deriveStatusBarIds(classLists: string[][]): string[] {
  const seen = new Map<string, number>();
  return classLists.map((classes) => {
    const key = statusBarItemKey(classes);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return `${key}#${String(n)}`;
  });
}

// CSS class names cannot contain "#", so the last "#" always separates key from index.
export function splitStatusBarId(id: string): { key: string; index: number } {
  const at = id.lastIndexOf("#");
  if (at === -1) return { key: id, index: 0 };
  const index = Number(id.slice(at + 1));
  return { key: id.slice(0, at), index: Number.isInteger(index) && index >= 0 ? index : 0 };
}

// Flex order per live id: stored ids first (ids absent from live are skipped — the CALLER
// keeps them in the stored array), then live ids missing from stored, in live order.
export function computeStatusBarOrder(stored: string[], live: string[]): Map<string, number> {
  const liveSet = new Set(live);
  const orders = new Map<string, number>();
  let next = 1;
  for (const id of stored) {
    if (liveSet.has(id) && !orders.has(id)) orders.set(id, next++);
  }
  for (const id of live) {
    if (!orders.has(id)) orders.set(id, next++);
  }
  return orders;
}

// Settings-list row sequence: the stored order with absent ids kept in place (they render
// as "Not on this device" and must survive a drag on another device), then new live ids.
// Persisting a drag writes this sequence back verbatim.
export function statusBarRowIds(stored: string[], live: string[]): string[] {
  const storedSet = new Set(stored);
  return [...stored, ...live.filter((id) => !storedSet.has(id))];
}

// Repairs a stored statusBarOrder (data.json is hand-editable): non-array becomes [],
// non-strings and duplicates are dropped (first wins).
export function normalizeStatusBarOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && !out.includes(entry)) out.push(entry);
  }
  return out;
}

// Display name when no plugin manifest matches the key (core items, injected elements):
// the most specific (longest) class of a joined key, dashes to spaces, capitalized.
export function fallbackItemName(key: string): string {
  const longest = key.split("+").reduce((a, b) => (b.length > a.length ? b : a), "");
  const words = longest.replace(/-/g, " ").trim();
  return words === "" ? "Item" : words.charAt(0).toUpperCase() + words.slice(1);
}
