<p align="center"><img src="assets/logo.svg" width="96" alt="Ribbon Organizer logo"></p>

# Ribbon Organizer

[![release](https://img.shields.io/github/v/release/xooooooooox/obsidian-ribbon-organizer?label=release)](https://github.com/xooooooooox/obsidian-ribbon-organizer/releases/latest)
[![Static Badge](https://img.shields.io/badge/README-EN-blue)](./README.md)
[![Static Badge](https://img.shields.io/badge/README-中-red)](./README.zh.md)

An [Obsidian](https://obsidian.md) plugin that organizes the left ribbon and launches your commands from a configurable ribbon menu.

- **Ribbon groups**: order the ribbon icons into named groups from **Settings → Ribbon Organizer** — drag icons between groups, drag groups to reorder. A thin divider line renders between adjacent non-empty groups. Groups start collapsed (header shows a member count, or a visible/total pill when some members are hidden) — click a header to expand; filtering reveals matches inside collapsed groups. Icons you haven't assigned fall into the ungrouped bucket, so newly installed plugins land in a predictable spot. Works on mobile too: tablets group the drawer ribbon; phones group the navbar ribbon menu (the ≡ button), including the separators.
- **Hide icons**: every row has an eye toggle. Hiding writes both Obsidian's native hide and [Commander](https://github.com/jsmorabito/obsidian-commander)'s hide list (when Commander is installed), and showing clears both, so the three UIs never disagree. Note: Commander matches icons by title, so two same-titled icons share the hide; renaming a hidden icon (e.g. a quick menu) makes it visible again and leaves a stale Commander entry behind. On phones, hidden icons also disappear from the navbar ribbon menu — including icons hidden only in Commander, which Obsidian's own menu would still show.
- **Quick commands**: create any number of menus — each is one ribbon icon (icon and name editable) opening its own command list. Pick any commands, give them labels and icons (including [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) custom-pack icons, or the plugin's own natively registered `ribbon-organizer` icon, usable without Iconize and the default for new menus), group them with separators. Drag entries to reorder them; dropping one on a menu header sends it to that menu's end (its own header included). Every row shows the command id it is bound to. A command not installed on the current device is greyed out and recovers automatically once its plugin is installed. Note: renaming a menu changes its ribbon id, so it falls out of its ribbon group back into Ungrouped — re-drag it to restore.
- **Diagnostics**: the "Copy ribbon diagnostics" command copies a JSON snapshot (platform, hide layers per icon, last mobile-menu grouping outcome) to the clipboard — useful when reporting mobile issues.

Configuration lives in the plugin's `data.json`, so it follows whatever vault sync you use.

## Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `xooooooooox/obsidian-ribbon-organizer`.

## License

MIT
