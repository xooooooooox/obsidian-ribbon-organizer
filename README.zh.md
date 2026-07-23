# Ribbon Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)

[English](README.md) · **中文**

一个 [Obsidian](https://obsidian.md) 插件:整理左侧 ribbon 图标栏,并通过一个可配置的 ribbon 菜单快速启动命令。

- **Ribbon 分组**(桌面端):在 **设置 → Ribbon Organizer** 中把 ribbon 图标编排进命名分组——图标可在分组之间拖拽,分组本身也可拖拽排序。相邻的非空分组之间会渲染一条细分隔线。分组默认折叠(组头显示成员数)——点击组头展开;过滤时会临时显示折叠分组中的匹配项。未分组的图标落入内置的"未分组"桶,新装插件的图标因此总有一个可预期的落点。图标的显示/隐藏仍走 Obsidian 原生右键菜单,插件不做干预。
- **Quick commands**:可创建任意数量的菜单——每个菜单是一个 ribbon 图标(图标和名称均可编辑),点开各自的命令列表。挑选任意命令,为其设置标签和图标(支持 [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) 自定义图标包),并用分隔线分组。条目可拖拽排序;拖到菜单组头上会移到该菜单末尾(自己的组头也可以,用于移到最后)。每行右侧始终显示实际绑定的命令 id。当前设备上未安装的命令会置灰显示,插件装回后自动恢复。注意:重命名菜单会改变其 ribbon id,该图标会从所在分组掉回 Ungrouped——重新拖入即可恢复。

配置保存在插件的 `data.json` 中,随你现有的 vault 同步方案一起漫游。

## 安装

通过 [BRAT](https://github.com/TfTHacker/obsidian42-brat):添加 `xooooooooox/obsidian-ribbon-organizer`。

## 许可证

MIT
