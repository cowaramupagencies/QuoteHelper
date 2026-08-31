import { describe, it, expect } from "vitest";
import {
  buildCustomerQuoteLines,
  calculateItemPricing,
  calculateOptionTotals,
  calculateSectionTotals,
  duplicateOption,
  safeDivide,
} from "@/lib/pricing/calculations";
import type { BomItem, QuoteOption } from "@/types";

describe("pricing calculations", () => {
  it("calculates sell total from qty and sell each", () => {
    const item = calculateItemPricing({
      id: "1",
      description: "Test",
      quantity: 2,
      sellEach: 100,
      pricingState: "normal",
    });
    expect(item.sellTotal).toBe(200);
  });

  it("applies markup to derive sell each", () => {
    const item = calculateItemPricing({
      id: "1",
      description: "Test",
      quantity: 1,
      costEach: 100,
      markupPercent: 10,
      pricingState: "normal",
    });
    expect(item.sellEach).toBe(110);
    expect(item.sellTotal).toBe(110);
  });

  it("handles FREE without divide-by-zero", () => {
    const item = calculateItemPricing({
      id: "1",
      description: "Free item",
      quantity: 1,
      costEach: 0,
      pricingState: "free",
    });
    expect(item.sellTotal).toBe(0);
    expect(item.marginPercent).toBeNull();
  });

  it("handles zero sell without divide-by-zero", () => {
    expect(safeDivide(10, 0)).toBeNull();
    const item = calculateItemPricing({
      id: "1",
      description: "Zero",
      quantity: 1,
      costEach: 0,
      sellEach: 0,
      pricingState: "normal",
    });
    expect(item.marginPercent).toBeNull();
  });

  it("rolls up option totals with GST", () => {
    const option: QuoteOption = {
      id: "opt1",
      name: "Option 1",
      sortOrder: 0,
      sections: [
        {
          id: "s1",
          name: "Tank",
          enabled: true,
          sortOrder: 0,
          showOnCustomerQuote: true,
          items: [
            {
              id: "i1",
              description: "Tank",
              quantity: 1,
              sellEach: 1000,
              pricingState: "normal",
            },
          ],
        },
      ],
    };
    const totals = calculateOptionTotals(option);
    expect(totals.sellExGst).toBe(1000);
    expect(totals.gst).toBe(100);
    expect(totals.sellIncGst).toBe(1100);
  });
});

describe("customer quote pricing modes", () => {
  const option: QuoteOption = {
    id: "opt1",
    name: "Option 1",
    sortOrder: 0,
    sections: [
      {
        id: "s1",
        name: "Tank",
        enabled: true,
        sortOrder: 0,
        showOnCustomerQuote: true,
        items: [{ id: "i1", description: "Tank", quantity: 1, sellEach: 1000, pricingState: "normal" }],
      },
      {
        id: "s2",
        name: "Delivery",
        enabled: true,
        sortOrder: 1,
        showOnCustomerQuote: true,
        customerPricingGroup: "Tank package",
        items: [{ id: "i2", description: "Delivery", quantity: 1, sellEach: 200, pricingState: "normal" }],
      },
      {
        id: "s3",
        name: "Install",
        enabled: true,
        sortOrder: 2,
        showOnCustomerQuote: true,
        customerPricingGroup: "Tank package",
        items: [{ id: "i3", description: "Install", quantity: 1, sellEach: 300, pricingState: "normal" }],
      },
    ],
  };

  it("itemises each section", () => {
    const lines = buildCustomerQuoteLines(option, "itemised");
    expect(lines).toHaveLength(3);
    expect(lines[0].label).toBe("Tank");
  });

  it("combines grouped sections", () => {
    const lines = buildCustomerQuoteLines(option, "grouped");
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.label === "Tank package")?.exGst).toBe(500);
  });

  it("returns no lines for single total mode", () => {
    expect(buildCustomerQuoteLines(option, "single_total")).toHaveLength(0);
  });
});

describe("section totals", () => {
  it("rolls up cost and sell for a section", () => {
    const totals = calculateSectionTotals({
      id: "s1",
      name: "Tank",
      enabled: true,
      sortOrder: 0,
      showOnCustomerQuote: true,
      items: [
        {
          id: "i1",
          description: "Tank",
          quantity: 1,
          costEach: 8000,
          sellEach: 9000,
          pricingState: "normal",
        },
        {
          id: "i2",
          description: "Delivery",
          quantity: 1,
          costEach: 200,
          sellEach: 250,
          pricingState: "normal",
        },
      ],
    });
    expect(totals.costTotal).toBe(8200);
    expect(totals.sellExGst).toBe(9250);
    expect(totals.marginDollar).toBe(1050);
  });
});

describe("duplicateOption", () => {
  it("copies sections and items with new ids", () => {
    const option: QuoteOption = {
      id: "opt1",
      name: "Option 1",
      sortOrder: 0,
      sections: [
        {
          id: "s1",
          name: "Tank",
          enabled: true,
          sortOrder: 0,
          showOnCustomerQuote: true,
          items: [
            {
              id: "i1",
              description: "RT60",
              quantity: 1,
              sellEach: 9690.91,
              pricingState: "normal",
            },
          ],
        },
      ],
    };
    const dup = duplicateOption(option, "Option 2");
    expect(dup.id).not.toBe(option.id);
    expect(dup.name).toBe("Option 2");
    expect(dup.sections[0].id).not.toBe("s1");
    expect(dup.sections[0].items[0].id).not.toBe("i1");
    expect(dup.sections[0].items[0].sellEach).toBe(9690.91);
  });
});

describe("POA items", () => {
  it("excludes POA from sell totals", () => {
    const item: BomItem = calculateItemPricing({
      id: "1",
      description: "Custom",
      quantity: 1,
      pricingState: "poa",
    });
    expect(item.sellTotal).toBeNull();
  });
});
