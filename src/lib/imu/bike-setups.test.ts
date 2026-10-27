import { describe, expect, it } from "vitest";
import { groupBikeSetups } from "./bike-setups";

describe("groupBikeSetups", () => {
  const a = { fork: { pressurePsi: 100, compressionLow: 10 } };
  const b = { fork: { pressurePsi: 100, compressionLow: 12 } };
  const rows = [
    { id: "r1", values: a, note: null },
    // The same numbers saved again on another day: one setup, not two.
    { id: "r2", values: a, note: "a segunda vez" },
    { id: "r3", values: b, note: null },
    // Never ridden: a save overwritten before a run used it.
    { id: "r4", values: { fork: { pressurePsi: 90 } }, note: null },
  ];
  const sessions = [
    {
      id: "s1",
      name: "Run 1",
      setupId: "r1",
      createdAt: "2026-09-09T10:00:00Z",
    },
    {
      id: "s2",
      name: "Run 2",
      setupId: "r3",
      createdAt: "2026-09-10T10:00:00Z",
    },
    {
      id: "s3",
      name: "Run 3",
      setupId: "r2",
      createdAt: "2026-09-11T10:00:00Z",
    },
    {
      id: "s4",
      name: "Run 4",
      setupId: null,
      createdAt: "2026-09-12T10:00:00Z",
    },
  ];

  it("groups by values, letters by first use, lists most recently used first", () => {
    const setups = groupBikeSetups(rows, sessions);
    expect(setups.map((s) => s.letter)).toEqual(["A", "B"]);
    // A was ridden first and last; B in between. Newest use first.
    expect(setups[0].sessions.map((s) => s.name)).toEqual(["Run 3", "Run 1"]);
    expect(setups[0].firstUsedAt).toBe("2026-09-09T10:00:00Z");
    expect(setups[0].lastUsedAt).toBe("2026-09-11T10:00:00Z");
    expect(setups[0].note).toBe("a segunda vez");
    expect(setups[1].sessions.map((s) => s.name)).toEqual(["Run 2"]);
    expect(setups[1].note).toBeNull();
  });

  it("leaves out the rows no session rode on, and a session without a setup", () => {
    const setups = groupBikeSetups(rows, sessions);
    expect(setups.some((s) => s.values.fork?.pressurePsi === 90)).toBe(false);
    expect(groupBikeSetups(rows, [sessions[3]])).toEqual([]);
    expect(groupBikeSetups([], sessions)).toEqual([]);
  });

  it("lists the bike's latest setup as upcoming when no session used it", () => {
    const dated = [
      ...rows.slice(0, 3).map((r, i) => ({
        ...r,
        createdAt: `2026-09-0${i + 1}T10:00:00Z`,
      })),
      {
        id: "r5",
        values: { fork: { pressurePsi: 95 } },
        note: " para amanhã ",
        createdAt: "2026-10-27T10:00:00Z",
      },
    ];
    const setups = groupBikeSetups(dated, sessions);
    expect(setups[0]).toMatchObject({
      letter: "C",
      upcoming: true,
      sessions: [],
      note: "para amanhã",
      lastUsedAt: "2026-10-27T10:00:00Z",
    });
    expect(setups.slice(1).map((s) => s.letter)).toEqual(["A", "B"]);
    // Once its values are a session's, it is that setup and not upcoming.
    const ridden = groupBikeSetups(
      [...dated.slice(0, 3), { ...dated[3], values: a }],
      sessions,
    );
    expect(ridden.some((s) => s.upcoming)).toBe(false);
  });

  it("carries the setup's own name, the latest given", () => {
    const named = [
      { ...rows[0], name: "Treino" },
      { ...rows[1], name: " Corrida " },
      rows[2],
    ];
    const setups = groupBikeSetups(named, sessions);
    expect(setups.find((s) => s.letter === "A")?.name).toBe("Corrida");
    expect(setups.find((s) => s.letter === "B")?.name).toBeNull();
  });
});
