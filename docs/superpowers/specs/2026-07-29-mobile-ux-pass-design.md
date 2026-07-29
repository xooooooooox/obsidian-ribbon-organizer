# Mobile UX Pass: Modal Phone Layout, Touch Affordances, Strip Hardening — Design

Mockup (定稿): https://claude.ai/code/artifact/9bab72ac-790c-4f11-a0ca-d9e0c9e3a399

## Goal

Five batched items for 0.14.0, all in `styles.css` (no TypeScript changes):

1. **Seen rows stack on phones.** The customize modal's seen rows (`chip → result`) don't fit a phone width: the find chip clips on both sides with no ellipsis, and result pills wrap to two lines. On phones the chip takes its own full-width line; the arrow + result pill follow on a second line.
2. **Chip truncation fix (all platforms).** The chip is a `<button>`; Obsidian mobile's button base centers content in a flex box, which clips overflowing text on both sides and defeats `text-overflow: ellipsis`. Force block layout + left alignment on the seen-row chip so ellipsis works everywhere.
3. **Clear badges reachable on touch.** The × badges that remove a rule's icon or color are hover-revealed — unreachable on touch devices. On mobile they are always visible (slightly larger, with a background-colored ring so they read against the swatch); desktop keeps hover-reveal.
4. **Color picker opens on iOS.** Tapping a color dot does nothing on iPhone: the picker is opened via a programmatic `input.click()` on a hidden `input[type=color]`, and iOS does not open pickers for programmatic clicks (Apple forums thread 767170; the input type itself is supported since iOS 14.5). On mobile the transparent input becomes the tap target directly (`pointer-events: auto` — it already fills the dot button), so a real tap lands on the input and the system picker opens. Desktop keeps the programmatic path.
5. **Preview strip hardening.** The settings-tab preview strip reuses the `status-bar` class; any floating-status-bar snippet or theme (the user's retired `mystyle-mobile.css`, AnuPpuccin's floating variant) that sets inset offsets on `.status-bar` without excluding the strip shifts it out of its flow slot (relative positioning turns `bottom: Xpx` into a visual lift — observed covering the section description on iPhone). Add `inset: auto !important` to the strip rule.

## Platform gates

- **Touch affordances** (items 3, 4, and control sizes) gate on `body.is-mobile` — tablets can't hover either.
- **Stacked layout** (item 1) gates on `body.is-phone` — tablet modals are wide enough for the side-by-side row.
- Item 2 (chip block layout) and item 5 (strip inset) are unconditional.

## CSS changes (styles.css)

All selectors below are existing classes; only rules change or get mobile companions.

```css
/* 2 — chip: block + left so ellipsis works under the mobile flex button base */
.ribbon-organizer-sbm-seenrow .ribbon-organizer-sbm-chip {
  /* existing: overflow/text-overflow/white-space/max-width/flex */
  display: block; text-align: left;
}

/* 1 — phone: chip takes the full first line, arrow + result wrap to the second */
body.is-phone .ribbon-organizer-sbm-seenrow { flex-wrap: wrap; row-gap: 5px; }
body.is-phone .ribbon-organizer-sbm-seenrow .ribbon-organizer-sbm-chip {
  flex-basis: 100%; max-width: none;
}

/* 3 — mobile: clear badges always visible, larger, ringed */
body.is-mobile .ribbon-organizer-sbm-iconclear {
  display: inline-flex; width: 17px; height: 17px; top: -7px; right: -7px;
  border: 2px solid var(--modal-background, var(--background-primary));
}
body.is-mobile .ribbon-organizer-sbm-iconclear svg { width: 10px; height: 10px; }

/* 4 — mobile: the input is the tap target; a real tap opens the iOS picker */
body.is-mobile .ribbon-organizer-sbm-dotinput { pointer-events: auto; cursor: pointer; }

/* touch sizes — mobile only */
body.is-mobile .ribbon-organizer-sbm-dotbtn { width: 28px; height: 28px; }
body.is-mobile .ribbon-organizer-sbm-dotswatch { width: 15px; height: 15px; }
body.is-mobile .ribbon-organizer-sbm-dotbtn.is-unset .ribbon-organizer-sbm-dotswatch { width: 12px; height: 12px; }
body.is-mobile .ribbon-organizer-sbm-iconbtn { width: 34px; height: 34px; }
body.is-mobile .ribbon-organizer-sbm-rule { gap: 9px; margin: 12px 0 10px; }

/* 5 — strip: neutralize inset offsets from floating-status-bar snippets/themes */
.status-bar.ribbon-organizer-sb-strip { /* existing rule gains: */ inset: auto !important; }
```

Why no TypeScript: the dot's DOM order is already swatch → input → clear badge, so the badge paints above the input and keeps its own tap target; the existing `event.target === input` guard in the dot button's click handler also swallows the bubbled tap from the now-interactive input, so the programmatic `input.click()` never double-fires on mobile.

## Out of scope

- Touch drag-reorder (all three sections use HTML5 drag, inert on touch). Ordering lives in data.json and syncs, so reordering on desktop applies to phones. A pointer-event drag rewrite is its own project.
- Settings-tab row copy truncations on narrow screens ("Not shown right now" wrapping) — acceptable as-is.
- The user-side cleanup that triggered item 5 (deleting `mystyle-mobile.css` from the vault) — RO 0.13+ replaces it; the hardening protects everyone else.

## Testing

- Pure layer untouched — existing 96 tests must stay green; lint + build clean.
- Dev-vault smoke (desktop, simulated): add `is-mobile`/`is-phone` to `document.body` via obsidian-cli eval, open the customize modal, assert computed styles: chip `display: block`, seen row wraps, `.sbm-dotinput` `pointer-events: auto`, clear badge `display: inline-flex`, strip `bottom` resolves to `auto` even with a competing `.is-mobile .status-bar { bottom: 84px }` test snippet.
- Real-device verify (user, post-release): iPhone color dot opens the system picker; stacked seen rows; badges tappable; settings-tab strip sits in its slot once `mystyle-mobile.css` is removed (and stays put even with it enabled, thanks to item 5).

## Compatibility & docs

- No data model or engine changes; safe patch semantics, shipped as 0.14.0 (UX changes beyond a pure fix).
- docs/ARCHITECTURE.md: modal section — phone stacking, touch badge visibility, and the two picker-opening paths (desktop programmatic click / mobile direct tap); strip section — the inset hardening and why.
