import { addIcon, App, Menu, Notice, Platform, Plugin } from "obsidian";
import { CmdrHideLists, cmdrHideStyleText, withTitle } from "./core/commanderHide";
import { BRAND_ICON_ID, BRAND_ICON_SVG } from "./core/icons";
import { presentQuickMenuEntries, quickMenuEntries } from "./core/quickCommands";
import { defaultMenus, normalizeMenus } from "./core/quickMenus";
import { RibbonGroup, UNGROUPED_ID, computeMenuRows, computeRibbonLayout, defaultGroups, normalizeGroups, normalizeMoreIcon, normalizeMoreTucked, pruneTucked } from "./core/ribbonGroups";
import { cmdrHiddenSiblings, computeStatusBarOrder, deriveStatusBarIds, normalizeStatusBarOrder, splitStatusBarId } from "./core/statusBarItems";
import { SEEN_CAP, StatusBarRule, applyStatusBarRules, normalizeStatusBarModes, normalizeStatusBarRules, normalizeStatusBarSeen, pushSeen } from "./core/statusBarRules";
import { QuickMenu } from "./core/types";
import { renderIcon } from "./ui/iconRender";
import { RibbonOrganizerSettingTab } from "./ui/SettingTab";

const SEEN_STORAGE_KEY = "ribbon-organizer-status-bar-seen";

interface RibbonOrganizerSettings {
  menus: QuickMenu[];             // user-defined ribbon menus: one composite ribbon icon each
  groups: RibbonGroup[];          // top-to-bottom ribbon group order (includes the ungrouped sentinel)
  moreTucked: string[];           // ribbon item ids tucked into the more menu (Ungrouped members only; a group claim un-tucks)
  moreIcon: string;               // icon id for the more button; "ellipsis" until customized
  statusBarOrder: string[];       // status bar item ids, left-to-right; [] = never reordered, bar stays native
  statusBarHidden: string[];      // item ids hidden by this plugin's own layer (Commander's plugin-level hides merge in at read time)
  statusBarShowOnMobile: boolean; // floating pill on phones/tablets (styles.css, body-class gated)
  statusBarModes: Record<string, "compact" | "icon">; // absent id = Full (not stored)
  statusBarRules: Record<string, StatusBarRule[]>;    // per-item text rewrite templates
}

// A live left-ribbon icon as exposed to the settings UI.
export interface RibbonSnapshotItem {
  id: string;    // registration id: "pluginId:title"
  title: string;
  icon: string;
  hidden: boolean;
}

// A live status bar item as exposed to the settings UI.
export interface StatusBarSnapshotItem {
  id: string;
  text: string;                      // RAW plugin text (pre-rewrite, collapsed) — seen learning and rule authoring use this
  textDisplayed: string;             // what the bar currently shows (post-rewrite); === text when no rule matched
  pinned: boolean;                   // positions itself via its own CSS order; ordering leaves it alone
  hidden: boolean;                   // effective: own hidden list OR Commander's plugin-level hide
  shown: boolean;                    // actually painted: offsetWidth > 0, display ≠ none, opacity ≠ 0
  mode: "full" | "compact" | "icon"; // resolved display mode
  ruleCount: number;                 // rewrite rules configured for this id
  hasText: boolean;                  // text now, or rules/seen entries exist (wand eligibility)
}

interface RibbonInternalItem {
  id: string;
  title: string;
  icon: string;
  hidden: boolean;
  buttonEl: HTMLElement | null; // null = registered but unmounted (owner plugin currently disabled)
}

interface RibbonInternals {
  items: RibbonInternalItem[];
  ribbonItemsEl: HTMLElement;
}

// Undocumented internals: leftRibbon.items entries carry the registration id, the button
// element, and the native-hide flag; ribbonItemsEl is the .side-dock-actions flex-column
// container (flex `order` therefore fully controls visual sequence). Shape is validated at
// runtime — null means "these internals changed; do not touch the ribbon".
function ribbonInternals(app: App): RibbonInternals | null {
  const ribbon = (app.workspace as unknown as { leftRibbon?: { items?: unknown; ribbonItemsEl?: unknown } }).leftRibbon;
  if (ribbon === undefined || !Array.isArray(ribbon.items) || !(ribbon.ribbonItemsEl instanceof HTMLElement)) return null;
  const items: RibbonInternalItem[] = [];
  for (const raw of ribbon.items) {
    const it = raw as { id?: unknown; title?: unknown; icon?: unknown; hidden?: unknown; buttonEl?: unknown };
    if (typeof it.id !== "string") return null;
    // Obsidian's removeRibbonAction (plugin unload) deletes buttonEl but KEEPS the entry so its
    // hidden/order state survives a re-enable — an entry without buttonEl is a normal state
    // (Obsidian's own ribbon context menu skips such entries), not a shape change. Only a
    // buttonEl that is present but not an element means the internals really moved.
    const buttonEl = it.buttonEl ?? null;
    if (buttonEl !== null && !(buttonEl instanceof HTMLElement)) return null;
    items.push({
      id: it.id,
      title: typeof it.title === "string" ? it.title : it.id,
      icon: typeof it.icon === "string" ? it.icon : "",
      hidden: it.hidden === true,
      buttonEl,
    });
  }
  return { items, ribbonItemsEl: ribbon.ribbonItemsEl };
}

// Undocumented internal: app.statusBar carries only { app, containerEl } — there is no item
// registry, so identity is derived from each element's class list (see core/statusBarItems).
function statusBarContainer(app: App): HTMLElement | null {
  const bar = (app as unknown as { statusBar?: { containerEl?: unknown } }).statusBar;
  return bar !== undefined && bar !== null && bar.containerEl instanceof HTMLElement ? bar.containerEl : null;
}

interface CmdrPlugin {
  settings: { hide: CmdrHideLists };
  saveSettings: () => Promise<void>;
}

// Commander in three states: absent (not installed / disabled — app.plugins.plugins only
// holds enabled instances), ok (shape validated), broken (present but its settings changed shape).
type CmdrAccess = { state: "absent" } | { state: "ok"; plugin: CmdrPlugin } | { state: "broken" };

function cmdrAccess(app: App): CmdrAccess {
  const cmdr = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins?.["cmdr"];
  if (cmdr === undefined || cmdr === null) return { state: "absent" };
  const c = cmdr as { settings?: { hide?: { leftRibbon?: unknown; statusbar?: unknown } }; saveSettings?: unknown };
  if (!Array.isArray(c.settings?.hide?.leftRibbon) || !Array.isArray(c.settings?.hide?.statusbar) || typeof c.saveSettings !== "function") {
    return { state: "broken" };
  }
  return { state: "ok", plugin: cmdr as CmdrPlugin };
}

// Replaces Commander's injected stylesheet exactly the way Commander itself does
// (remove #cmdr, append only when the text is non-empty). The rebuild is TOTAL and assumes
// Commander's two hide surfaces (leftRibbon + statusbar); a future surface would be dropped
// until Commander's own next save.
function rebuildCmdrStyle(hide: CmdrHideLists): void {
  document.head.querySelector("style#cmdr")?.remove();
  const text = cmdrHideStyleText(hide);
  if (text !== "") document.head.appendChild(createEl("style", { attr: { id: "cmdr" }, text, type: "text/css" }));
}

export default class RibbonOrganizerPlugin extends Plugin {
  settings: RibbonOrganizerSettings = {
    menus: defaultMenus(),
    groups: defaultGroups(),
    moreTucked: normalizeMoreTucked(undefined),
    moreIcon: normalizeMoreIcon(undefined),
    statusBarOrder: [],
    statusBarHidden: [],
    statusBarShowOnMobile: false,
    statusBarModes: {},
    statusBarRules: {},
  };
  private menuIcons: { name: string; el: HTMLElement }[] = [];
  private ribbonObserver: MutationObserver | null = null;
  private groupingDisabled = false;
  private menuObserver: MutationObserver | null = null;
  private lastMenuOutcome = "not-run"; // surfaced by the diagnostics command
  private statusBarObserver: MutationObserver | null = null;
  private statusBarDisabled = false;
  private statusBarStylesApplied = false; // a write pass ran this session; an emptied config needs one clearing pass
  // One observer per rule-bearing or Compact live item, keyed by id; recreated when the element changes.
  private statusBarRuleObservers = new Map<string, { obs: MutationObserver; el: HTMLElement }>();
  // Per Text node: the raw value we transformed and the value we wrote. A node whose data
  // equals `written` is our own write (skip — kills observer loops and oscillating rules);
  // restore paths put `original` back while `written` still stands.
  private statusBarNodeMemo = new WeakMap<Text, { original: string; written: string; iconEl?: HTMLElement }>();
  // Per host element: the inline color found before the first rule text-tint (restored when
  // the tint lifts) and the tint value we last wrote (the skip-guard for redundant writes).
  private statusBarHostColor = new WeakMap<HTMLElement, { prior: string; written: string }>();
  private statusBarSeenTimer: number | null = null;
  // Learned raw status texts (cap 8, LRU newest-last). Device-local by definition ("seen on
  // this device") — stored via app.saveLocalStorage, never in data.json, which syncs across
  // machines and would churn on every relative-time status tick.
  statusBarSeen: Record<string, string[]> = {};

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(BRAND_ICON_ID, BRAND_ICON_SVG);
    this.syncRibbonMenus();
    this.applyMobileStatusBarClass();
    this.addSettingTab(new RibbonOrganizerSettingTab(this.app, this));
    this.addCommand({
      id: "copy-ribbon-diagnostics",
      name: "Copy ribbon diagnostics",
      callback: () => void this.copyDiagnostics(),
    });
    this.app.workspace.onLayoutReady(() => {
      this.applyGrouping();
      this.applyStatusBarOrder();
      this.observeMenus();
    });
  }

  onunload(): void {
    this.ribbonObserver?.disconnect();
    this.ribbonObserver = null;
    this.menuObserver?.disconnect();
    this.menuObserver = null;
    this.statusBarObserver?.disconnect();
    this.statusBarObserver = null;
    document.body.removeClass("ribbon-organizer-mobile-sb");
    if (this.statusBarSeenTimer !== null) {
      window.clearTimeout(this.statusBarSeenTimer);
      this.statusBarSeenTimer = null;
      this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
    }
    for (const { obs, el } of this.statusBarRuleObservers.values()) {
      obs.disconnect();
      this.restoreStatusBarText(el);
    }
    this.statusBarRuleObservers.clear();
    const sbContainer = statusBarContainer(this.app);
    if (sbContainer !== null) {
      for (const el of Array.from(sbContainer.children)) {
        if (el.instanceOf(HTMLElement) && el.classList.contains("status-bar-item")) {
          el.setCssStyles({ order: "", display: "", maxWidth: "", overflow: "", textOverflow: "", whiteSpace: "" });
          el.removeClass("ribbon-organizer-sb-icononly");
          el.removeAttribute("title");
        }
      }
    }
    const internals = ribbonInternals(this.app);
    if (internals === null) return;
    for (const item of internals.items) {
      item.buttonEl?.setCssStyles({ order: "" });
      // Our stylesheet dies with the plugin, but the classes must not linger on foreign elements.
      item.buttonEl?.removeClass("ribbon-organizer-cmdr-hidden");
      item.buttonEl?.removeClass("ribbon-organizer-tucked");
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider, :scope > .ribbon-organizer-more"))) el.remove();
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as {
      menus?: unknown;
      quickCommands?: unknown;
      groups?: unknown;
      moreTucked?: unknown;
      moreIcon?: unknown;
      statusBarOrder?: unknown;
      statusBarHidden?: unknown;
      statusBarShowOnMobile?: unknown;
      statusBarModes?: unknown;
      statusBarRules?: unknown;
      statusBarSeen?: unknown;
    };
    const groups = normalizeGroups(raw.groups ?? defaultGroups());
    this.settings = {
      menus: normalizeMenus(raw.menus, raw.quickCommands), // pre-0.4.0 quickCommands migrates to one menu
      groups,
      moreTucked: pruneTucked(groups, normalizeMoreTucked(raw.moreTucked)),
      moreIcon: normalizeMoreIcon(raw.moreIcon),
      statusBarOrder: normalizeStatusBarOrder(raw.statusBarOrder),
      statusBarHidden: normalizeStatusBarOrder(raw.statusBarHidden),
      statusBarShowOnMobile: raw.statusBarShowOnMobile === true,
      statusBarModes: normalizeStatusBarModes(raw.statusBarModes),
      statusBarRules: normalizeStatusBarRules(raw.statusBarRules),
    };
    this.statusBarSeen = normalizeStatusBarSeen(this.app.loadLocalStorage(SEEN_STORAGE_KEY));
    // One-time migration: pre-0.13 kept seen states in data.json. Move them to device
    // storage (entries already on this device win) and scrub the field with a single save.
    if (raw.statusBarSeen !== undefined) {
      const legacy = normalizeStatusBarSeen(raw.statusBarSeen);
      for (const [id, list] of Object.entries(legacy)) {
        if (this.statusBarSeen[id] === undefined) this.statusBarSeen[id] = list;
      }
      this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // Titles Commander currently hides; empty when Commander is absent or unreadable.
  private cmdrHiddenTitles(): Set<string> {
    const access = cmdrAccess(this.app);
    if (access.state !== "ok") return new Set();
    return new Set(access.plugin.settings.hide.leftRibbon.filter((t): t is string => typeof t === "string"));
  }

  // Plugin ids Commander hides on the status bar; empty when Commander is absent or unreadable.
  private cmdrHiddenStatusBarKeys(): Set<string> {
    const access = cmdrAccess(this.app);
    if (access.state !== "ok") return new Set();
    return new Set(access.plugin.settings.hide.statusbar.filter((t): t is string => typeof t === "string"));
  }

  // The settings UI's view of the live ribbon; null when the private internals changed shape.
  ribbonSnapshot(): RibbonSnapshotItem[] | null {
    const internals = ribbonInternals(this.app);
    if (internals === null) return null;
    const cmdrHidden = this.cmdrHiddenTitles();
    // hidden is the EFFECTIVE state: Obsidian's native flag OR Commander's title list. Unmounted
    // entries (owner plugin disabled) are not live icons — skipped, like Obsidian's own menus.
    return internals.items
      .filter((i) => i.buttonEl !== null)
      .map(({ id, title, icon, hidden }) => ({ id, title, icon, hidden: hidden || cmdrHidden.has(title) }));
  }

  // Live .status-bar-item elements in DOM order with their derived ids and pinned probe;
  // null (once per session, with a Notice) when app.statusBar no longer matches the shape.
  private liveStatusBarItems(): { id: string; el: HTMLElement; pinned: boolean }[] | null {
    if (this.statusBarDisabled) return null;
    const container = statusBarContainer(this.app);
    if (container === null) {
      this.statusBarDisabled = true;
      console.error("Ribbon Organizer: app.statusBar does not match the expected shape; status bar ordering is disabled for this session");
      new Notice("Ribbon and Status Bar Organizer: status bar tools don't work on this Obsidian version — the bar is left untouched. Check for a plugin update.");
      return null;
    }
    const els = Array.from(container.children).filter(
      (el): el is HTMLElement => el.instanceOf(HTMLElement) && el.classList.contains("status-bar-item")
    );
    const ids = deriveStatusBarIds(els.map((el) => Array.from(el.classList)));
    const out: { id: string; el: HTMLElement; pinned: boolean }[] = [];
    els.forEach((el, i) => {
      const id = ids[i];
      if (id === undefined) return;
      // Pinned probe: with the inline value cleared, a non-zero computed `order` means the
      // item's own CSS positions it (quick-explorer's order:-9999 spacer, order:9999 right-
      // pins). Clear + read + restore happen in one JS task — the browser never paints in
      // between, so callers that don't rewrite orders (snapshot) leave the bar untouched.
      const prev = el.style.order;
      el.setCssStyles({ order: "" });
      const pinned = getComputedStyle(el).order !== "0";
      if (prev !== "") el.setCssStyles({ order: prev });
      out.push({ id, el, pinned });
    });
    return out;
  }

  // The settings UI's view of the live status bar. hidden merges this plugin's own list
  // with Commander's plugin-level hide; text is RAW (pre-rewrite), textDisplayed is what
  // the bar shows. Rendering a snapshot also samples seen-learning (spec sample point).
  statusBarSnapshot(): StatusBarSnapshotItem[] | null {
    const live = this.liveStatusBarItems();
    if (live === null) return null;
    const ownHidden = new Set(this.settings.statusBarHidden);
    const cmdrKeys = this.cmdrHiddenStatusBarKeys();
    return live.map(({ id, el, pinned }) => {
      const raw = this.rawStatusBarText(el);
      // Learn per Text node (not the concatenated item text): rules match one node at a
      // time, so only per-node samples are guaranteed to be authorable as find templates.
      for (const node of this.textNodesOf(el)) {
        const memo = this.statusBarNodeMemo.get(node);
        this.learnStatusBarText(id, memo !== undefined && node.data === memo.written ? memo.original : node.data);
      }
      const rules = this.settings.statusBarRules[id] ?? [];
      const style = getComputedStyle(el);
      return {
        id,
        text: raw,
        textDisplayed: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
        pinned,
        hidden: ownHidden.has(id) || cmdrKeys.has(splitStatusBarId(id).key),
        shown: el.offsetWidth > 0 && style.display !== "none" && style.opacity !== "0",
        mode: this.settings.statusBarModes[id] ?? "full",
        ruleCount: rules.length,
        hasText: raw !== "" || rules.length > 0 || (this.statusBarSeen[id] ?? []).length > 0,
      };
    });
  }

  // Live elements by id — spotlight targets and strip-clone sources for the settings UI
  // (one DOM scan per settings render, not one per row).
  statusBarLiveElements(): Map<string, HTMLElement> {
    const live = this.liveStatusBarItems();
    return new Map((live ?? []).map((i) => [i.id, i.el]));
  }

  // Applies the stored order, this plugin's own hide layer, and display modes as inline
  // styles/classes, then syncs the rewrite observers. Strict no-op while every config source
  // is empty and nothing was applied this session; an emptied config gets ONE clearing pass.
  // statusBarSeen never activates the pass — learning must not change rendering. Pinned
  // items never receive an order (the 0.9.x left-region bug). Idempotent.
  applyStatusBarOrder(): void {
    const active =
      this.settings.statusBarOrder.length > 0 ||
      this.settings.statusBarHidden.length > 0 ||
      Object.keys(this.settings.statusBarModes).length > 0 ||
      Object.keys(this.settings.statusBarRules).length > 0;
    if (!active && !this.statusBarStylesApplied) return;
    const live = this.liveStatusBarItems();
    if (live === null) return;
    this.statusBarObserver?.disconnect();
    const pinned = new Set(live.filter((i) => i.pinned).map((i) => i.id));
    const writeOrders = this.settings.statusBarOrder.length > 0;
    const orders = computeStatusBarOrder(this.settings.statusBarOrder, live.map((i) => i.id), pinned);
    const hidden = new Set(this.settings.statusBarHidden);
    for (const { id, el } of live) {
      const order = writeOrders ? orders.get(id) : undefined;
      const mode = this.settings.statusBarModes[id];
      el.setCssStyles({
        order: order === undefined ? "" : String(order),
        display: "", // clears an inline hide left by pre-0.14.2 builds (items outlive our reload)
        maxWidth: mode === "compact" ? "12em" : "",
        overflow: mode === "compact" ? "hidden" : "",
        textOverflow: mode === "compact" ? "ellipsis" : "",
        whiteSpace: mode === "compact" ? "nowrap" : "",
      });
      // Hide via class, never inline display: item owners (core backlink/word count, git…)
      // rewrite their own inline display on every leaf change, which erased an inline hide
      // and this observer (childList only) never saw it. The class survives those writes.
      el.toggleClass("ribbon-organizer-sb-hidden", hidden.has(id));
      el.toggleClass("ribbon-organizer-sb-icononly", mode === "icon");
      if (mode !== "compact") el.removeAttribute("title");
      this.rewriteStatusBarItem(id, el); // rules + seen sampling + compact title, every apply
    }
    this.syncStatusBarRuleObservers(live);
    this.statusBarStylesApplied = active;
    const container = statusBarContainer(this.app);
    if (active && container !== null) this.observeStatusBar(container);
  }

  // Re-applies when items are added/removed (late-loading plugins, plugins rebuilding their
  // items). childList only, no subtree: the high-frequency text churn inside items (word
  // count, git status) never fires this. Disconnected while applying, like observeRibbon.
  private observeStatusBar(container: HTMLElement): void {
    if (this.statusBarObserver === null) {
      this.statusBarObserver = new MutationObserver(() => this.applyStatusBarOrder());
    }
    this.statusBarObserver.observe(container, { childList: true });
  }

  // The mobile pill styles in styles.css are gated on this body class; desktop never gets
  // it even when the synced setting is on.
  applyMobileStatusBarClass(): void {
    document.body.toggleClass("ribbon-organizer-mobile-sb", Platform.isMobile && this.settings.statusBarShowOnMobile);
  }

  // All Text nodes under a status bar item — rules touch these, never element structure.
  private textNodesOf(el: HTMLElement): Text[] {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const out: Text[] = [];
    let node = walker.nextNode();
    while (node !== null) {
      out.push(node as Text);
      node = walker.nextNode();
    }
    return out;
  }

  // The item's text as its plugin wrote it (memoized originals substituted for our rewrites).
  private rawStatusBarText(el: HTMLElement): string {
    let raw = "";
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      raw += memo !== undefined && node.data === memo.written ? memo.original : node.data;
    }
    return raw.replace(/\s+/g, " ").trim();
  }

  // Rewrites one item's Text nodes per its rules, feeds seen-learning with raw values, and
  // (Compact mode) keeps the hover title = raw text. A matched rule with an icon gets a
  // plugin-owned span immediately before the text node — the engine's only structural
  // touch; everything else stays text-node-scoped. Fail-open: unmatched nodes untouched.
  // A node whose rules stopped producing output is restored here in place (the observer
  // teardown only restores when an item loses ALL rules), so icon edits and rule deletions
  // take effect without an element rebuild. The first matched node's textColor also tints
  // the host element's text via syncHostTextColor, run once at the end of every pass.
  private rewriteStatusBarItem(id: string, el: HTMLElement): void {
    const rules = this.settings.statusBarRules[id] ?? [];
    let rawFull = "";
    let hostColor: string | null = null;
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      const prior = memo !== undefined && node.data === memo.written ? memo : undefined;
      if (memo !== undefined && prior === undefined) {
        // The plugin overwrote our rewrite in place: its text wins, and the icon span that
        // decorated the stale rewrite must not survive it (a fresh match re-creates one).
        memo.iconEl?.remove();
        this.statusBarNodeMemo.delete(node);
      }
      const raw = prior === undefined ? node.data : prior.original;
      rawFull += raw;
      if (prior === undefined) this.learnStatusBarText(id, raw);
      if (rules.length === 0) {
        // Rules emptied while our write still stands: restore here — a Compact item keeps
        // its observer (hover-title tracking), so the teardown restore never fires for it.
        if (prior !== undefined) {
          prior.iconEl?.remove();
          this.statusBarNodeMemo.delete(node);
          node.data = raw;
        }
        continue;
      }
      const out = applyStatusBarRules(raw, rules);
      if (out.text === raw && out.icon === null && out.iconColor === null && out.textColor === null) {
        if (prior !== undefined) {
          prior.iconEl?.remove();
          this.statusBarNodeMemo.delete(node);
          node.data = raw;
        }
        continue;
      }
      if (hostColor === null && out.textColor !== null) hostColor = out.textColor; // first node with a colored match wins
      const iconEl = this.syncRuleIconSpan(node, prior?.iconEl, out.icon, out.text === "", out.iconColor, out.textColor);
      if (iconEl === undefined) this.statusBarNodeMemo.set(node, { original: raw, written: out.text });
      else this.statusBarNodeMemo.set(node, { original: raw, written: out.text, iconEl });
      if (node.data !== out.text) node.data = out.text;
    }
    this.syncHostTextColor(el, hostColor);
    if (this.settings.statusBarModes[id] === "compact") el.title = rawFull.replace(/\s+/g, " ").trim();
  }

  // The plugin-owned icon span for one rewritten node: created (or moved back) to sit
  // immediately before the text node, re-rendered only when the icon id changes, removed
  // when the matched rule carries no icon. Solo (empty rewritten text) drops the text gap.
  private syncRuleIconSpan(
    node: Text,
    existing: HTMLElement | undefined,
    icon: string | null,
    solo: boolean,
    iconColor: string | null,
    textColor: string | null
  ): HTMLElement | undefined {
    if (icon === null) {
      existing?.remove();
      return undefined;
    }
    const span = existing !== undefined && existing.isConnected ? existing : createSpan({ cls: "ribbon-organizer-sb-ricon" });
    if (span.nextSibling !== node) node.before(span);
    if (span.getAttribute("data-ricon") !== icon) {
      renderIcon(span, icon, undefined, this.app);
      span.setAttribute("data-ricon", icon);
    }
    span.toggleClass("ribbon-organizer-sb-ricon-solo", solo);
    // Icon color: its own color wins; an uncolored icon under a text tint gets the bar's
    // own color back (--status-bar-text-color) so the host tint doesn't bleed into it.
    span.setCssStyles({ color: iconColor ?? (textColor !== null ? "var(--status-bar-text-color)" : "") });
    return span;
  }

  // Applies or restores the item-level text tint (rules color the whole item's text: text
  // nodes can't be styled directly, and wrapping them would break the text-nodes-only
  // invariant). Runs once per rewrite pass, so the no-match and rules-emptied paths
  // converge on restore without their own branches.
  private syncHostTextColor(el: HTMLElement, color: string | null): void {
    const memo = this.statusBarHostColor.get(el);
    if (color !== null) {
      // Skip-guard on the value WE wrote, not a style.color read-back: CSSOM serializes a
      // hex write into rgb(), so read-back never string-matches the rule's literal color.
      if (memo === undefined) {
        this.statusBarHostColor.set(el, { prior: el.style.color, written: color });
        el.setCssStyles({ color });
      } else if (memo.written !== color) {
        memo.written = color;
        el.setCssStyles({ color });
      }
      return;
    }
    if (memo !== undefined) {
      el.setCssStyles({ color: memo.prior });
      this.statusBarHostColor.delete(el);
    }
  }

  // Seen-state learning. Only a genuinely new value schedules a (debounced) flush, so
  // high-frequency status churn never write-storms device storage — and never touches
  // data.json at all.
  private learnStatusBarText(id: string, raw: string): void {
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (collapsed === "") return;
    const current = this.statusBarSeen[id] ?? [];
    const isNew = !current.includes(collapsed);
    this.statusBarSeen[id] = pushSeen(current, collapsed, SEEN_CAP);
    if (isNew && this.statusBarSeenTimer === null) {
      this.statusBarSeenTimer = window.setTimeout(() => {
        this.statusBarSeenTimer = null;
        this.app.saveLocalStorage(SEEN_STORAGE_KEY, this.statusBarSeen);
      }, 2000);
    }
  }

  // Best-effort undo of our rewrites on one element: nodes the plugin has since overwritten
  // keep the plugin's newer text (its next update wins anyway), but our icon spans and memo
  // entries are removed unconditionally — a span must never outlive the teardown that owns it.
  // The host text tint is restored too, so a removed or emptied rule set never leaves a stale color.
  private restoreStatusBarText(el: HTMLElement): void {
    for (const node of this.textNodesOf(el)) {
      const memo = this.statusBarNodeMemo.get(node);
      if (memo === undefined) continue;
      memo.iconEl?.remove();
      if (node.data === memo.written) node.data = memo.original;
      this.statusBarNodeMemo.delete(node);
    }
    this.syncHostTextColor(el, null);
  }

  // One observer per live item that needs text-churn tracking: rule-bearing items (rewrite
  // on every plugin update) and Compact items (hover title must stay = the raw text).
  // Recreated when the plugin rebuilt its element, disconnected (with text restored) when
  // neither reason remains or the item disappeared.
  private syncStatusBarRuleObservers(live: { id: string; el: HTMLElement }[]): void {
    const wanted = new Map(
      live
        .filter((i) => (this.settings.statusBarRules[i.id] ?? []).length > 0 || this.settings.statusBarModes[i.id] === "compact")
        .map((i) => [i.id, i.el])
    );
    for (const [id, entry] of Array.from(this.statusBarRuleObservers)) {
      if (wanted.get(id) !== entry.el) {
        entry.obs.disconnect();
        this.restoreStatusBarText(entry.el);
        this.statusBarRuleObservers.delete(id);
      }
    }
    for (const [id, el] of wanted) {
      if (this.statusBarRuleObservers.has(id)) continue;
      const obs = new MutationObserver(() => this.rewriteStatusBarItem(id, el));
      obs.observe(el, { characterData: true, childList: true, subtree: true });
      this.statusBarRuleObservers.set(id, { obs, el });
      this.rewriteStatusBarItem(id, el);
    }
  }

  // The eye's target: asymmetric two-layer hide. Hiding writes ONLY this plugin's own
  // per-item list (Commander's status bar hides are plugin-level and cannot express a single
  // item). Showing clears both layers; because clearing Commander's plugin-level rule would
  // reveal every item of that plugin, the plugin's other live items move to the own list
  // first so their state survives.
  async setStatusBarItemHidden(id: string, hidden: boolean): Promise<void> {
    const withoutId = this.settings.statusBarHidden.filter((h) => h !== id);
    if (hidden) {
      this.settings.statusBarHidden = [...withoutId, id];
    } else {
      this.settings.statusBarHidden = withoutId;
      const key = splitStatusBarId(id).key;
      const access = cmdrAccess(this.app);
      if (access.state === "ok" && access.plugin.settings.hide.statusbar.includes(key)) {
        const live = this.liveStatusBarItems() ?? [];
        const siblings = cmdrHiddenSiblings(key, live.map((i) => i.id), id).filter((s) => !this.settings.statusBarHidden.includes(s));
        this.settings.statusBarHidden = [...this.settings.statusBarHidden, ...siblings];
        access.plugin.settings.hide.statusbar = withTitle(access.plugin.settings.hide.statusbar, key, false);
        await access.plugin.saveSettings();
        rebuildCmdrStyle(access.plugin.settings.hide);
      } else if (access.state === "broken") {
        console.error("Ribbon Organizer: Commander settings do not match the expected shape; changed this plugin's own hide layer only");
        new Notice("Ribbon and Status Bar Organizer: couldn't update Commander — this item may stay hidden by Commander. Show it from Commander's settings.");
      }
    }
    await this.saveSettings();
    this.applyStatusBarOrder();
  }

  // Display mode per item: Full is the absence of an entry, so untouched items keep a
  // byte-for-byte native element.
  async setStatusBarItemMode(id: string, mode: "full" | "compact" | "icon"): Promise<void> {
    if (mode === "full") delete this.settings.statusBarModes[id];
    else this.settings.statusBarModes[id] = mode;
    await this.saveSettings();
    this.applyStatusBarOrder();
  }

  // Rewrite rules per item; an emptied list removes the entry, and the next apply pass
  // disconnects the item's observer and restores its text.
  async setStatusBarItemRules(id: string, rules: StatusBarRule[]): Promise<void> {
    if (rules.length === 0) delete this.settings.statusBarRules[id];
    else this.settings.statusBarRules[id] = rules;
    await this.saveSettings();
    this.applyStatusBarOrder();
  }

  // Applies the configured grouping to the desktop left ribbon: flex order per icon plus one
  // divider element between adjacent non-empty groups. Idempotent; safe to call repeatedly.
  applyGrouping(): void {
    if (this.groupingDisabled) return;
    const internals = ribbonInternals(this.app);
    if (internals === null) {
      this.groupingDisabled = true;
      console.error("Ribbon Organizer: app.workspace.leftRibbon does not match the expected shape; ribbon grouping is disabled for this session");
      new Notice("Ribbon and Status Bar Organizer: ribbon grouping doesn't work on this Obsidian version — the ribbon is left untouched. Check for a plugin update.");
      return;
    }
    // Disconnect while we write so our own DOM edits cannot re-trigger the observer.
    this.ribbonObserver?.disconnect();
    const cmdrHidden = this.cmdrHiddenTitles();
    const claimed = new Set(this.settings.groups.flatMap((g) => (g.id === UNGROUPED_ID ? [] : g.items)));
    const tucked = new Set(this.settings.moreTucked.filter((id) => !claimed.has(id)));
    // An unmounted entry has no element to order, so it counts as hidden for the layout: it
    // gets no divider slot and cannot make a group visible.
    const layout = computeRibbonLayout(
      this.settings.groups,
      internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title) || i.buttonEl === null, tucked: tucked.has(i.id) }))
    );
    for (const item of internals.items) {
      if (item.buttonEl === null) continue;
      const order = layout.orders.get(item.id);
      item.buttonEl.setCssStyles({ order: order === undefined ? "" : String(order) });
      // Element-anchored hide states: Commander's title-keyed CSS misses an icon whose plugin
      // temporarily rewrites its aria-label (remotely-save while syncing) — a class on the
      // element itself can't be pierced that way. Tucked icons leave the ribbon the same way.
      item.buttonEl.toggleClass("ribbon-organizer-cmdr-hidden", cmdrHidden.has(item.title));
      item.buttonEl.toggleClass("ribbon-organizer-tucked", tucked.has(item.id));
    }
    for (const el of Array.from(internals.ribbonItemsEl.querySelectorAll(":scope > .ribbon-organizer-divider, :scope > .ribbon-organizer-more"))) el.remove();
    for (const dividerOrder of layout.dividerOrders) {
      internals.ribbonItemsEl.createDiv({ cls: "ribbon-organizer-divider" }).setCssStyles({ order: String(dividerOrder) });
    }
    if (layout.moreOrder !== null) this.renderMoreButton(internals, tucked, cmdrHidden, layout.moreOrder);
    this.observeRibbon(internals.ribbonItemsEl);
  }

  // The more button is RO-owned ribbon chrome, like the dividers — never a registered ribbon
  // item (registering one would list the button inside our own settings). Rebuilt every pass;
  // the menu mirrors openMenu's DOM-mode + renderIcon pattern so iconize ids work.
  private renderMoreButton(internals: RibbonInternals, tucked: Set<string>, cmdrHidden: Set<string>, order: number): void {
    const entries = internals.items.filter((i) => tucked.has(i.id) && i.buttonEl !== null && !i.hidden && !cmdrHidden.has(i.title));
    if (entries.length === 0) return; // hidden wins: nothing to open means no button
    const btn = internals.ribbonItemsEl.createDiv({
      cls: "side-dock-ribbon-action ribbon-organizer-more",
      attr: { "aria-label": "More", "aria-label-position": "right" },
    });
    renderIcon(btn, this.settings.moreIcon, undefined, this.app);
    btn.setCssStyles({ order: String(order) });
    btn.addEventListener("click", () => {
      const menu = new Menu();
      menu.setUseNativeMenu(false);
      for (const item of entries) {
        menu.addItem((mi) => {
          mi.setTitle(item.title);
          mi.setIcon(item.icon); // forces the icon slot to exist; renderIcon then fixes iconize ids
          const iconEl = (mi as unknown as { iconEl?: HTMLElement }).iconEl;
          if (iconEl) renderIcon(iconEl, item.icon, undefined, this.app);
          mi.onClick(() => item.buttonEl?.click()); // a display-hidden element still dispatches clicks
        });
      }
      const rect = btn.getBoundingClientRect();
      menu.showAtPosition({ x: rect.right, y: rect.top });
    });
  }

  // One switch over both hide layers (spec 定稿 2026-07-23): hiding sets Obsidian's native flag
  // AND adds the title to Commander's list; showing clears both — a single still-set layer
  // would keep the icon hidden and make the toggle look broken. Commander absent → native only.
  async setIconHidden(itemId: string, hidden: boolean): Promise<void> {
    const ribbon = (this.app.workspace as unknown as { leftRibbon?: { items?: unknown; onChange?: unknown } }).leftRibbon;
    const items = ribbon !== undefined && Array.isArray(ribbon.items) ? (ribbon.items as { id?: unknown; title?: unknown; hidden?: unknown }[]) : null;
    const raw = items?.find((it) => it.id === itemId);
    if (raw === undefined) return; // icon no longer live; the stale row disappears on the next render
    if (typeof ribbon?.onChange === "function") {
      raw.hidden = hidden;
      // Native path (verified in the dev vault 2026-07-23): onChange toggles every buttonEl,
      // rebuilds the ribbon children (setChildrenInPlace drops our dividers) and persists via
      // requestSaveLayout — hence the applyGrouping right after.
      (ribbon.onChange as (persist: boolean) => void).call(ribbon, true);
      this.applyGrouping();
    } else {
      console.error("Ribbon Organizer: leftRibbon.onChange is missing; the native hide flag was not changed");
      new Notice("Ribbon and Status Bar Organizer: couldn't change this icon's visibility on this Obsidian version. Check for a plugin update.");
    }
    const title = typeof raw.title === "string" ? raw.title : itemId.slice(itemId.indexOf(":") + 1);
    const access = cmdrAccess(this.app);
    if (access.state === "absent") return;
    if (access.state === "broken") {
      console.error("Ribbon Organizer: Commander settings do not match the expected shape; changed the native hide only");
      new Notice("Ribbon and Status Bar Organizer: couldn't update Commander — the change applies in Obsidian, but Commander may still hide this icon.");
      return;
    }
    access.plugin.settings.hide.leftRibbon = withTitle(access.plugin.settings.hide.leftRibbon, title, hidden);
    await access.plugin.saveSettings();
    rebuildCmdrStyle(access.plugin.settings.hide);
  }

  // Phone surface: the navbar ≡ button rebuilds a standard Menu from leftRibbon.items on every
  // open (array order, natively hidden items skipped) and appends it directly to document.body.
  // Property-wrapping mobileNavbar.showRibbonMenu never intercepts real taps — the navbar's
  // click listener captured a bound reference at construction — so the menu is caught at DOM
  // insertion instead: Menu.showAtPosition adds has-active-menu to its parent element (the ≡
  // span) before appending, which identifies the ribbon menu among all menus. The callback runs
  // at the microtask checkpoint, pre-paint, so the reorder is invisible; it only mutates nodes
  // inside the menu element, never body's child list, so it cannot retrigger itself.
  private observeMenus(): void {
    if (!Platform.isMobile) return;
    this.menuObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node.instanceOf(HTMLElement) && node.classList.contains("menu") && this.isRibbonMenuTrigger()) {
            this.groupRibbonMenu(node);
          }
        }
      }
    });
    this.menuObserver.observe(document.body, { childList: true });
  }

  // True while the navbar ≡ button is the active menu's parent (covers tap, long-press, and the
  // long-press menu when mobileQuickRibbonItem is configured).
  private isRibbonMenuTrigger(): boolean {
    const navbar = (this.app as unknown as { mobileNavbar?: { ribbonMenuItemEl?: unknown } }).mobileNavbar;
    if (navbar === undefined || navbar === null || !(navbar.ribbonMenuItemEl instanceof HTMLElement)) return false;
    return navbar.ribbonMenuItemEl.classList.contains("has-active-menu");
  }

  // Row↔item mapping is index alignment: one .menu-item per non-natively-hidden item, in items
  // order (verified against Obsidian's showRibbonMenu source: it skips hidden items). On any
  // mismatch the menu is left untouched — native order, degraded but correct. Commander's CSS
  // hide targets side-dock-ribbon-action elements and misses these rows, so Commander-hidden
  // titles are dropped here explicitly. Every exit records lastMenuOutcome for diagnostics.
  private groupRibbonMenu(menuEl: HTMLElement): void {
    const internals = ribbonInternals(this.app);
    if (internals === null) {
      this.lastMenuOutcome = "no-internals";
      return;
    }
    const rowEls = Array.from(menuEl.querySelectorAll(".menu-item"));
    const nativeVisible = internals.items.filter((i) => !i.hidden);
    if (rowEls.length !== nativeVisible.length || rowEls.length === 0) {
      this.lastMenuOutcome = `bail: ${rowEls.length} rows vs ${nativeVisible.length} visible`;
      return;
    }
    const container = rowEls[0]?.parentElement;
    if (container === null || container === undefined) {
      this.lastMenuOutcome = "bail: no row container";
      return;
    }
    const cmdrHidden = this.cmdrHiddenTitles();
    const rowById = new Map<string, Element>();
    let dropped = 0;
    nativeVisible.forEach((item, i) => {
      const row = rowEls[i];
      if (row === undefined) return;
      if (cmdrHidden.has(item.title)) {
        row.remove();
        dropped += 1;
      } else rowById.set(item.id, row);
    });
    const effective = internals.items.map((i) => ({ id: i.id, hidden: i.hidden || cmdrHidden.has(i.title), tucked: false }));
    for (const menuRow of computeMenuRows(this.settings.groups, effective)) {
      if (menuRow.kind === "separator") {
        container.createDiv({ cls: "menu-separator" });
        continue;
      }
      const el = rowById.get(menuRow.id);
      if (el === undefined) continue;
      container.appendChild(el); // a DOM move keeps the row's tap handler
      const quickMenu = this.settings.menus.find((m) => `${this.manifest.id}:${m.name}` === menuRow.id);
      const iconEl = el.querySelector(".menu-item-icon");
      if (quickMenu !== undefined && iconEl instanceof HTMLElement) renderIcon(iconEl, quickMenu.icon, undefined, this.app);
    }
    this.lastMenuOutcome = `grouped: ${rowEls.length} rows, ${dropped} dropped`;
  }

  // On-device verification loop: iOS has no console, so the state needed to debug the phone
  // ribbon menu is exported through the clipboard instead. Failure surfaces as a Notice plus
  // console.error — never silently.
  private async copyDiagnostics(): Promise<void> {
    const navbar = (this.app as unknown as { mobileNavbar?: { ribbonMenuItemEl?: unknown } }).mobileNavbar;
    const internals = ribbonInternals(this.app);
    const cmdrHidden = this.cmdrHiddenTitles();
    const diagnostics = {
      version: this.manifest.version,
      platform: { isMobile: Platform.isMobile, isPhone: Platform.isPhone, isTablet: Platform.isTablet },
      mobileNavbar: navbar !== undefined && navbar !== null,
      ribbonMenuItemEl: navbar !== undefined && navbar !== null && navbar.ribbonMenuItemEl instanceof HTMLElement,
      menuObserverAttached: this.menuObserver !== null,
      items:
        internals === null
          ? null
          : internals.items.map((i) => ({ id: i.id, nativeHidden: i.hidden, cmdrHidden: cmdrHidden.has(i.title) })),
      lastMenuOutcome: this.lastMenuOutcome,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    } catch (error) {
      console.error("Ribbon Organizer: clipboard write failed", error);
      new Notice("Ribbon and Status Bar Organizer: couldn't copy diagnostics to the clipboard.");
      return;
    }
    new Notice("Ribbon and Status Bar Organizer: diagnostics copied to clipboard.");
  }

  // Re-applies when icons are added/removed (late-loading plugins, plugins rebuilding their own
  // buttons) or native hide/unhide toggles a class. Synchronous on purpose: observer callbacks
  // run at the microtask checkpoint, BEFORE the browser paints, so the restore is invisible —
  // a debounce here was the flicker users saw. applyGrouping disconnects this observer while it
  // writes, so our own edits never loop. Reconnected after every apply; disconnected on unload.
  private observeRibbon(ribbonItemsEl: HTMLElement): void {
    if (this.ribbonObserver === null) {
      this.ribbonObserver = new MutationObserver(() => this.applyGrouping());
    }
    this.ribbonObserver.observe(ribbonItemsEl, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  // Rebuilds this plugin's composite ribbon icons from settings: every previously registered
  // icon is removed (DOM element plus its leftRibbon.items entry when the internals are
  // readable — with unreadable internals grouping is disabled anyway, so DOM removal alone
  // suffices), then all menus re-register. Re-registration appends at the ribbon's end, but
  // grouping controls visual position via flex order, so a full rebuild is invisible.
  syncRibbonMenus(): void {
    const ribbon = (this.app.workspace as unknown as { leftRibbon?: { items?: unknown } }).leftRibbon;
    const items = ribbon !== undefined && Array.isArray(ribbon.items) ? (ribbon.items as { id?: unknown }[]) : null;
    for (const registered of this.menuIcons) {
      registered.el.remove();
      if (items !== null) {
        const idx = items.findIndex((it) => it.id === `${this.manifest.id}:${registered.name}`);
        if (idx !== -1) items.splice(idx, 1);
      }
    }
    this.menuIcons = [];
    const commands = (this.app as unknown as { commands: { commands: Record<string, unknown> } }).commands;
    for (const menu of this.settings.menus) {
      // A menu whose commands are all missing on this device gets no ribbon icon (the
      // settings tab still lists it, greyed); it re-registers on the next rebuild once a
      // command is back. Same availability source as openMenu: the live command registry.
      const entries = quickMenuEntries(menu.entries, (id) => id in commands.commands);
      if (!entries.some((e) => e.kind === "command" && !e.disabled)) continue;
      const el = this.addRibbonIcon(menu.icon, menu.name, (evt) => this.openMenu(evt, menu.id));
      // addRibbonIcon resolves only registered icon ids; iconize pack ids render blank without
      // the fallback chain. Obsidian re-renders reuse this element, so once is enough.
      renderIcon(el, menu.icon, undefined, this.app);
      this.menuIcons.push({ name: menu.name, el });
    }
    // During onload the layout isn't ready yet; the onLayoutReady hook applies grouping then.
    if (this.app.workspace.layoutReady) this.applyGrouping();
  }

  private openMenu(evt: MouseEvent, menuId: string): void {
    const quickMenu = this.settings.menus.find((m) => m.id === menuId);
    if (quickMenu === undefined) return; // deleted since registration; syncRibbonMenus already removed the icon
    const menu = new Menu();
    // Force a DOM menu: on macOS (nativeMenus default) this would render as a native OS menu,
    // which cannot show the built-in or iconize command icons. DOM mode renders them; no-op on
    // mobile, where menus are already DOM.
    menu.setUseNativeMenu(false);
    const commands = (this.app as unknown as {
      commands: { commands: Record<string, { icon?: string }>; executeCommandById: (id: string) => void };
    }).commands;
    // The popup shows only what's runnable here; settings keeps the greyed full list.
    const entries = presentQuickMenuEntries(quickMenuEntries(quickMenu.entries, (id) => id in commands.commands));
    if (entries.length === 0) {
      menu.addItem((i) => i.setTitle("No commands yet — add them under Quick menus in Ribbon and Status Bar Organizer settings").setDisabled(true));
    }
    for (const e of entries) {
      if (e.kind === "separator") {
        menu.addSeparator();
        continue;
      }
      menu.addItem((i) => {
        i.setTitle(e.label);
        i.setIcon(e.icon); // forces the icon slot to exist; renderIcon then fixes iconize ids
        const iconEl = (i as unknown as { iconEl?: HTMLElement }).iconEl;
        if (iconEl) renderIcon(iconEl, e.icon, commands.commands[e.commandId]?.icon, this.app);
        i.onClick(() => commands.executeCommandById(e.commandId)); // presented rows are always runnable
      });
    }
    menu.showAtMouseEvent(evt);
  }
}
