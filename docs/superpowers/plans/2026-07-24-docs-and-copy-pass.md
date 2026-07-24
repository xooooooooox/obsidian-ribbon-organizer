# Docs & Copy Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring RO's docs to the config-sync convention (README structure + zh mirror + repo About) and unify the settings-panel copy — the user-facing feature rename "Quick commands" → "Quick menus" plus seven string fixes. No behavior changes.

**Architecture:** Spec: `docs/superpowers/specs/2026-07-24-docs-and-copy-pass-design.md`. Four tasks: src string edits, README pair rewrite, CLAUDE/ARCHITECTURE updates, GitHub About. Every code edit is a user-visible string; every doc statement must trace to current code or the 0.7.0 release notes.

**Tech Stack:** TypeScript (Obsidian plugin), Markdown, `gh` CLI.

## Global Constraints

- **No git commits.** Changes stay in the working tree; the user commits at cut time. Never add Claude/AI attribution anywhere.
- **Rename is user-facing only**: "Quick commands" → "Quick menus" in UI strings and docs prose. Code identifiers stay untouched: `core/quickCommands.ts`, `quickMenuEntries`, the tab `id: "commands"`, CSS classes `ribbon-organizer-qc-*`, settings keys, test files.
- `README.md` and `README.zh.md` stay structurally 1:1 (same sections, same order).
- Gates for any task that touches `src/`: `npm test`, `npm run build`, `npm run lint` — all clean, lint at **zero warnings**, no inline eslint disables (scoped block in `eslint.config.mts` with rationale comment is the only sanctioned mechanism).
- Docs may not introduce new factual claims: reorganize only, sourced from the current README, `docs/ARCHITECTURE.md`, or the 0.7.0 release notes.

---

### Task 1: Settings-panel copy fixes (`src/`)

**Files:**
- Modify: `src/ui/SettingTab.ts:11,34`
- Modify: `src/ui/GroupsSection.ts:134,202`
- Modify: `src/ui/QuickMenusSection.ts:84,178-193,221`
- Modify: `src/main.ts:317,372`
- Possibly modify: `eslint.config.mts` (sentence-case contingency only)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: the final UI strings that Tasks 2–3 reference ("Quick menus" tab label). No signature changes except the private helper `removeButton` in `QuickMenusSection.ts` gaining a `tooltip: string` parameter (file-local).

- [ ] **Step 1: Apply the seven string edits**

`src/ui/SettingTab.ts` line 11 — tab label (the `id` stays `"commands"`):

```ts
  { id: "commands", label: "Quick menus", icon: "menu" },
```

`src/ui/SettingTab.ts` line 34 — settings-search description:

```ts
        desc: "Group and hide ribbon icons; launch commands from ribbon menus.",
```

`src/ui/GroupsSection.ts` line 134 — delete-group tooltip:

```ts
      new ExtraButtonComponent(btns).setIcon("x").setTooltip("Delete group (members fall to Ungrouped)").onClick(() => {
```

`src/ui/GroupsSection.ts` line 202 — drop the lowercase special case (the `UNGROUPED_ID` import stays; it has six other uses in the file). The sentinel group's `name` is `"Ungrouped"`, so the template covers it:

```ts
          mi.setTitle(`Move to ${target.name}`).onClick(() => {
```

`src/ui/QuickMenusSection.ts` — `removeButton` takes the tooltip (lines 178-184), and the two call sites name what they remove (lines 193 and 221):

```ts
    const removeButton = (row: HTMLElement, idx: number, tooltip: string): void => {
      const rowBtns = row.createDiv({ cls: "ribbon-organizer-qc-btns" });
      new ExtraButtonComponent(rowBtns).setIcon("trash").setTooltip(tooltip).onClick(() => {
        list.splice(idx, 1);
        this.persist();
      });
    };
```

```ts
        removeButton(row, idx, "Remove separator");   // separator branch, line 193
```

```ts
      removeButton(row, idx, "Remove command");       // command row, line 221
```

`src/ui/QuickMenusSection.ts` line 84 — menu-header count matches the group-header format (no `· ` prefix):

```ts
    hdr.createSpan({ cls: "ribbon-organizer-rg-count", text: String(commandCount) });
```

`src/main.ts` line 317 — success Notice gets the shared prefix (the other four Notices already have it):

```ts
    new Notice("Ribbon Organizer: diagnostics copied to clipboard.");
```

`src/main.ts` line 372 — empty-menu placeholder names the plugin:

```ts
      menu.addItem((i) => i.setTitle("No commands configured — add them in Ribbon Organizer settings").setDisabled(true));
```

- [ ] **Step 2: Run the gates**

Run: `npm test && npm run build && npm run lint`
Expected: tests pass (core untouched), build clean, lint zero warnings.

**Sentence-case contingency:** if `obsidianmd/ui/sentence-case` warns on the capital-U `"Ungrouped"` string in `GroupsSection.ts:134`, add `'Ungrouped'` to the existing `brands` array in `eslint.config.mts` (it currently reads `brands: ['Ribbon Organizer', 'Obsidian']`) and extend that block's rationale comment with one line: `// 'Ungrouped' is the sentinel group's displayed name.` Do NOT add an inline disable. Re-run lint to zero warnings.

- [ ] **Step 3: Smoke-check the strings in the dev vault**

Run: `npm run smoke:install`, then with the dev vault open (obsidian-cli routes by CWD — cd into `dev/vault` for each call):

```bash
cd dev/vault && /Applications/Obsidian.app/Contents/MacOS/obsidian-cli eval code="(async () => { app.setting.open(); app.setting.openTabById('ribbon-organizer'); await new Promise(r => setTimeout(r, 300)); const tabs = [...document.querySelectorAll('.ribbon-organizer-tab')].map(e => e.textContent); const counts = [...document.querySelectorAll('.ribbon-organizer-rg-count')].map(e => e.textContent); return JSON.stringify({ tabs, counts }); })()"
```

Expected: `tabs` contains `"Quick menus"` (not `"Quick commands"`); no count string starts with `"· "`.
Also reload the plugin first if it was already running: `plugin:reload id=ribbon-organizer`.

- [ ] **Step 4: No commit** — leave changes in the working tree (Global Constraints).

---

### Task 2: README.md + README.zh.md rewrite

**Files:**
- Modify: `README.md` (full replacement)
- Modify: `README.zh.md` (full replacement)

**Interfaces:**
- Consumes: the tab label "Quick menus" from Task 1 (Quick start step 3 names it).
- Produces: the README pitch sentence Task 4's About description mirrors.

- [ ] **Step 1: Replace `README.md` with exactly:**

````markdown
<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon Organizer logo"></p>

# Ribbon Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![downloads](https://img.shields.io/github/downloads/xooooooooox/obsidian-ribbon-organizer/total?label=downloads)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases)
[![Static Badge](https://img.shields.io/badge/README-EN-blue)](./README.md)
[![Static Badge](https://img.shields.io/badge/README-中-red)](./README.zh.md)

An [Obsidian](https://obsidian.md) plugin that organizes the left ribbon and launches your commands from configurable ribbon menus.

## Features

- **Ribbon groups** — order the ribbon icons into named groups with a thin divider line between them; works on desktop, on the tablet drawer ribbon, and in the phone navbar ribbon menu (the ≡ button).
- **Hide icons** — an eye toggle per icon that writes both Obsidian's native hide and [Commander](https://github.com/jsmorabito/obsidian-commander)'s hide list, so the three UIs never disagree.
- **Quick menus** — any number of extra ribbon icons, each opening its own command list; entries carry editable labels and icons (including [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) packs and the plugin's built-in `ribbon-organizer` icon) and can be grouped with separators.
- **Diagnostics** — a "Copy ribbon diagnostics" command copies a JSON snapshot to the clipboard for issue reports.
- Configuration lives in the plugin's `data.json`, so it follows whatever vault sync you use.

## Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `xooooooooox/obsidian-ribbon-organizer`.

## Quick start

1. Open **Settings → Ribbon Organizer → Ribbon**: create a group and drag icons into it — dividers appear on the ribbon between adjacent non-empty groups.
2. Use the eye toggle on any row to hide or show that icon everywhere.
3. Switch to the **Quick menus** tab: create a menu and add commands — the menu appears as its own ribbon icon.

## How it works

### Ribbon groups

Groups are managed from a single column mirroring the ribbon's final order: drag icons between groups, drag groups to reorder. Groups start collapsed — the header shows a member count, or a visible/total pill when some members are hidden — and filtering reveals matches inside collapsed groups. Icons you haven't assigned fall into the ungrouped bucket, so newly installed plugins land in a predictable spot. Desktop and tablet ribbons are reordered in place; on phones the plugin reorders the navbar ribbon menu (the ≡ button) as it opens, separators included.

### Hiding

Hiding writes Obsidian's native hide and Commander's hide list together (when Commander is installed), and showing clears both. Caveats: Commander matches icons by title, so two same-titled icons share the hide, and renaming a hidden icon makes it visible again while leaving a stale Commander entry behind. On phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show.

### Quick menus

Each menu is one ribbon icon (icon and name editable) opening its own command list. Drag entries to reorder them; dropping one on a menu header sends it to that menu's end (its own header included). Every row shows the command id it is bound to; a command not installed on the current device is greyed out and recovers automatically once its plugin is installed. Caveat: renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag it to restore.

### Diagnostics

**Copy ribbon diagnostics** copies a JSON snapshot — platform, both hide layers per icon, and the outcome of the last phone-menu grouping pass — to the clipboard. Attach it when reporting mobile issues.

## Development

- `npm run build` — typecheck + production bundle · `npm test` — unit tests · `npm run lint` — zero-warning baseline
- Code map, invariants, and extension points: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## License

MIT
````

- [ ] **Step 2: Replace `README.zh.md` with exactly:**

````markdown
<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon Organizer logo"></p>

# Ribbon Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![downloads](https://img.shields.io/github/downloads/xooooooooox/obsidian-ribbon-organizer/total?label=downloads)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases)

[English](README.md) · **中文**

一个 [Obsidian](https://obsidian.md) 插件:整理左侧 ribbon 图标栏,并通过可配置的 ribbon 菜单快速启动命令。

## 功能特性

- **Ribbon 分组** —— 把 ribbon 图标编排进命名分组,相邻非空分组之间渲染一条细分隔线;桌面端、平板抽屉式 ribbon、手机导航栏 ribbon 菜单(≡ 按钮)全部支持。
- **隐藏图标** —— 每个图标一个眼睛开关,同时写入 Obsidian 原生隐藏和 [Commander](https://github.com/jsmorabito/obsidian-commander) 的隐藏列表,三处 UI 永远保持一致。
- **Quick menus** —— 任意数量的额外 ribbon 图标,每个点开各自的命令列表;条目可设置标签和图标(支持 [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) 图标包与插件自带的 `ribbon-organizer` 图标),并可用分隔线分组。
- **诊断** —— "Copy ribbon diagnostics" 命令把 JSON 快照复制到剪贴板,反馈问题时使用。
- 配置保存在插件的 `data.json` 中,随你现有的 vault 同步方案一起漫游。

## 安装

通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat):添加 `xooooooooox/obsidian-ribbon-organizer`。

## 快速上手

1. 打开 **设置 → Ribbon Organizer → Ribbon**:新建分组并把图标拖进去——ribbon 上相邻非空分组之间会出现分隔线。
2. 点击任意一行的眼睛开关,即可在所有位置隐藏/显示该图标。
3. 切到 **Quick menus** 标签页:新建菜单并添加命令——菜单会以独立 ribbon 图标的形式出现。

## 工作原理

### Ribbon 分组

分组管理界面是一个镜像 ribbon 最终顺序的单列列表:图标可在分组之间拖拽,分组本身也可拖拽排序。分组默认折叠——组头显示成员数,若有成员被隐藏则显示"可见/总数"计数——过滤时会临时显示折叠分组中的匹配项。未分组的图标落入内置的"未分组"桶,新装插件的图标因此总有一个可预期的落点。桌面端和平板直接重排 ribbon 本体;手机端则在导航栏 ribbon 菜单(≡ 按钮)打开的瞬间重排菜单内容,包括分隔线。

### 隐藏

隐藏时会同时写入 Obsidian 原生隐藏和 Commander 的隐藏列表(如果安装了 Commander),取消隐藏时两者一起清除。注意:Commander 按标题匹配图标,两个同名图标会共享隐藏状态;重命名一个已隐藏的图标会让它重新显示,并在 Commander 列表中留下一条失效的旧记录。在手机上,隐藏的图标也会从导航栏 ribbon 菜单中消失——包括仅在 Commander 中隐藏的图标,Obsidian 自带菜单原本仍会显示它们。

### Quick menus

每个菜单是一个 ribbon 图标(图标和名称均可编辑),点开各自的命令列表。条目可拖拽排序;拖到菜单组头上会移到该菜单末尾(自己的组头也可以,用于移到最后)。每行右侧始终显示实际绑定的命令 id;当前设备上未安装的命令会置灰显示,插件装回后自动恢复。注意:重命名菜单会改变其 ribbon id,该图标会从所在分组掉回 Ungrouped——重新拖入即可恢复。

### 诊断

**Copy ribbon diagnostics** 会把 JSON 快照(平台、每个图标的双层隐藏状态、最近一次手机菜单重排结果)复制到剪贴板。反馈移动端问题时请附上它。

## 开发

- `npm run build` —— 类型检查 + 生产构建 · `npm test` —— 单元测试 · `npm run lint` —— 零告警基线
- 代码地图、不变量与扩展点:[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 许可证

MIT
````

- [ ] **Step 3: Verify the pair**

Run: `grep -c "^## " README.md README.zh.md` — both report **6** sections; `grep -c "^### " README.md README.zh.md` — both report **4**.
Run: `grep -in "quick command" README.md README.zh.md` — expected: no matches.

- [ ] **Step 4: No commit** — leave changes in the working tree.

---

### Task 3: CLAUDE.md + docs/ARCHITECTURE.md updates

**Files:**
- Modify: `CLAUDE.md:3,45`
- Modify: `docs/ARCHITECTURE.md:6,39,55,57`

**Interfaces:**
- Consumes: the rename decision (Task 1's tab label).
- Produces: nothing downstream.

- [ ] **Step 1: CLAUDE.md line 3** — rename + add the phone-menu spec pointer. Replace the two sentences `Grouping spec: … (read it before changing \`applyGrouping\` or the settings panel). The Quick commands feature was extracted from …` with:

```markdown
Grouping spec: `docs/superpowers/specs/2026-07-23-ribbon-grouping-design.md` (read it before changing `applyGrouping` or the settings panel); phone-menu spec: `docs/superpowers/specs/2026-07-24-mobile-menu-and-settings-polish-design.md` (read it before changing `observeMenus`/`groupRibbonMenu`). The Quick menus feature (formerly Quick commands) was extracted from [obsidian-config-sync](https://github.com/xooooooooox/obsidian-config-sync); the extraction spec lives in that repo.
```

- [ ] **Step 2: CLAUDE.md line 45** — fix the stale desktop-only rule. Replace the whole bullet with:

```markdown
- Grouping runs on every platform through two mechanisms — desktop/tablet via flex `order` (`applyGrouping`), phones via the observed navbar ribbon menu (`observeMenus`/`groupRibbonMenu`); quick menus must keep working on mobile (`isDesktopOnly: false`).
```

- [ ] **Step 3: ARCHITECTURE.md rename spots** (prose only; module/file names like `core/quickCommands.ts` stay):

Line 6: `2. **Quick commands**: a ribbon-menu launcher…` → `2. **Quick menus**: a ribbon-menu launcher…`
Line 39: `— the Quick commands tab:` → `— the Quick menus tab:`
Line 55: `Same contract as quick commands' \`disabled\` flag.` → `Same contract as quick-menu entries' \`disabled\` flag.`
Line 57: `**Platform split.** Quick commands run everywhere` → `**Platform split.** Quick menus run everywhere`

- [ ] **Step 4: Drift check** — read `docs/ARCHITECTURE.md` top to bottom against `src/` (each module bullet vs its file) and the 0.7.0 release notes. Expected: zero further edits; fix any drift found and report it.

- [ ] **Step 5: Verify** — `grep -in "quick command" CLAUDE.md docs/ARCHITECTURE.md` matches only code identifiers (`core/quickCommands.ts`, `quickCommands` legacy key in migration prose), never the feature name. `grep -n "desktop-only" CLAUDE.md` — no matches.

- [ ] **Step 6: No commit** — leave changes in the working tree.

---

### Task 4: GitHub About (controller-inline; no subagent needed)

**Files:** none (remote repo metadata).

- [ ] **Step 1: Apply**

```bash
gh repo edit xooooooooox/obsidian-ribbon-organizer \
  --description "Organize the Obsidian left ribbon into named groups with dividers, hide icons, and launch commands from quick ribbon menus — desktop, tablet, and phone." \
  --add-topic obsidian --add-topic obsidian-plugin --add-topic ribbon --add-topic toolbar --add-topic customization
```

- [ ] **Step 2: Verify**

Run: `gh repo view xooooooooox/obsidian-ribbon-organizer --json description,repositoryTopics`
Expected: the description above and exactly the five topics.
