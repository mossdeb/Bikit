import { describe, expect, it } from "vitest";
import { pickSetupComparison } from "./setup-compare";
import type { SnapshotTrackIndex } from "./snapshot";

const line = (lonEnd: number, lat = 41): SnapshotTrackIndex => ({
  bounds: { minLat: lat, maxLat: lat, minLon: -8, maxLon: -8 + lonEnd },
  outline: [
    [lat, -8],
    [lat, -8 + lonEnd],
  ],
});
const A = { fork: { pressurePsi: 80 } };
const B = { fork: { pressurePsi: 85 } };
const session = (
  id: string,
  setup: typeof A | null,
  trackIndex: SnapshotTrackIndex | null,
  riderName: string | null = "Miguel",
) => ({ id, name: id, riderName, setup, trackIndex });

describe("pickSetupComparison", () => {
  const here = line(0.01);
  const elsewhere = line(0.01, 42);

  it("takes the newest earlier run on another setup along the same trail", () => {
    const { pick, reason } = pickSetupComparison(
      session("now", A, here),
      [
        session("same-setup", A, here),
        session("other-trail", B, elsewhere),
        session("other-rider", B, here, "Rui"),
        session("match", B, here),
        session("older-match", B, here),
      ],
      "pt",
    );
    expect(pick?.id).toBe("match");
    expect(reason).toBeNull();
  });

  it("says why when there is nothing to set against", () => {
    expect(
      pickSetupComparison(session("now", null, here), [], "pt").reason,
    ).toMatch(/Regista/);
    expect(
      pickSetupComparison(
        session("now", A, here),
        [session("x", A, here)],
        "pt",
      ).reason,
    ).toMatch(/outra volta/);
    expect(
      pickSetupComparison(
        session("now", A, null),
        [session("x", B, here)],
        "pt",
      ).reason,
    ).toMatch(/Sem GPS/);
    expect(
      pickSetupComparison(
        session("now", A, here),
        [session("R0001", B, elsewhere)],
        "pt",
      ).reason,
    ).toMatch(/R0001.*noutra pista/);
  });

  it("says why in the reader's language", () => {
    expect(
      pickSetupComparison(session("now", null, here), [], "en").reason,
    ).toMatch(/Record this run's setup/);
    expect(
      pickSetupComparison(
        session("now", A, here),
        [session("R0001", B, elsewhere)],
        "en",
      ).reason,
    ).toMatch(/R0001.*another trail/);
  });
});
