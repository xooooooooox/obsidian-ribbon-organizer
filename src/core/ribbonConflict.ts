// Plugins known to rearrange the left ribbon's DOM themselves (moving the icon elements into
// their own wrappers). Their re-apply watcher and ours trigger each other: every pass one
// side makes is a change the other reacts to, synchronously, before the browser can paint —
// on a real device that exchange freezes the whole app (reported in issue #1 with Open Ribbon
// Groups on an iPad). Grouping stands down while one of these is enabled; the burst breaker
// below is the backstop for arrangers not on this list.
export const RIBBON_ARRANGER_PLUGINS: readonly { id: string; name: string }[] = [
  { id: "ribbon-groups", name: "Open Ribbon Groups" },
];

// Thresholds for the burst breaker: more than REAPPLY_BURST_LIMIT observer-triggered
// re-applies inside REAPPLY_BURST_WINDOW_MS means another plugin is rearranging the ribbon in
// a loop with this one. A mutual loop fires hundreds of times per second; ordinary churn (a
// vault's worth of plugins adding icons during startup) coalesces to a few observer callbacks
// per second, far under the limit.
export const REAPPLY_BURST_WINDOW_MS = 1000;
export const REAPPLY_BURST_LIMIT = 30;

// Records one observer-triggered re-apply at `now` and reports whether the burst threshold is
// crossed. Pure: returns the retained samples (those still inside the window, plus `now`)
// instead of mutating the input.
export function pushReapplySample(
  samples: readonly number[],
  now: number,
  windowMs: number,
  limit: number
): { samples: number[]; tripped: boolean } {
  const kept = samples.filter((t) => now - t < windowMs);
  kept.push(now);
  return { samples: kept, tripped: kept.length > limit };
}
