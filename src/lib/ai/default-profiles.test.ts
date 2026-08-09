import { describe, expect, it } from "vitest";
import { defaultIntervalsFor } from "./default-profiles";

describe("defaultIntervalsFor", () => {
  it("gives wheels a quarterly spoke check on hard-use bikes", () => {
    for (const type of ["Enduro", "Downhill", "E-MTB"]) {
      expect(defaultIntervalsFor("Wheels", type)).toEqual([
        { name: "Spoke Tension Check", type: "months", interval: 3 },
      ]);
    }
  });

  it("gives wheels a yearly spoke check on gentle-use bikes", () => {
    for (const type of ["Road", "Gravel", "XC", "Endurance road", "Urban / Commuter", "Other"]) {
      expect(defaultIntervalsFor("Wheels", type)).toEqual([
        { name: "Spoke Tension Check", type: "months", interval: 12 },
      ]);
    }
  });

  it("scales brake cadences by ride style, three reminders filling the three slots", () => {
    expect(defaultIntervalsFor("Brakes", "E-MTB")).toEqual([
      { name: "Brake Bleed", type: "months", interval: 6 },
      { name: "Piston Cleaning & Lubrication", type: "months", interval: 6 },
      { name: "Caliper Full Service", type: "months", interval: 18 },
    ]);
    expect(defaultIntervalsFor("Brakes", "Road")).toEqual([
      { name: "Brake Bleed", type: "months", interval: 12 },
      { name: "Piston Cleaning & Lubrication", type: "months", interval: 12 },
      { name: "Caliper Full Service", type: "months", interval: 36 },
    ]);
    expect(defaultIntervalsFor("Brakes", "Downhill")).toEqual([
      { name: "Brake Bleed", type: "months", interval: 3 },
      { name: "Piston Cleaning & Lubrication", type: "months", interval: 3 },
      { name: "Caliper Full Service", type: "months", interval: 12 },
    ]);
  });

  it("gives every drivetrain a monthly clean and a per-ride (3h) chain lube", () => {
    for (const type of ["Road", "E-MTB", "Downhill"]) {
      expect(defaultIntervalsFor("Transmission", type)).toEqual([
        { name: "Drivetrain Cleaning", type: "months", interval: 1 },
        { name: "Chain Lube", type: "hours", interval: 3 },
      ]);
    }
  });

  it("falls back to the middle-of-the-table brake cadence for an unknown bike type", () => {
    expect(defaultIntervalsFor("Brakes", "Recumbent")).toEqual(defaultIntervalsFor("Brakes", "Gravel"));
  });

  it("has no defaults for other categories — they take the catalog/AI path", () => {
    expect(defaultIntervalsFor("Front Suspension (Fork)", "Enduro")).toBeNull();
    expect(defaultIntervalsFor("Tire", "Road")).toBeNull();
    expect(defaultIntervalsFor("Brake Pads", "Enduro")).toBeNull();
  });
});
