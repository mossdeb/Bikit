import { describe, expect, it } from "vitest";
import { runTrackId } from "./track-candidates";

// The one track a run counts on (2026-11-15), as every list of runs reads it.
describe("runTrackId", () => {
  const run = (ms: number) => [{ entryMs: 0, exitMs: ms, durationMs: ms }];
  const casaDh = { id: "dh", name: "Casa DH race" };
  const casaVelha = { id: "cv", name: "Casa Velha" };
  const passed = [
    { track: casaDh, runs: run(154_000) },
    { track: casaVelha, runs: run(72_000) },
  ];

  it("keeps the track the rider chose, while the run passes it", () => {
    expect(
      runTrackId(passed, {
        name: "R0108 - casa velha",
        trackId: "dh",
        trackByHand: true,
      }),
    ).toBe("dh");
  });

  it("chooses again when the chosen track no longer counts the run", () => {
    expect(
      runTrackId(passed, {
        name: "R0108 - casa velha",
        trackId: "gone",
        trackByHand: true,
      }),
    ).toBe("cv");
  });

  it("chooses by the run's name, else by the stretch covered", () => {
    const auto = { trackId: null, trackByHand: false };
    expect(runTrackId(passed, { ...auto, name: "R0139 - Casa Velha" })).toBe(
      "cv",
    );
    expect(runTrackId(passed, { ...auto, name: "R0213" })).toBe("dh");
  });

  it("has no track for a run that passes none", () => {
    expect(
      runTrackId([{ track: casaDh, runs: [] }], {
        name: "R0060 - Casa DH",
        trackId: "dh",
        trackByHand: false,
      }),
    ).toBeNull();
  });
});
