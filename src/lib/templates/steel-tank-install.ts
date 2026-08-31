import { v4 as uuidv4 } from "uuid";
import type { BomSection, JobTemplate, QuoteOption } from "@/types";

export const STEEL_TANK_SECTION_NAMES = [
  "Tank",
  "Tank Delivery",
  "Free Tank Inclusions",
  "Sand Pad / Earthworks",
  "Blue Metal",
  "Water Cartage",
  "Tank Installation",
  "Plumbing In/Out",
  "Pump Installation",
  "UV Installation",
  "Custom Section",
] as const;

export const STEEL_TANK_TEMPLATE_ID = "template-steel-tank-install";
export const BLANK_TEMPLATE_ID = "template-blank";

function createSection(name: string, sortOrder: number, overrides?: Partial<BomSection>): BomSection {
  return {
    id: uuidv4(),
    name,
    enabled: true,
    sortOrder,
    customerLabel: name,
    showOnCustomerQuote: true,
    items: [],
    ...overrides,
  };
}

function createSteelTankOption(name: string, sortOrder: number): QuoteOption {
  return {
    id: uuidv4(),
    name,
    sortOrder,
    sections: STEEL_TANK_SECTION_NAMES.map((name, idx) =>
      createSection(name, idx, {
        enabled: name !== "Pump Installation" && name !== "UV Installation",
        showOnCustomerQuote: !["Free Tank Inclusions"].includes(name),
      })
    ),
  };
}

export function createGenericOption(name: string, sortOrder: number): QuoteOption {
  return {
    id: uuidv4(),
    name,
    sortOrder,
    sections: [createSection("Section 1", 0)],
  };
}

export function createSteelTankInstallTemplate(): JobTemplate {
  return {
    id: STEEL_TANK_TEMPLATE_ID,
    name: "Steel Tank Install",
    kind: "job",
    description: "Steel tank installation with alternative options",
    payload: {
      options: [
        createSteelTankOption("Option 1", 0),
      ],
    },
    createdAt: new Date().toISOString(),
  };
}

export function createBlankQuoteTemplate(): JobTemplate {
  return {
    id: BLANK_TEMPLATE_ID,
    name: "Blank Quote",
    kind: "job",
    description: "One option and one empty section — add your own structure",
    payload: {
      options: [createGenericOption("Option 1", 0)],
    },
    createdAt: new Date().toISOString(),
  };
}

export function getSectionTemplates(): JobTemplate[] {
  const now = new Date().toISOString();
  const sections = [
    "SJ35 Pump Install",
    "Pump Install",
    "UV Install",
    "Sand Pad / Earthworks",
    "Downpipe Connection",
    "Overflow",
    "Water Delivery",
    "Blue Metal",
  ];
  return sections.map((name) => ({
    id: `section-template-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    kind: "section" as const,
    payload: {
      section: createSection(name, 0),
    },
    createdAt: now,
  }));
}

export { createSection, createSteelTankOption };
