import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "@/types/database.types";
import { NOTICE_ID } from "./notice";
import { noticeIsDue } from "./notice-due";

function client(opts: {
  userId?: string;
  accepted?: string[];
  failing?: boolean;
}) {
  const asked: Record<string, string> = {};
  const query = {
    select: () => query,
    eq: (column: string, value: string) => {
      asked[column] = value;
      return query;
    },
    maybeSingle: async () => ({
      data: opts.accepted?.includes(asked.notice)
        ? { notice: asked.notice }
        : null,
      error: opts.failing ? { message: "down" } : null,
    }),
  };
  return {
    auth: {
      getClaims: async () => ({
        data: opts.userId ? { claims: { sub: opts.userId } } : null,
      }),
    },
    from: () => query,
  } as unknown as SupabaseClient<Database>;
}

describe("the notice at sign-in", () => {
  it("shows at the first sign-in", async () => {
    expect(await noticeIsDue(client({ userId: "u" }))).toBe(true);
  });

  it("does not show once this version is accepted", async () => {
    expect(
      await noticeIsDue(client({ userId: "u", accepted: [NOTICE_ID] })),
    ).toBe(false);
  });

  it("shows again when the text is a new version", async () => {
    expect(
      await noticeIsDue(client({ userId: "u", accepted: ["older-text"] })),
    ).toBe(true);
  });

  it("shows when the record cannot be read", async () => {
    expect(
      await noticeIsDue(
        client({ userId: "u", accepted: [NOTICE_ID], failing: true }),
      ),
    ).toBe(true);
  });
});
