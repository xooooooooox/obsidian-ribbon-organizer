<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon & Status Bar Organizer logo"></p>

# Ribbon & Status Bar Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![downloads](https://img.shields.io/github/downloads/xooooooooox/obsidian-ribbon-organizer/total?label=downloads)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases)
[![Static Badge](https://img.shields.io/badge/README-EN-blue)](./README.md)
[![Static Badge](https://img.shields.io/badge/README-中-red)](./README.zh.md)

一个 [Obsidian](https://obsidian.md) 插件:整理左侧 ribbon 图标栏,并通过可配置的 ribbon 菜单快速启动命令。

## 功能特性

- **Ribbon 分组** —— 把 ribbon 图标编排进命名分组,相邻非空分组之间渲染一条细分隔线;桌面端、平板抽屉式 ribbon、手机导航栏 ribbon 菜单(≡ 按钮)全部支持。
- **隐藏图标** —— 每个图标一个眼睛开关,同时写入 Obsidian 原生隐藏和 [Commander](https://github.com/jsmorabito/obsidian-commander) 的隐藏列表,三处 UI 永远保持一致。
- **Quick menus** —— 任意数量的额外 ribbon 图标,每个点开各自的命令列表;条目可设置标签和图标(支持 [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) 图标包与插件自带的 `ribbon-organizer` 图标),并可用分隔线分组。
- **状态栏** — 拖拽排序、眼睛隐藏、收纳吵闹的条目(紧凑/仅图标两档显示模式,以及 `Successfully synced {time}` → `✓ {time}` 这样的重写规则——规则还可以配一个图标,并给图标和文本分别指定颜色),内置实时预览;还可选择在手机和平板上以浮动胶囊的形式显示状态栏。
- **诊断** —— "Copy ribbon diagnostics" 命令把 JSON 快照复制到剪贴板,反馈问题时使用。
- 配置保存在插件的 `data.json` 中,随你现有的 vault 同步方案一起漫游;插件学到的状态样本则刻意只留在本机。

## 安装

通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat):添加 `xooooooooox/obsidian-ribbon-organizer`。

## 快速上手

1. 打开 **设置 → Ribbon & Status Bar Organizer → Ribbon**:新建分组并把图标拖进去——ribbon 上相邻非空分组之间会出现分隔线。
2. 点击任意一行的眼睛开关,即可在所有位置隐藏/显示该图标。
3. 切到 **Quick menus** 标签页:新建菜单并添加命令——菜单会以独立 ribbon 图标的形式出现。

## 工作原理

### Ribbon 分组

分组管理界面是一个镜像 ribbon 最终顺序的单列列表:图标可在分组之间拖拽,分组本身也可拖拽排序。分组默认折叠——组头显示成员数,若有成员被隐藏则显示"可见/总数"计数——过滤时会临时显示折叠分组中的匹配项。未分组的图标落入内置的"未分组"桶,新装插件的图标因此总有一个可预期的落点。桌面端和平板直接重排 ribbon 本体;手机端则在导航栏 ribbon 菜单(≡ 按钮)打开的瞬间重排菜单内容,包括分隔线。

### 隐藏

隐藏时会同时写入 Obsidian 原生隐藏和 Commander 的隐藏列表(如果安装了 Commander),取消隐藏时两者一起清除。注意:Commander 按标题匹配图标,两个同名图标会共享隐藏状态;重命名一个已隐藏的图标会让它重新显示,并在 Commander 列表中留下一条失效的旧记录。在手机上,隐藏的图标也会从导航栏 ribbon 菜单中消失——包括仅在 Commander 中隐藏的图标,Obsidian 自带菜单原本仍会显示它们。

### 状态栏

「Status bar」标签页列出所有状态栏条目:拖拽排序(落在行的上/下半区决定插到它前面还是后面)、眼睛隐藏,全部即时生效并同步到所有设备——本设备没有的条目保留原位。每行的模式按钮在 Full → Compact(限宽,悬停看全文)→ Icon only 间循环;魔杖打开逐条目的定制面板:显示模式胶囊、本机见过的状态——每条样本旁边实时预览当前规则的效果,点一下即可自动起草规则——以及规则编辑器,每条规则都可以带图标,并给图标和文本分别着色。`Successfully synced {time}` → `✓ {time}` 让 Remotely Save 的长消息一眼可读,`{name}` 会把变化的部分带到结果里,任何没有命中规则的文本都按插件原样显示。标签页会记住见过的状态,你可以从真实样本一键起草规则(样本只保存在本机,不参与同步)。挂载但此刻不可见的条目(Vim 待决按键、悬停才显形的按钮)显示「Not shown right now」;自己定位的条目显示锁并保留插件设定的位置;预览条如实映射真实状态栏,悬停设置行、预览条目或状态栏本身,三处会同时高亮同一个条目。Obsidian 在移动端默认隐藏状态栏:打开「Show on phones and tablets」开关后,状态栏会浮动在工具栏上方。条目按所属插件识别;同一插件的多个条目按位置区分,极少数情况下在该插件更新后可能互换。

### Quick menus

每个菜单是一个 ribbon 图标(图标和名称均可编辑——点击名称即可重命名),点开各自的命令列表。条目可拖拽排序(落在行的上/下半区决定插到它前面还是后面);拖到菜单组头上会移到该菜单末尾(自己的组头也可以,用于移到最后)。每行右侧显示命令所属的插件名,悬停可查看完整命令 id;当前设备上未安装的命令会置灰显示,插件装回后自动恢复。注意:重命名菜单会改变其 ribbon id,该图标会从所在分组掉回 Ungrouped——重新拖入即可恢复。

### 诊断

**Copy ribbon diagnostics** 会把 JSON 快照(平台、每个图标的双层隐藏状态、最近一次手机菜单重排结果)复制到剪贴板。反馈移动端问题时请附上它。

## 开发

- `npm run build` —— 类型检查 + 生产构建 · `npm test` —— 单元测试 · `npm run lint` —— 零告警基线
- 代码地图、不变量与扩展点:[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 许可证

MIT
