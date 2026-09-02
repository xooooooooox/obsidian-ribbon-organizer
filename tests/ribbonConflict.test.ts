import { describe, expect, it } from "vitest";
import { pushReapplySample } from "../src/core/ribbonConflict";

describe("pushReapplySample", () => {
  it("keeps only samples inside the window and includes the new one", () => {
    const { samples } = pushReapplySample([0, 400, 900], 1000, 1000, 30);
    expect(samples).toEqual([400, 900, 1000]);
  });

  it("does not trip at exactly the limit", () => {
    const base = Array.from({ length: 30 }, (_, i) => i);
    // 29 retained + the new one = 30 = limit → not tripped
    const { tripped, samples } = pushReapplySample(base.slice(0, 29), 500, 1000, 30);
    expect(samples.length).toBe(30);
    expect(tripped).toBe(false);
  });

  it("trips once the window holds more than the limit", () => {
    const base = Array.from({ length: 30 }, (_, i) => 100 + i);
    const { tripped } = pushReapplySample(base, 500, 1000, 30);
    expect(tripped).toBe(true);
  });

  it("does not trip when a burst is spread beyond the window", () => {
    // 40 samples but only the last few fall inside the 1000ms window ending at 40000
    const spread = Array.from({ length: 40 }, (_, i) => i * 1000);
    const { tripped, samples } = pushReapplySample(spread, 40000, 1000, 30);
    expect(samples).toEqual([40000]);
    expect(tripped).toBe(false);
  });

  it("does not mutate the input array", () => {
    const input = [1, 2, 3];
    pushReapplySample(input, 10, 1000, 30);
    expect(input).toEqual([1, 2, 3]);
  });
});
