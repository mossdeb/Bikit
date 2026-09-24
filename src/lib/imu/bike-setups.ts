import { setupKey, type ImuSetupValues } from "./setup";

/**
 * A bike's setups as the rider used them (2026-09-24, the bike's page
 * under Bikit Pro): the distinct sets of values its sessions point at,
 * each with the sessions that ran on it. Distinct by setupKey and not by
 * row — the table holds a row per save, and the same numbers saved twice
 * are one setup to anyone reading. Rows no session points at are left
 * out: they are saves that were overwritten before a run used them, and
 * nothing rode on them.
 *
 * Lettered A, B, C… by first use, so a letter never moves when a newer
 * session arrives; listed most recently used first, which is the order
 * a rider looks for them in.
 */

export interface BikeSetupRow {
  id: string;
  values: ImuSetupValues;
  note: string | null;
}

export interface BikeSetupSession {
  id: string;
  name: string;
  setupId: string | null;
  createdAt: string;
}

export interface BikeSetup {
  key: string;
  letter: string;
  values: ImuSetupValues;
  /** The latest non-empty note among the rows that make this setup. */
  note: string | null;
  /** Newest first. */
  sessions: BikeSetupSession[];
  firstUsedAt: string;
  lastUsedAt: string;
}

export function groupBikeSetups(
  rows: readonly BikeSetupRow[],
  sessions: readonly BikeSetupSession[],
): BikeSetup[] {
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const byKey = new Map<
    string,
    { values: ImuSetupValues; notes: string[]; sessions: BikeSetupSession[] }
  >();
  const used = [...sessions]
    .filter((s) => s.setupId && rowById.has(s.setupId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const session of used) {
    const row = rowById.get(session.setupId!)!;
    const key = setupKey(row.values);
    let group = byKey.get(key);
    if (!group) {
      group = { values: row.values, notes: [], sessions: [] };
      byKey.set(key, group);
    }
    group.sessions.push(session);
    if (row.note?.trim()) group.notes.push(row.note.trim());
  }
  // Insertion order is first-use order: the letters.
  const setups = [...byKey.entries()].map(([key, g], i) => ({
    key,
    letter: String.fromCharCode(65 + i),
    values: g.values,
    note: g.notes.length > 0 ? g.notes[g.notes.length - 1] : null,
    sessions: [...g.sessions].reverse(),
    firstUsedAt: g.sessions[0].createdAt,
    lastUsedAt: g.sessions[g.sessions.length - 1].createdAt,
  }));
  return setups.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}
