export const UNGROUPED_ID = "ungrouped";

// A named, ordered set of ribbon icons. The sentinel group (UNGROUPED_ID) also lives in the
// settings array — its position sets where unclaimed icons render — but its `items` stays
// empty: membership is derived at layout time as "every live icon no other group claims".
export interface RibbonGroup {
  id: string;      // stable internal id (crypto.randomUUID() at creation); UNGROUPED_ID reserved
  name: string;    // settings-only display name; fixed for the sentinel
  items: string[]; // ribbon item ids ("pluginId:title"); order = order within the group
}

export interface LiveRibbonItem {
  id: string;
  hidden: boolean; // Obsidian's native right-click hide
}

export interface RibbonLayout {
  orders: Map<string, number>; // item id -> flex order (every live id gets one)
  dividerOrders: number[];     // flex order values for divider elements
}

export function defaultGroups(): RibbonGroup[] {
  return [{ id: UNGROUPED_ID, name: "Ungrouped", items: [] }];
}

// Repairs a stored `groups` value (data.json is hand-editable): drops malformed entries and
// duplicate group ids, deduplicates item claims (first group wins), forces the sentinel's
// fixed name and empty items, and guarantees exactly one sentinel (appended when missing).
export function normalizeGroups(raw: unknown): RibbonGroup[] {
  if (!Array.isArray(raw)) return defaultGroups();
  const claimed = new Set<string>();
  const out: RibbonGroup[] = [];
  let hasSentinel = false;
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name, items } = entry as { id?: unknown; name?: unknown; items?: unknown };
    if (typeof id !== "string" || typeof name !== "string" || !Array.isArray(items)) continue;
    if (out.some((o) => o.id === id)) continue;
    if (id === UNGROUPED_ID) {
      hasSentinel = true;
      out.push({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
      continue;
    }
    const cleanItems = items.filter((i): i is string => typeof i === "string" && !claimed.has(i));
    for (const i of cleanItems) claimed.add(i);
    out.push({ id, name, items: cleanItems });
  }
  if (!hasSentinel) out.push({ id: UNGROUPED_ID, name: "Ungrouped", items: [] });
  return out;
}

// Walks the groups in order, assigning strictly increasing flex-order numbers to every live
// member (sentinel members = unclaimed live icons in live order; configured-but-absent ids are
// skipped). A divider order is emitted between each pair of ADJACENT NON-EMPTY groups, where
// non-empty means "has at least one live, not natively hidden member" — hidden items still get
// an order value (harmless) but never make a group visible.
export function computeRibbonLayout(groups: RibbonGroup[], live: LiveRibbonItem[]): RibbonLayout {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  const liveById = new Map(live.map((i) => [i.id, i]));
  const orders = new Map<string, number>();
  const dividerOrders: number[] = [];
  let next = 1;
  let anyVisibleBefore = false;
  for (const group of groups) {
    const memberIds =
      group.id === UNGROUPED_ID
        ? live.filter((i) => !claimed.has(i.id)).map((i) => i.id)
        : group.items.filter((id) => liveById.has(id));
    const visible = memberIds.some((id) => liveById.get(id)?.hidden === false);
    if (visible && anyVisibleBefore) dividerOrders.push(next++);
    for (const id of memberIds) orders.set(id, next++);
    if (visible) anyVisibleBefore = true;
  }
  return { orders, dividerOrders };
}

export type MenuRow = { kind: "item"; id: string } | { kind: "separator" };

// The phone navbar ribbon menu counterpart of computeRibbonLayout: same walk, but emitting the
// visible member ids as an ordered row list with a separator between adjacent non-empty groups.
// Hidden items are omitted entirely — the phone menu never renders them.
export function computeMenuRows(groups: RibbonGroup[], live: LiveRibbonItem[]): MenuRow[] {
  const claimed = new Set<string>(groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
  const liveById = new Map(live.map((i) => [i.id, i]));
  const rows: MenuRow[] = [];
  let anyVisibleBefore = false;
  for (const group of groups) {
    const memberIds =
      group.id === UNGROUPED_ID
        ? live.filter((i) => !claimed.has(i.id)).map((i) => i.id)
        : group.items.filter((id) => liveById.has(id));
    const visibleIds = memberIds.filter((id) => liveById.get(id)?.hidden === false);
    if (visibleIds.length === 0) continue;
    if (anyVisibleBefore) rows.push({ kind: "separator" });
    for (const id of visibleIds) rows.push({ kind: "item", id });
    anyVisibleBefore = true;
  }
  return rows;
}

function requireGroupIndex(groups: RibbonGroup[], groupId: string): number {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx === -1) throw new Error(`Ribbon Organizer: unknown group id "${groupId}"`);
  return idx;
}

export function addGroup(groups: RibbonGroup[], id: string, name: string): RibbonGroup[] {
  if (groups.some((g) => g.id === id)) throw new Error(`Ribbon Organizer: duplicate group id "${id}"`);
  return [...groups, { id, name, items: [] }];
}

export function renameGroup(groups: RibbonGroup[], groupId: string, name: string): RibbonGroup[] {
  if (groupId === UNGROUPED_ID) throw new Error("Ribbon Organizer: the ungrouped bucket cannot be renamed");
  requireGroupIndex(groups, groupId);
  return groups.map((g) => (g.id === groupId ? { ...g, name } : g));
}

// Members of the deleted group become unclaimed, i.e. they fall to the ungrouped bucket.
export function deleteGroup(groups: RibbonGroup[], groupId: string): RibbonGroup[] {
  if (groupId === UNGROUPED_ID) throw new Error("Ribbon Organizer: the ungrouped bucket cannot be deleted");
  requireGroupIndex(groups, groupId);
  return groups.filter((g) => g.id !== groupId);
}

// toIndex addresses the array AFTER the group is removed (standard drag-drop semantics).
export function moveGroup(groups: RibbonGroup[], groupId: string, toIndex: number): RibbonGroup[] {
  const from = requireGroupIndex(groups, groupId);
  const out = [...groups];
  const [moved] = out.splice(from, 1);
  if (moved === undefined) return groups; // unreachable after requireGroupIndex
  out.splice(Math.max(0, Math.min(toIndex, out.length)), 0, moved);
  return out;
}

// Removes itemId from every group, then inserts it into the target's items at `index`
// (counted after the removal; appends when omitted). Target UNGROUPED_ID only removes the
// claim — ungrouped membership is derived, its items stay empty.
export function moveItemToGroup(groups: RibbonGroup[], itemId: string, targetGroupId: string, index?: number): RibbonGroup[] {
  requireGroupIndex(groups, targetGroupId);
  return groups.map((g) => {
    const items = g.items.filter((i) => i !== itemId);
    if (g.id !== targetGroupId || g.id === UNGROUPED_ID) {
      return items.length === g.items.length ? g : { ...g, items };
    }
    const at = Math.max(0, Math.min(index ?? items.length, items.length));
    return { ...g, items: [...items.slice(0, at), itemId, ...items.slice(at)] };
  });
}
