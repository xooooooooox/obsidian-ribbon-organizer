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
