// Touch reorder path: HTML5 drag-and-drop never fires from touch in the mobile WebView, so
// the grip handles also start a pointer-event drag (mouse keeps the native HTML5 path).
// Both paths resolve hovers and drops through the same per-target HitTest closures, so the
// reorder logic of every target exists exactly once. Edge auto-scroll while dragging is
// deliberately out: it needs a rAF loop (pointermove stops repeating while the finger rests
// at an edge); long jumps work as multi-hop drags or via the "Move to group" menu.

export type DropIndicatorClass =
  | "is-drop-before"
  | "is-drop-after"
  | "is-drop-target"
  | "ribbon-organizer-is-drop-into";

// What dropping the payload at this point would do: the indicator to show while hovering,
// and the action to run on release. null = this target rejects the payload.
export interface DropHit {
  cls: DropIndicatorClass;
  drop: () => void;
}

export type HitTest<P> = (payload: P, clientY: number) => DropHit | null;

export interface PointerDragList<P> {
  wireHandle(handle: HTMLElement, sourceEl: HTMLElement, payload: P): void;
  wireTarget(el: HTMLElement, hitAt: HitTest<P>): void;
}

const SOURCE_CLASS = "ribbon-organizer-drag-source";

// One instance per section render: the registry dies with the DOM it points into (every
// drop persists and re-renders, which builds a fresh instance), so it can never go stale.
export function createPointerDragList<P>(): PointerDragList<P> {
  const targets: { el: HTMLElement; hitAt: HitTest<P> }[] = [];
  let active: { payload: P; sourceEl: HTMLElement; pointerId: number } | null = null;
  let indicator: { el: HTMLElement; cls: DropIndicatorClass } | null = null;

  const clearIndicator = (): void => {
    indicator?.el.removeClass(indicator.cls);
    indicator = null;
  };

  const hitAtPoint = (clientX: number, clientY: number): { el: HTMLElement; hit: DropHit } | null => {
    if (active === null) return null;
    // Hit-test in the source element's own document, not the global one: the plugin runs in
    // the main window, but Obsidian 1.13 opens Settings in a window of its own.
    // Collapsed/filtered rows are display:none and never returned here, which preserves the
    // drop-on-collapsed-header-appends semantics of the HTML5 path.
    const under = active.sourceEl.ownerDocument.elementFromPoint(clientX, clientY);
    if (under === null) return null;
    for (const t of targets) {
      if (!t.el.contains(under)) continue;
      const hit = t.hitAt(active.payload, clientY);
      return hit === null ? null : { el: t.el, hit };
    }
    return null;
  };

  const finish = (): void => {
    clearIndicator();
    active?.sourceEl.removeClass(SOURCE_CLASS);
    active = null;
  };

  return {
    wireTarget(el: HTMLElement, hitAt: HitTest<P>): void {
      targets.push({ el, hitAt });
    },
    wireHandle(handle: HTMLElement, sourceEl: HTMLElement, payload: P): void {
      handle.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" || active !== null) return; // mouse keeps native HTML5 drag; one touch drags at a time
        e.preventDefault(); // no iOS selection callout, no compatibility mouse events; scroll is blocked by the grip's touch-action
        handle.setPointerCapture(e.pointerId);
        active = { payload, sourceEl, pointerId: e.pointerId };
        sourceEl.addClass(SOURCE_CLASS);
      });
      // Pointer capture retargets every later pointer event to the handle, so the drag's
      // move/end listeners all live here.
      handle.addEventListener("pointermove", (e) => {
        if (active === null || e.pointerId !== active.pointerId) return;
        const found = hitAtPoint(e.clientX, e.clientY);
        if (found === null) {
          clearIndicator();
          return;
        }
        if (indicator !== null && (indicator.el !== found.el || indicator.cls !== found.hit.cls)) clearIndicator();
        if (indicator === null) {
          found.el.addClass(found.hit.cls);
          indicator = { el: found.el, cls: found.hit.cls };
        }
      });
      handle.addEventListener("pointerup", (e) => {
        if (active === null || e.pointerId !== active.pointerId) return;
        const found = hitAtPoint(e.clientX, e.clientY); // decide from the release point, not the last hover
        finish();
        found?.hit.drop();
      });
      const cancel = (e: PointerEvent): void => {
        if (active === null || e.pointerId !== active.pointerId) return;
        finish(); // cleanup only — a stolen or lost pointer never drops
      };
      handle.addEventListener("pointercancel", cancel);
      handle.addEventListener("lostpointercapture", cancel);
      // While a pointer drag is active: no Android long-press menu, and no synthesized
      // native drag on desktop touchscreens racing this path.
      const swallow = (e: Event): void => {
        if (active !== null) e.preventDefault();
      };
      handle.addEventListener("contextmenu", swallow);
      handle.addEventListener("dragstart", swallow);
    },
  };
}
