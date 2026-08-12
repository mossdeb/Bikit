import { describe, expect, it } from "vitest";
import { splitComponentNaming } from "./component-name";

describe("splitComponentNaming", () => {
  it("uses brand and model alone when there is no variant", () => {
    expect(splitComponentNaming("Fox", "36")).toEqual({ name: "Fox 36", model: "36", notes: null });
  });

  it("keeps a short variant in the name — it is what tells two parts apart", () => {
    // A groupset gives four parts one model and separates them only here.
    expect(splitComponentNaming("SRAM", "GX Eagle T-Type", "long cage")).toEqual({
      name: "SRAM GX Eagle T-Type long cage",
      model: "GX Eagle T-Type",
      notes: null,
    });
  });

  it("moves spec prose to the notes, whole", () => {
    // The Cannondale Moterra SL 2024, as the catalog stores it.
    const variant =
      "160mm travel, Grip2 Damper, Kashima coating, 15x110mm Kabolt thru-axle, tapered steerer, 44mm offset";
    expect(splitComponentNaming("Fox", "Float Factory 36", variant)).toEqual({
      name: "Fox Float Factory 36",
      model: "Float Factory 36",
      notes: variant,
    });
  });

  it("does not split a long variant that has separators", () => {
    // The first item is not promoted into the name — the mockup keeps the
    // name to brand + model and shows the whole variant underneath.
    const variant = "Crankset; 165 mm crank arms; 34T chainring; DUB Custom spindle";
    expect(splitComponentNaming("SRAM", "X01 DH", variant)).toEqual({
      name: "SRAM X01 DH",
      model: "X01 DH",
      notes: variant,
    });
  });

  it("keeps a variant of exactly the limit in the name", () => {
    const variant = "a".repeat(30);
    expect(splitComponentNaming("B", "M", variant).notes).toBeNull();
    expect(splitComponentNaming("B", "M", "a".repeat(31)).notes).toBe("a".repeat(31));
  });

  it("keeps the model free of the variant in every case", () => {
    const long = "160mm travel, Grip2 Damper, Kashima coating, 15x110mm Kabolt thru-axle, tapered steerer";
    expect(splitComponentNaming("Fox", "Float Factory 36", long).model).toBe("Float Factory 36");
    expect(splitComponentNaming("Fox", "Float Factory 36", "160mm").model).toBe("Float Factory 36");
  });

  it("trims stray whitespace and a trailing separator", () => {
    expect(splitComponentNaming("  Fox  ", " 36 ", "  160mm travel,   ")).toEqual({
      name: "Fox 36 160mm travel",
      model: "36",
      notes: null,
    });
  });
});
