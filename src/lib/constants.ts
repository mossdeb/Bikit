export const BIKE_TYPES = [
  "Road",
  "Gravel",
  "Endurance road",
  "Enduro",
  "XC",
  "Downhill",
  "E-MTB",
  "Urban / Commuter",
  "Other",
] as const;

export type BikeType = (typeof BIKE_TYPES)[number];

// Adding a category here also requires an icon in COMPONENT_CATEGORY_ICON
// (src/components/component-category-icon.tsx) — the map is typed off this list,
// so a missing icon is a build error. The value is what gets stored in
// components.category, which is free text: existing rows are never migrated.
export const COMPONENT_CATEGORIES = [
  "Front Suspension (Fork)",
  "Rear Suspension",
  "Transmission",
  "Electric",
  "Brakes",
  "Brake Pads",
  "Wheels",
  "Tire",
  "Cockpit",
  // Between Cockpit and Frame: contact points together, and it entered the
  // list for AI Auto Setup — droppers were falling into Other, where the
  // maintenance search couldn't tell them from saddles (2026-08-09).
  "Seatpost",
  "Frame",
  "Other",
] as const;

export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];

// Datalist suggestions for the component name field — not an enum, users
// can type anything.
export const COMPONENT_NAME_SUGGESTIONS = [
  "Suspension fork",
  "Rear shock",
  "Drivetrain",
  "Brakes (front)",
  "Brakes (rear)",
  "Chain",
  "Cassette",
  "Tires",
  "Inner tubes",
  "Wheel bearings",
  "Cables & housing",
  "Saddle",
  "Handlebar",
  "Bottom bracket",
] as const;
