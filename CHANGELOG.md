# Changelog

## 0.18.1

- Fixed the mobile status bar pill floating high above the bottom edge and overlapping note text on tablets (#1). The pill's offset cleared the phone layout's bottom toolbar — chrome the tablet layout doesn't have. Tablets now place the pill in the bottom-right corner of the screen, just above the safe area, like the desktop status bar; phones are unchanged

## 0.18.0

- Added touch drag to every reorder list — ribbon icons and groups, quick menu entries, status bar rows. On phones and tablets the lists only answered to a mouse before; now the grip is the handle and the rest of the row still scrolls the list. Drops land exactly as with a mouse: a row's top or bottom half inserts before or after it, a group or menu header takes the drop at its end, and the dragged row dims while it travels. One limit for now: the list does not scroll itself while you drag — make long moves in hops, or use a row's "Move to group" menu
- Changed the settings tabs to show their label only on the active tab; the others are icon-only with the name in their tooltip, a better fit for the narrow Settings window
- Added this changelog: every release's notes now also live in `CHANGELOG.md` in the repository

## 0.17.2

### Popups show only what runs here

0.17.1 hid the ribbon icon of a menu with nothing to run on this device. This release finishes the story for mixed menus: the popup no longer shows rows you can't click.

#### Fixed

- A quick menu's popup now lists only the commands available on this device — missing ones are dropped instead of greyed, and a divider orphaned by the removal goes with them. Settings keeps the full list with its greyed "Not on this device" affordance, and hidden rows return automatically once their plugin is back.

Node suite at 114 tests.


## 0.17.1

### Quick menus stay honest across devices

Quick menus travel with your settings, but plugins don't. On a device missing the plugins behind a menu, the menu's ribbon icon still showed up — and opened a list where nothing was clickable.

#### Fixed

- A quick menu with none of its commands available on this device no longer shows its ribbon icon. The menu stays in settings (greyed, as before), and the icon returns once one of its plugins is back — after the next launch or any quick-menu edit.
- Menus with a mix of available and missing commands are unchanged: the icon shows, missing entries stay greyed with their owning plugin visible.

Node suite at 109 tests.


## 0.17.0

### A five-minute README, and its first screenshots

This release is docs only. The README was one long scroll doing two jobs — landing page and user manual; the jobs are now separate. The README (English and Chinese, kept line-parallel) covers pitch, features, install, quick start and privacy in five minutes, and everything it used to explain in depth lives in a proper user guide.

#### Docs

- New **[user guide](https://github.com/xooooooooox/obsidian-ribbon-organizer/blob/main/docs/GUIDE.md)** (`docs/GUIDE.md`): every behavior in one place — ribbon groups and the ⋯ tuck menu, the dual-layer hide and its Commander caveats, quick menus, the whole Status bar tab (display modes, rewrite rules, learned samples, the preview strip, mobile), and diagnostics.
- **README** rewritten as a landing page: ten one-sentence features linking into the guide, install now leads with the community store (the plugin is live there), the downloads badge counts store installs, and a Privacy section states the no-network posture outright.
- The repo's first two screenshots: the Ribbon tab as the hero image, and the Status bar tab with a rewrite rule live in the preview strip.

Node suite at 108 tests.


## 0.16.1

The plugin is now called **Ribbon and Status Bar Organizer** — same plugin, directory-compliant name.

### Fixed

- **Renamed to comply with the community directory.** The directory does not allow `&` in plugin names (only hyphens, plus signs, and parentheses), so the previous name "Ribbon & Status Bar Organizer" got the listing hidden. The display name is now "Ribbon and Status Bar Organizer" everywhere: the manifest, the settings heading, notices, and the docs.

### Notes

- Nothing else changed — this release is 0.16.0 plus the rename. The plugin id stays `ribbon-organizer`, so settings, hotkeys, and BRAT installs are unaffected.


## 0.16.0

Tuck the icons you rarely click into one ⋯ button, and a fix for icons that popped back during a sync.

### New

- **Tuck Ungrouped icons into a menu.** In the Ribbon groups tab, every Ungrouped icon gets a tuck button: tucked icons leave the ribbon and open from a single ⋯ button at the end of the Ungrouped run. Clicking a menu entry does exactly what clicking the icon did. Moving a tucked icon into a group brings it back to the ribbon.
- **The ⋯ button's icon is yours to pick** — click the icon slot on the Ungrouped header to choose any icon (Iconize packs included). Hidden icons never appear in the menu; an empty menu shows no button at all.

### Fixed

- **Hidden icons no longer reappear while their plugin is busy.** An icon hidden via Commander could pop back into the ribbon whenever its plugin temporarily renamed it (Remotely Save during a sync did this on every run). The hide is now pinned to the icon itself and can't be shaken off.

### Changed

- **New brand icon** — the mark now shows both halves of the plugin's job: the ribbon rail and the status bar.

### Notes

- If you unhide an icon inside Commander's own settings, the change shows up on the next ribbon refresh (or restart). Hiding, and unhiding from this plugin's settings, stay immediate.
- Older plugin versions simply ignore the new settings fields — a mixed-version fleet is safe.


## 0.15.0

Ribbon Organizer is now **Ribbon & Status Bar Organizer** — the name finally says what the plugin does. Same plugin, same settings, updates arrive as usual; nothing to do after updating.

### Changed

- **New name and description**, covering both halves of the plugin: the ribbon and the status bar.
- **Words that pull their weight.** Error notices now say what happened and what to do next ("… the bar is left untouched. Check for a plugin update."). The wand button says "Customize how it shows". The display-mode button tells you what a click switches to ("Display: Full — click for Compact").
- **Command rows show the owning plugin**, not the raw command id — hover a row to see the command's full id.
- **Dragging works the same everywhere.** Drop on a row's upper half to place before it, lower half to place after — exactly like the Status bar tab. Dropping onto a group or menu header highlights the whole header and adds to its end, so "into" no longer looks like "before".
- **Menu names rename like group names**: click the name, type, press Enter.
- **Visual tidy-up**: one delete icon everywhere, consistent corner rounding, "Not on this device" looks the same on all three tabs, and the command picker now shows each command's icon.
- New menus start as "Quick menu" instead of borrowing the plugin's name.

The repo also gained a DESIGN.md, and the README (EN/中文) caught up with everything shipped since 0.11.


## 0.14.2

Fixes status bar hiding: hidden items no longer come back on their own.

### Fixed

- Hiding a status bar item with the eye looked like it did nothing for items that update themselves as you work — backlinks, properties, word count, Live Preview, Git, and the like. The settings list and preview showed them as hidden, but the real status bar still displayed them: every time you switched files, the item's owner redrew it and undid the hide. Hidden items now stay hidden, whatever their owner does.

No action needed after updating — your existing hide marks simply take effect.


## 0.14.1

The buttons on the Status bar tab now line up on phones.

### Fixed

- On phones, the rewrite / display-mode / eye buttons in the Status bar list sat at a different spot on every row — flush against the name on some rows, at the right edge on others. They now form one right-aligned column on every row, and the "Not shown right now" / "Keeps its own position" notes follow the item name instead.

Desktop looks exactly as before.


## 0.14.0

The customize modal now works properly on a phone — including the color picker.

### Fixed

- Tapping a color dot on iOS now opens the system color picker. It used to do nothing: iOS only opens the picker for a real tap on the color input, so on mobile the tap now lands on the input itself.
- Recorded states in "Seen on this device" no longer clip on both sides on narrow screens — long entries truncate cleanly with an ellipsis.
- The preview strip in the Status bar settings tab stays in its place even when a floating-status-bar snippet or theme (such as AnuPpuccin's floating variant) moves the real status bar around. Previously it could drift up and cover the text above it.

### Changed

- On phones, each recorded state gets room to breathe: the state takes the full first line, and what it becomes follows on the second.
- On phones and tablets, the × that removes a rule's icon or color is always visible — it was hover-only, which touch screens can't reach. Color dots and icon buttons are also a touch larger there.

Desktop looks and behaves exactly as before.


## 0.13.0

Rewrite rules can now color what they show — and recorded states stop leaking into your settings file.

### New

- Give a rule a color: one dot for the icon, one for the text, each optional and independent. Turn a vim mode line green, or make just the ✗ of a failed sync red while the text keeps its normal color. Opening a picker with the other part already colored starts from that color, so matching both takes two clicks.
- The rule preview renders those colors too — what you see in "Seen on this device" is exactly what the status bar will show.
- The Full / Compact / Icon only pills in the customize modal carry the same icons as the mode button in the item list, so the two controls read as one.

### Changed

- The states recorded for "Seen on this device" are stored on the device itself now, not in the plugin's data.json. They were always per-device by nature; keeping them in the settings file meant any settings-sync tooling saw a change to pick up every time a status message ticked over. Existing recorded states move over automatically on first load, and data.json stays quiet from then on.

### Upgrade note

Update all your devices together:

- A device still on 0.12.x drops rule colors when it saves settings there (0.11.x also drops icons).
- A device still on 0.12.x keeps writing recorded states back into data.json; devices on 0.13.0 clean the field out again on every start, but your sync tooling only goes fully quiet once every device is on 0.13.0.


## 0.12.0

Rewrite rules can now show an icon — and write themselves.

### New

- Give a rewrite rule an icon, some text, or both. An icon-only rule turns a noisy status like "Syncing..." into a single glyph. Icons come from the same picker as ribbon icons, icon packs included.
- The "Seen on this device" list now previews every recorded state under your current rules — what each one becomes, and what's still shown as-is.
- Clicking a seen state writes the rule for you: similar states are compared and the changing part becomes {x}, already shortened. Add an icon and you're done.

### Fixes

- The preview strip no longer lets another plugin's status item drift over the settings panel while you scroll (seen with Workspaces Plus installed).
- An item in Compact mode now reverts immediately when you delete its last rule.
- The plugin id at the right of each row is now a small monospace tag, so it no longer reads like part of the item's text.

### Upgrade note

Update all your devices together: a device still on 0.11.x shows an icon-only rule as blank text, and saving settings there removes the icons from your rules.


## 0.11.1

Status bar items added through Commander now show their real names.

### Fixes

- Items without a plugin identity — a Commander macro like "Change vault", or Commander's own add button — used to appear in the Status bar tab under generic names like "Clickable icon". The list now uses the name the item announces for itself ("Change vault", "Add new command") and falls back to the old naming only when there is none. Your order, visibility, modes, and rules all carry over unchanged.

Upgrade in place from any 0.x; nothing to reconfigure.


## 0.11.0

Make the status bar say less — without losing anything.

### Shorten noisy items, your way

- **Display modes**: every row now has a mode button cycling **Full → Compact → Icon only**. Compact caps the item's width and shows the full text when you hover it; Icon only keeps just the icon.
- **Rewrite rules**: the wand button opens a small editor where `Successfully synced {time}` → `✓ {time}` turns Remotely Save's long message into a glance. `{name}` carries the changing part over, the first matching rule wins, and anything that doesn't match a rule is shown exactly as its plugin wrote it — rules can shorten, never blank.
- **Learned examples**: the tab remembers the last statuses each item actually displayed, so you can start a rule from a real example instead of guessing.

### Clearer list, better dragging

- Items that exist but aren't visible right now — a Vim pending-key display, a hover-revealed button — now say **Not shown right now** instead of looking broken; the preview strip skips them.
- Dropping a dragged row on another row's **top or bottom half** lands it before or after that row — and the last row's bottom half finally reaches the very end.

### Quiet by design, still

Modes and rules are applied as a light touch on top of the plugin's own item and fully undone when removed or on disable. If you configure nothing, your bar stays byte-for-byte native.

No settings migration; upgrade in place from any 0.x.


## 0.10.0

The Status bar tab grows up: hide what you don't need, see what you're doing, and a fix for bars that split after 0.9.0.

### Fixed: bars split by self-positioning items

If 0.9.0 tore your status bar in two after a drag, this release heals it on first load — no cleanup needed. Some items position themselves (quick-explorer's breadcrumbs region pins itself to the left edge and pushes everything else right); 0.9.0's ordering overrode that and moved the split point into the middle of the bar. Ribbon Organizer now recognizes such items, leaves them exactly where their plugin puts them, and shows them in the list with a lock: **Keeps its own position**. You can still hide them; you just don't drag them.

### Hide status bar items

Every row now has an eye. Hiding an item hides it on all your devices; the order and visibility travel together. If Commander hides a whole plugin's items, showing one of them clears Commander's rule while quietly keeping that plugin's other items hidden — nothing pops back unasked.

### See what you're touching

- A **preview strip** above the list mirrors the real bar — same items, same order, same left/right split — so you can check the result without closing settings.
- **Hover to locate**: point at a row, its preview, or the real bar item, and the same item lights up in all three places.

No settings changes; upgrade in place from any 0.x.


## 0.9.0

The organizer learns a second surface: the status bar.

### Put your status bar in your own order

A new **Status bar** tab in settings lists everything living in the status bar — drag to reorder, and the bar follows instantly. It's one order for all your devices: items a device doesn't have simply keep their place ("Not on this device") instead of being evicted, so reordering on your phone never scrambles your desktop. New items from freshly installed plugins line up at the end.

Rows show the plugin's real name with a live preview of what the item currently says, and when one plugin owns several items (Git's status and branch, for example) they're numbered so you always know which is which.

### Show the status bar on phones and tablets

Obsidian normally hides the status bar on mobile. A new opt-in toggle floats it above the toolbar as a compact pill — it slides away while you scroll or type, and floats back when you're done. Off by default: if you never flip it, nothing changes.

### Quiet by design

Ordering is applied as a light touch on top of Obsidian's own bar and is fully undone the moment the plugin is disabled. If you never open the Status bar tab, your bar stays byte-for-byte native.

No settings migration; upgrade in place from any 0.x.


## 0.8.1

Fixes the spurious "ribbon grouping is incompatible with this Obsidian version" error.

### The false alarm, fixed

- Disabling any plugin that owns a ribbon icon (manually, via a sync tool, or during a plugin update) made grouping shut off for the session with an "incompatible with this Obsidian version" notice — even though nothing was incompatible.
- Root cause: when a plugin unloads, Obsidian deliberately keeps its ribbon entry in `leftRibbon.items` (preserving its hidden/order state for the next enable) and only removes the entry's button element. The shape probe treated any entry without a button as "internals changed" and bailed.
- The probe now recognizes such unmounted entries as the normal state they are: grouping simply treats them as hidden (no order write, no divider slot), the settings icon list skips them, and the phone menu's row alignment keeps them — matching Obsidian's own behavior in all three places. A genuinely changed shape still disables grouping with the same explicit notice.

No settings changes; upgrade in place.


## 0.8.0

The quick-menu feature is now called **Quick menus** everywhere, the settings copy got a consistency pass, and the README was rebuilt around a proper quick start. No behavior changes.

### Changed

- **"Quick commands" is now "Quick menus".** The settings tab, tooltips, and docs all use the name of the thing you actually manage — menus. Nothing migrates: settings keys and your `data.json` are untouched, and searching the settings for the old name still finds the tab.
- **Settings copy unified.** "Move to Ungrouped" and the delete-group tooltip now spell the group's real name; the entry trash button says what it removes ("Remove command" / "Remove separator"); every notice carries the "Ribbon Organizer:" prefix; the empty-menu placeholder names the plugin's settings; menu-header counts use the same format as group headers.

### Docs

- README (EN + 中文) restructured: short feature list, a three-step quick start, and a "How it works" section that holds the caveats — plus a downloads badge.
- Fixed a stale claim in the developer docs that grouping was desktop-only (it has covered tablet and phone since 0.6.0).


## 0.7.0

Grouping now actually works in the phone ribbon menu, plus settings polish and a diagnostics command.

### Fixed

- **Phone ≡ ribbon menu ignored your groups.** The menu opened from the mobile navbar now follows your configured group order, renders separators between groups, and drops Commander-hidden entries. Previous releases hooked an internal method that real taps never reached; the menu is now caught the moment it appears, which covers every way of opening it (tap, long-press, and the long-press menu when a quick ribbon item is configured).
- **Settings list jumped to the top on every eye toggle.** Scroll position is now preserved across all settings re-renders (hide/show, drag-drop, move to group) — most noticeable on phones.
- **Ribbon row controls misaligned on phones.** The eye and move buttons now right-align; the redundant "hidden" text chip is gone on all platforms (hidden rows stay greyed with an accent eye-off icon).

### Added

- **Copy ribbon diagnostics** command: copies a JSON snapshot to the clipboard — plugin version, platform, both hide layers per icon, and the outcome of the last mobile-menu grouping pass. If something looks wrong on your phone, run it and paste the result into an issue.

### Changed

- Ribbon flex order is now applied through Obsidian's `setCssStyles` API (community-store review compliance); behavior is unchanged.


## 0.6.1

Pack icons now line up with the rest of the ribbon.

### Fixed

- **Iconize pack icons misaligned on the ribbon.** A quick menu using an icon from an [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) pack rendered at Iconize's file-tree metrics — its configured icon size plus its extra margin — so the ribbon button was smaller and visibly offset against its neighbours. The injected icon is now normalized to the surface's native metrics right after Iconize renders it, on every surface Ribbon Organizer draws icons onto (ribbon buttons, the phone ribbon menu, the settings panel).

### Notes

- No action needed if your quick menus use built-in icons or the bundled `ribbon-organizer` brand icon — those were always aligned.


## 0.6.0

Ribbon Organizer goes mobile — and the ribbon stops flickering.

### Changed

- **Mobile support.** Grouping and hiding now work on phones and tablets, matching each device's actual ribbon surface. Tablets group the drawer ribbon exactly like the desktop ribbon (same dividers). Phones group the **navbar ribbon menu** — the ≡ button's list is reordered into your groups with a separator line between them. Hidden icons stay out of it, **including icons hidden only in [Commander](https://github.com/phibr0/obsidian-commander)**, which Obsidian's own menu would still show. The full settings UI (groups, drag & drop, eye toggles) is available on mobile, with a phone layout pass: command rows split onto two lines so the command id gets its own line, and touch targets are taller.
- **No more ribbon flicker.** Some plugins rebuild their own ribbon button when you click it (sync-status icons are typical); the ribbon briefly snapped back to its ungrouped order before Ribbon Organizer restored it. The regroup now runs synchronously before the browser paints, so external rebuilds are invisible — no matter which plugin causes them.
- **Icons from icon packs render on the ribbon.** A quick menu whose icon comes from an [Iconize](https://github.com/FlorianWoelki/obsidian-iconize) pack rendered as a blank ribbon button; it now goes through the same fallback chain the settings UI uses.
- **Native brand icon.** The plugin registers its own icon as `ribbon-organizer`, so it appears in the icon picker with no Iconize required — and it's the default icon for new quick menus.

### Notes

- On phones the ribbon menu is rebuilt by Obsidian on every open; if a future Obsidian version changes that menu's structure, Ribbon Organizer leaves it untouched (native order) rather than guessing.


## 0.5.0

Hide any ribbon icon — and one switch that all three UIs agree on.

### Changed

- **Hide icons.** Every row in the (renamed) **Ribbon** tab now has an eye toggle. Hiding writes both Obsidian's native hide and [Commander](https://github.com/jsmorabito/obsidian-commander)'s hide list when Commander is installed; showing clears both. Whatever combination of the two layers hid an icon before, the row shows it as hidden and one click brings it back — no more hunting across three UIs for whoever is holding an icon down. Without Commander the toggle simply manages the native hide.
- **No more phantom dividers.** Group dividers now consider the *effective* visibility of members (native or Commander hidden), so a group whose icons are all hidden no longer leaves a stray divider line on the ribbon.
- **Header polish.** The pencil button is gone — click a group's name to rename it in place (same interaction as the Quick commands tab). The member count is now a pill, and reads `visible/total` when some members are hidden.
- **Hidden state is visible in the list.** Hidden icons render greyed with a `hidden` chip, so the settings list finally matches what the ribbon actually shows.
- **Brand assets.** The plugin now ships its icon (`assets/icon.svg`, a plain `currentColor` SVG you can drop into an Iconize icon pack), a README logo and a social-preview card.

### Notes

- Commander matches icons by **title**: two same-titled icons share a hide entry, and renaming a hidden icon (e.g. a quick menu) makes it visible again while leaving a stale entry in Commander's list.
- If Commander is installed but its settings look unexpected (e.g. after a breaking Commander update), Ribbon Organizer falls back to native-only hiding and tells you once.


## 0.4.0

Multiple quick menus — and a friendlier command list.

### Changed

- **Create any number of menus.** Each menu is its own ribbon icon opening its own command list. The **icon and name are editable** from the menu's section header (the name is the ribbon tooltip). Your existing quick commands migrate automatically into the first menu, "Ribbon Organizer".
- **Drag to reorder.** Entry rows (commands and separators) now have a grip — drag to reorder instead of the old up/down buttons. Drop on a row to insert before it; drop on a **menu header** to send the entry to that menu's end (its own header included — that's how you move an entry to the last slot). Collapsed headers accept drops without expanding.
- **The bound command is always visible.** Each row shows its command id in faint small type next to the label (truncated with an ellipsis when long — hover for the full id). Renaming the label never changes the binding.
- The Quick commands tab now mirrors the Ribbon groups layout: one collapsible section per menu (collapsed by default, member count on the header), with each menu's own "Add command" / "Add separator" buttons inside.
- An empty menu keeps its ribbon icon and shows a hint when opened; deleting a menu removes its icon immediately.

### Notes

- Renaming a menu changes its ribbon id, so the icon falls out of its ribbon group back into Ungrouped — re-drag it to restore.
- Menu icons should be built-in (Lucide) icons; Iconize custom-pack icons preview in settings but can't render on the ribbon button itself.


## 0.3.0

Collapsible groups in the **Ribbon groups** settings tab.

### Changed

- Groups now start **collapsed** every time the settings panel opens — the tab shows a compact list of group headers. Click a header to expand/collapse; a chevron shows the state.
- Each header shows a **member count** (e.g. `· 5`), so new icons landing in Ungrouped are visible at a glance without expanding it.
- **Filtering sees through collapse**: while the filter box has text, matching icons are shown even inside collapsed groups; clearing it restores each group's state.
- A newly created group starts expanded (you'll rename it and drag icons in right away).
- Dropping an icon onto a collapsed group's header still appends it to that group — no need to expand first.

Collapse state is session-only (nothing new is stored in `data.json`). To drag an icon *out* of a group or use its ⋮ menu, expand the group first.


## 0.2.1

Documentation release — no code changes since 0.2.0.

### Added

- Chinese README (`README.zh.md`) with language links from the English one.
- `docs/ARCHITECTURE.md` — code map, core invariants (visual-only grouping, sentinel semantics, divider rule), data model, and extension guide.
- Contributor docs: `CLAUDE.md` (commands, constraints, smoke-testing workflow) and `AGENTS.md` (general Obsidian-plugin guidelines).

The plugin binaries are identical to 0.2.0 — updating is optional.


## 0.2.0

**Ribbon groups** — the plugin now organizes the ribbon itself, not just a command menu.

### Ribbon groups (desktop)

- Order the left-ribbon icons into named groups from **Settings → Ribbon Organizer → Ribbon groups**: drag icons within and across groups, drag whole groups, or use each row's **⋮ → Move to group**.
- A thin **divider line** renders between adjacent non-empty groups — groups whose icons are all hidden (or absent on this device) produce no divider.
- Icons you haven't assigned fall into the built-in **Ungrouped** bucket, so newly installed plugins always land in a predictable spot. The bucket itself is draggable like any group.
- Implementation is non-invasive: visual order comes from flex `order` plus injected divider elements — Obsidian's own icon order, drag persistence, and right-click hide/unhide are never touched, and disabling the plugin restores the stock ribbon instantly.
- **Cross-device graceful**, same as quick commands: groups live in the plugin's `data.json`; an icon configured on another device shows greyed out as *Not on this device* and returns automatically.

### Settings panel

- The panel is now split into two tabs — **Ribbon groups** and **Quick commands** — with a filter box for hunting through long icon lists.
- Adopted Obsidian 1.13's declarative settings API, so the plugin's settings are discoverable via **settings search** on 1.13+; older versions (`minAppVersion` stays 1.8.7) keep working through the classic fallback.

### Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `xooooooooox/obsidian-ribbon-organizer`.


## 0.1.1

First release — **Quick commands**, extracted from [config-sync](https://github.com/xooooooooox/obsidian-config-sync) as a standalone plugin.

### Quick commands ribbon menu

- A **Ribbon Organizer** ribbon icon opens a menu of your own commands: any Obsidian command, with an editable label and icon, grouped by **separators**.
- Icons come from Obsidian's built-in set or from **[Iconize](https://github.com/FlorianWoelki/obsidian-iconize) custom icon packs**, picked from one unified fuzzy list with live previews. Iconize is entirely optional.
- The menu is always rendered in DOM mode, so command icons show correctly on macOS (native OS menus can't render them).
- **Graceful across devices:** the command list lives in the plugin's `data.json` (synced by whatever vault sync you use). A command not installed on the current device is greyed out — in the menu and in settings — and comes back automatically once its plugin is installed.

### Settings

- Manage the list under **Settings → Ribbon Organizer**: add commands via a fuzzy command picker, add separators, rename, re-icon, reorder, remove.
- Rows show the command label only (no raw command ids); a *Not on this device* hint appears when a command is missing.

### Install

Via [BRAT](https://github.com/TfTHacker/obsidian42-brat): add `xooooooooox/obsidian-ribbon-organizer`.

