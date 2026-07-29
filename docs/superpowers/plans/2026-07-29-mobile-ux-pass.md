# Mobile UX Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the status-bar customize modal usable on phones (stacked seen rows, touch-reachable clear badges, working iOS color picker) and harden the settings-tab preview strip against floating-status-bar CSS.

**Architecture:** CSS-only — every change lands in `styles.css`; the modal's existing DOM order and event guards already support the mobile tap paths. Docs updated in the same task.

**Tech Stack:** Obsidian plugin CSS (`body.is-mobile` / `body.is-phone` platform classes).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-mobile-ux-pass-design.md` — CSS values there are verbatim-binding.
- Touch affordances (badges, input tap target, control sizes) gate on `body.is-mobile`; the stacked seen-row layout gates on `body.is-phone`; the chip block-layout fix and the strip `inset: auto !important` are unconditional.
- No TypeScript changes. No new classes — only existing selectors gain rules or mobile companions.
- NO-COMMIT mode: leave all changes uncommitted; the controller commits at cut time. No Claude attribution anywhere.
- Gates: `npm test` (96 pass), `npm run lint` (0 errors, warnings ≤ baseline 67), `npm run build` clean.

---

### Task 1: Mobile CSS pass + docs

**Files:**
- Modify: `styles.css` (modal block ~lines 176–216, strip rule ~line 150)
- Modify: `docs/ARCHITECTURE.md` (modal + strip sections)

**Interfaces:**
- Consumes: existing classes `ribbon-organizer-sbm-seenrow/-chip/-iconclear/-dotbtn/-dotswatch/-dotinput/-iconbtn/-rule`, `status-bar ribbon-organizer-sb-strip`.
- Produces: nothing consumed by later tasks (single-task plan).

- [ ] **Step 1: styles.css — chip block layout (unconditional)**

Extend the existing seen-row chip rule (currently `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; flex: none;`) with:

```css
.ribbon-organizer-sbm-seenrow .ribbon-organizer-sbm-chip { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 55%; flex: none; display: block; text-align: left; }
```

Add a comment on WHY: Obsidian mobile's button base is a centering flex box — overflowing text clips on both sides and text-overflow never renders; block + left restores ellipsis.

- [ ] **Step 2: styles.css — phone stacked seen rows**

After the seen-row rules add:

```css
/* Phones: the chip takes the full first line; arrow + result wrap to a second line */
body.is-phone .ribbon-organizer-sbm-seenrow { flex-wrap: wrap; row-gap: 5px; }
body.is-phone .ribbon-organizer-sbm-seenrow .ribbon-organizer-sbm-chip { flex-basis: 100%; max-width: none; }
```

- [ ] **Step 3: styles.css — mobile touch affordances**

After the dot/iconbtn rules add:

```css
/* Touch (phones AND tablets — no hover): clear badges always visible, ringed to read
 * against the swatch; the transparent color input is the tap target — iOS opens the
 * system picker only for a real tap on the input, not for a programmatic .click(). */
body.is-mobile .ribbon-organizer-sbm-iconclear { display: inline-flex; width: 17px; height: 17px; top: -7px; right: -7px; border: 2px solid var(--modal-background, var(--background-primary)); }
body.is-mobile .ribbon-organizer-sbm-iconclear svg { width: 10px; height: 10px; }
body.is-mobile .ribbon-organizer-sbm-dotinput { pointer-events: auto; cursor: pointer; }
body.is-mobile .ribbon-organizer-sbm-dotbtn { width: 28px; height: 28px; }
body.is-mobile .ribbon-organizer-sbm-dotswatch { width: 15px; height: 15px; }
body.is-mobile .ribbon-organizer-sbm-dotbtn.is-unset .ribbon-organizer-sbm-dotswatch { width: 12px; height: 12px; }
body.is-mobile .ribbon-organizer-sbm-iconbtn { width: 34px; height: 34px; }
body.is-mobile .ribbon-organizer-sbm-rule { gap: 9px; margin: 12px 0 10px; }
```

- [ ] **Step 4: styles.css — strip inset hardening**

In the existing `.status-bar.ribbon-organizer-sb-strip` rule, add `inset: auto !important;` and extend the comment block above it: floating-status-bar snippets/themes set inset offsets on `.status-bar` without excluding the strip; under relative positioning `bottom: Xpx` becomes a visual lift out of the flow slot; snippets load after plugin CSS so the reset needs `!important`.

- [ ] **Step 5: docs/ARCHITECTURE.md**

Modal section: phone stacking (`is-phone` wrap), touch badge visibility (`is-mobile`), and the two picker-opening paths (desktop = hidden input + programmatic click; mobile = the input itself is the tap target because iOS ignores programmatic clicks). Strip section: the `inset: auto !important` hardening and its trigger. Keep edits to the affected paragraphs only.

- [ ] **Step 6: Gates**

Run: `npm test && npm run lint && npm run build`
Expected: 96 tests pass, lint 0 errors (warnings ≤ 67), build clean.

- [ ] **Step 7: Report** — no commit (NO-COMMIT mode); report status + gate output.

---

### Verification (controller-run, after Task 1 review)

Dev-vault smoke via obsidian-cli eval (desktop, simulated platform classes):
1. Build → copy `main.js`/`styles.css`/`manifest.json` into the dev vault's `ribbon-organizer` plugin dir; `app:reload`; wait ~10–15s for eval re-registration.
2. `document.body.classList.add("is-mobile", "is-phone")`, open the customize modal for an item with seen samples + a rule with icon/colors.
3. Assert computed styles: chip `display: block` + `text-align: left`; seenrow `flex-wrap: wrap`; chip `flex-basis: 100%`; `.sbm-dotinput` `pointer-events: auto`; `.sbm-iconclear` `display: inline-flex`, 17px; dotbtn 28px, iconbtn 34px.
4. Strip displacement repro: inject `<style>.is-mobile .status-bar { bottom: 84px; margin-bottom: 0 !important; }</style>`, assert strip computed `bottom` is `auto`; remove the style + classes; restore vault state.

Real-device verify (user, after release): iPhone color dot opens the system picker; stacked rows; badges tappable; strip in place.
