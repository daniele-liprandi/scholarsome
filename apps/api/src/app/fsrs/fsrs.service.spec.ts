import { FsrsService } from "./fsrs.service";

describe("FsrsService.computeAvgDuration", () => {
  it("returns durationMs when reps is 1 (first review)", () => {
    expect(FsrsService.computeAvgDuration(null, 5000, 1)).toBe(5000);
  });

  it("returns durationMs when prevAvg is null regardless of reps", () => {
    expect(FsrsService.computeAvgDuration(null, 8000, 3)).toBe(8000);
  });

  it("computes rolling average correctly for second review", () => {
    // reps=2: (4000 * 1 + 8000) / 2 = 6000
    expect(FsrsService.computeAvgDuration(4000, 8000, 2)).toBe(6000);
  });

  it("computes rolling average correctly for third review", () => {
    // reps=3: (6000 * 2 + 3000) / 3 = 5000
    expect(FsrsService.computeAvgDuration(6000, 3000, 3)).toBe(5000);
  });

  it("rounds the result to the nearest millisecond", () => {
    // reps=3: (5000 * 2 + 4000) / 3 = 4666.6... → 4667
    expect(FsrsService.computeAvgDuration(5000, 4000, 3)).toBe(4667);
  });
});
