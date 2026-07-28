// Per-item status bar text rewriting: template rules and the learned "seen states" list.
// Everything here is pure; the DOM-facing engine lives in main.ts.

export interface StatusBarRule {
  find: string;    // template: literal text with {name} placeholders for the changing parts
  replace: string; // output: placeholders carry the captured text over
}

const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

// Compiles a find template: literal segments match exactly (regex specials escaped), each
// {name} becomes a lazy capture group; anchored to the whole text. Returns null for
// malformed templates (unbalanced braces, empty or duplicate names) — a malformed rule
// never matches, keeping rewriting fail-open.
function compileFind(find: string): { re: RegExp; names: string[] } | null {
  const names: string[] = [];
  let pattern = "^";
  let rest = find;
  while (rest !== "") {
    const open = rest.indexOf("{");
    if (open === -1) {
      pattern += rest.replace(REGEX_SPECIALS, "\\$&");
      break;
    }
    const close = rest.indexOf("}", open + 1);
    if (close === -1) return null; // unbalanced
    const name = rest.slice(open + 1, close).trim();
    if (name === "" || names.includes(name)) return null;
    names.push(name);
    pattern += rest.slice(0, open).replace(REGEX_SPECIALS, "\\$&") + "([\\s\\S]+?)";
    rest = rest.slice(close + 1);
  }
  return { re: new RegExp(pattern + "$"), names };
}

// First matching rule wins; unmatched text returns unchanged — a rule set can shorten,
// never blank. Empty finds (mid-edit draft rows) never match.
export function applyStatusBarRules(text: string, rules: StatusBarRule[]): string {
  for (const rule of rules) {
    if (rule.find === "") continue;
    const compiled = compileFind(rule.find);
    if (compiled === null) continue;
    const match = compiled.re.exec(text);
    if (match === null) continue;
    // Single left-to-right pass over the replacement: captured values are inserted verbatim
    // and never re-scanned, so a capture that happens to contain another placeholder's
    // literal token cannot be substituted a second time.
    let out = "";
    let rest = rule.replace;
    while (rest !== "") {
      const open = rest.indexOf("{");
      if (open === -1) {
        out += rest;
        break;
      }
      const close = rest.indexOf("}", open + 1);
      if (close === -1) {
        out += rest;
        break;
      }
      const name = rest.slice(open + 1, close).trim();
      const nameIndex = compiled.names.indexOf(name);
      out += rest.slice(0, open);
      out += nameIndex === -1 ? rest.slice(open, close + 1) : (match[nameIndex + 1] ?? "");
      rest = rest.slice(close + 1);
    }
    return out;
  }
  return text;
}

export const SEEN_CAP = 8;

// Whitespace-collapsed, deduped (re-seen values move to the end), capped from the front.
export function pushSeen(list: string[], text: string, cap: number): string[] {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed === "") return list;
  const out = [...list.filter((s) => s !== collapsed), collapsed];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

// data.json repair (hand-editable): non-objects become {}, malformed members are dropped.
export function normalizeStatusBarModes(raw: unknown): Record<string, "compact" | "icon"> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, "compact" | "icon"> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && (value === "compact" || value === "icon")) out[key] = value;
  }
  return out;
}

// Empty-find entries are KEPT: they never match (see applyStatusBarRules), and dropping
// them would delete a mid-edit rule row on reload.
export function normalizeStatusBarRules(raw: unknown): Record<string, StatusBarRule[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, StatusBarRule[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    const rules: StatusBarRule[] = [];
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const entryObj = entry as Record<string, unknown>;
      const find = entryObj.find;
      const replace = entryObj.replace;
      if (typeof find === "string" && typeof replace === "string") rules.push({ find, replace });
    }
    if (rules.length > 0) out[key] = rules;
  }
  return out;
}

export function normalizeStatusBarSeen(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    let list: string[] = [];
    for (const entry of value) {
      if (typeof entry === "string") list = pushSeen(list, entry, SEEN_CAP);
    }
    if (list.length > 0) out[key] = list;
  }
  return out;
}
