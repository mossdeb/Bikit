import { describe, expect, it } from "vitest";
import { AI_BIKE_SEARCHES_PER_MONTH, computeAllowance, startOfMonthUtcIso } from "./quota";

describe("computeAllowance", () => {
  it("gives each plan its monthly quota", () => {
    expect(AI_BIKE_SEARCHES_PER_MONTH).toEqual({ free: 1, personal: 5, pro: 10 });
    expect(computeAllowance([], "free").remaining).toBe(1);
    expect(computeAllowance([], "personal").remaining).toBe(5);
    expect(computeAllowance([], "pro").remaining).toBe(10);
  });

  it("only successful searches spend quota", () => {
    const outcomes = ["found", "not_found", "invalid", "error"];
    expect(computeAllowance(outcomes, "personal")).toEqual({ allowed: true, remaining: 4 });
  });

  it("blocks free after its single success", () => {
    expect(computeAllowance(["found"], "free")).toEqual({ allowed: false, remaining: 0 });
  });

  it("blocks on the attempts ceiling even with quota left", () => {
    // 2 attempts (2× the free quota) that all failed: quota untouched but
    // the cost-protection ceiling closes the door.
    const outcomes = ["not_found", "error"];
    expect(computeAllowance(outcomes, "free")).toEqual({ allowed: false, remaining: 1 });
    // Personal gets 10 attempts: 9 failures still leave the door open.
    expect(computeAllowance(Array(9).fill("not_found"), "personal").allowed).toBe(true);
    expect(computeAllowance(Array(10).fill("not_found"), "personal").allowed).toBe(false);
  });

  it("keeps pro open through a personal-sized month", () => {
    const outcomes = Array(5).fill("found");
    expect(computeAllowance(outcomes, "pro")).toEqual({ allowed: true, remaining: 5 });
  });
});

describe("startOfMonthUtcIso", () => {
  it("returns the first of the current UTC month at midnight", () => {
    const iso = startOfMonthUtcIso();
    const date = new Date(iso);
    const now = new Date();
    expect(date.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(date.getUTCMonth()).toBe(now.getUTCMonth());
    expect(date.getUTCDate()).toBe(1);
    expect(iso.endsWith("T00:00:00.000Z")).toBe(true);
  });
});
