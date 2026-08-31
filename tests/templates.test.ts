import { describe, it, expect } from "vitest";
import {
  BLANK_TEMPLATE_ID,
  STEEL_TANK_SECTION_NAMES,
  STEEL_TANK_TEMPLATE_ID,
  createBlankQuoteTemplate,
  createGenericOption,
  createSteelTankInstallTemplate,
  createSteelTankOption,
} from "@/lib/templates/steel-tank-install";
import { cloneTemplateOptions } from "@/lib/templates/clone-options";
import { createOptionForQuote } from "@/lib/templates/create-option-for-quote";
import { addOption } from "@/lib/quote/bom-mutations";
import type { Quote, QuoteOption } from "@/types";

function collectOptionTreeIds(options: QuoteOption[]): {
  optionIds: string[];
  sectionIds: string[];
  itemIds: string[];
} {
  const optionIds: string[] = [];
  const sectionIds: string[] = [];
  const itemIds: string[] = [];
  for (const option of options) {
    optionIds.push(option.id);
    for (const section of option.sections) {
      sectionIds.push(section.id);
      for (const item of section.items) {
        itemIds.push(item.id);
      }
    }
  }
  return { optionIds, sectionIds, itemIds };
}

function sampleQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: "quote-1",
    quoteNumber: "100",
    quoteDate: "2026-08-31",
    status: "draft",
    customer: { name: "Test" },
    delivery: {},
    scopeText: "",
    options: createBlankQuoteTemplate().payload.options ?? [],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("job templates", () => {
  it("steel tank install keeps all steel-tank sections", () => {
    const template = createSteelTankInstallTemplate();
    expect(template.payload.options).toHaveLength(1);
    const sections = template.payload.options![0].sections;
    expect(sections).toHaveLength(STEEL_TANK_SECTION_NAMES.length);
    expect(sections.map((s) => s.name)).toEqual([...STEEL_TANK_SECTION_NAMES]);
    expect(sections.every((s) => s.items.length === 0)).toBe(true);
  });

  it("blank quote is one option with one generic section and no steel-tank names", () => {
    const template = createBlankQuoteTemplate();
    expect(template.payload.options).toHaveLength(1);
    const option = template.payload.options![0];
    expect(option.sections).toHaveLength(1);
    expect(option.sections[0].name).toBe("Section 1");
    expect(option.sections[0].items).toHaveLength(0);

    const steelNames = new Set(STEEL_TANK_SECTION_NAMES);
    for (const section of option.sections) {
      expect(steelNames.has(section.name as (typeof STEEL_TANK_SECTION_NAMES)[number])).toBe(false);
    }
  });

  it("createGenericOption differs from createSteelTankOption", () => {
    const generic = createGenericOption("Option A", 0);
    const steel = createSteelTankOption("Option B", 0);
    expect(generic.sections).toHaveLength(1);
    expect(steel.sections.length).toBeGreaterThan(1);
  });
});

describe("cloneTemplateOptions", () => {
  it("assigns fresh ids while preserving structure and values", () => {
    const source = createSteelTankInstallTemplate().payload.options!;
    const cloned = cloneTemplateOptions(source);

    expect(cloned).toHaveLength(source.length);
    expect(cloned[0].id).not.toBe(source[0].id);
    expect(cloned[0].name).toBe(source[0].name);
    expect(cloned[0].sections).toHaveLength(source[0].sections.length);
    expect(cloned[0].sections[0].id).not.toBe(source[0].sections[0].id);
    expect(cloned[0].sections[0].name).toBe(source[0].sections[0].name);
    expect(cloned[0].sections[0].customerPricingGroup).toBe(
      source[0].sections[0].customerPricingGroup
    );
  });

  it("clones items with fresh ids", () => {
    const source = createSteelTankInstallTemplate().payload.options!;
    source[0].sections[0].items.push({
      id: "item-1",
      description: "Test tank",
      quantity: 1,
      sellEach: 100,
      pricingState: "normal",
      productId: "catalogue-product-42",
    });

    const cloned = cloneTemplateOptions(source);
    expect(cloned[0].sections[0].items).toHaveLength(1);
    expect(cloned[0].sections[0].items[0].id).not.toBe("item-1");
    expect(cloned[0].sections[0].items[0].description).toBe("Test tank");
    expect(cloned[0].sections[0].items[0].sellEach).toBe(100);
    expect(cloned[0].sections[0].items[0].productId).toBe("catalogue-product-42");
  });

  it("does not reuse any source option, section or item ids", () => {
    const source = createSteelTankInstallTemplate().payload.options!;
    source[0].sections[0].items.push({
      id: "item-a",
      description: "Line 1",
      quantity: 2,
      sellEach: 50,
      pricingState: "normal",
    });
    source.push(createSteelTankOption("Option 2", 1));

    const sourceIds = collectOptionTreeIds(source);
    const cloned = cloneTemplateOptions(source);
    const clonedIds = collectOptionTreeIds(cloned);

    const allSource = [...sourceIds.optionIds, ...sourceIds.sectionIds, ...sourceIds.itemIds];
    const allCloned = [...clonedIds.optionIds, ...clonedIds.sectionIds, ...clonedIds.itemIds];

    expect(new Set(allCloned).size).toBe(allCloned.length);
    for (const id of allCloned) {
      expect(allSource).not.toContain(id);
    }
  });
});

describe("createOptionForQuote", () => {
  it("uses steel-tank sections for steel tank install quotes", () => {
    const option = createOptionForQuote(
      { templateId: STEEL_TANK_TEMPLATE_ID },
      "Option 2",
      1
    );
    expect(option.sections).toHaveLength(STEEL_TANK_SECTION_NAMES.length);
  });

  it("uses one generic section for blank quotes", () => {
    const option = createOptionForQuote({ templateId: BLANK_TEMPLATE_ID }, "Option 2", 1);
    expect(option.sections).toHaveLength(1);
    expect(option.sections[0].name).toBe("Section 1");
    expect(option.sections[0].items).toHaveLength(0);
  });

  it("uses generic option for saved custom template quotes", () => {
    const option = createOptionForQuote(
      { templateId: "a1b2c3d4-custom-template-uuid" },
      "Option 2",
      1
    );
    expect(option.sections).toHaveLength(1);
    expect(option.sections[0].items).toHaveLength(0);
  });

  it("uses generic option when templateId is missing", () => {
    const option = createOptionForQuote({}, "Option 2", 1);
    expect(option.sections).toHaveLength(1);
  });
});

describe("addOption", () => {
  it("adds steel-tank option structure to steel tank quotes", () => {
    const quote = sampleQuote({ templateId: STEEL_TANK_TEMPLATE_ID });
    const next = addOption(quote, "Option 2");
    expect(next.options).toHaveLength(2);
    expect(next.options[0].sections).toHaveLength(1);
    expect(next.options[1].sections).toHaveLength(STEEL_TANK_SECTION_NAMES.length);
  });

  it("adds generic option structure to blank quotes without changing existing options", () => {
    const quote = sampleQuote({ templateId: BLANK_TEMPLATE_ID });
    const beforeFirst = quote.options[0].sections.map((s) => s.name);
    const next = addOption(quote, "Option 2");
    expect(next.options[0].sections.map((s) => s.name)).toEqual(beforeFirst);
    expect(next.options[1].sections).toHaveLength(1);
    expect(next.options[1].sections[0].items).toHaveLength(0);
  });
});
