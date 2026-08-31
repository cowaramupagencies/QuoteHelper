import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BomItem, Product, Quote } from "@/types";
import {
  applyQuotePriceRefresh,
  previewQuotePriceRefresh,
  proposeUpdatedBomItem,
} from "@/lib/quote/refresh-prices";

const mockGetProduct = vi.fn();
const mockGetProductByCowagCode = vi.fn();
const mockGetProductBySupplierPartNumber = vi.fn();
const mockGetActiveTenciaImportMatch = vi.fn();

vi.mock("@/lib/db/repository", () => ({
  getProduct: (...args: unknown[]) => mockGetProduct(...args),
  getProductByCowagCode: (...args: unknown[]) => mockGetProductByCowagCode(...args),
  getProductBySupplierPartNumber: (...args: unknown[]) => mockGetProductBySupplierPartNumber(...args),
}));

vi.mock("@/lib/db/catalogue-imports", () => ({
  getActiveTenciaImportMatch: (...args: unknown[]) => mockGetActiveTenciaImportMatch(...args),
}));

function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    type: "cowag",
    cowagCode: "PUMP-001",
    description: "Test Pump",
    unit: "EACH",
    sellPrice: 250,
    costEach: 150,
    lastUpdated: "2026-08-31T00:00:00.000Z",
    ...overrides,
  };
}

function sampleItem(overrides: Partial<BomItem> = {}): BomItem {
  return {
    id: "item-1",
    description: "Test Pump",
    cowagPartNumber: "PUMP-001",
    quantity: 1,
    costEach: 100,
    sellEach: 200,
    pricingState: "normal",
    ...overrides,
  };
}

function sampleQuote(items: BomItem[]): Quote {
  return {
    id: "quote-1",
    quoteNumber: "114700",
    quoteDate: "2026-08-31",
    status: "draft",
    customer: { name: "Test Customer" },
    delivery: {},
    scopeText: "",
    options: [
      {
        id: "opt-1",
        name: "Option 1",
        sortOrder: 0,
        sections: [
          {
            id: "sec-1",
            name: "Pump",
            enabled: true,
            sortOrder: 0,
            showOnCustomerQuote: true,
            items,
          },
        ],
      },
    ],
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
  };
}

describe("quote price refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProduct.mockReturnValue(null);
    mockGetProductByCowagCode.mockImplementation((code: string) =>
      code === "PUMP-001" ? sampleProduct() : null
    );
    mockGetProductBySupplierPartNumber.mockReturnValue(null);
    mockGetActiveTenciaImportMatch.mockReturnValue(null);
  });

  it("detects cost and sell changes from the current catalogue", () => {
    const preview = previewQuotePriceRefresh(sampleQuote([sampleItem()]));
    expect(preview.summary.wouldUpdate).toBe(1);
    expect(preview.changes[0].previousCostEach).toBe(100);
    expect(preview.changes[0].newCostEach).toBe(150);
    expect(preview.changes[0].previousSellEach).toBe(200);
    expect(preview.changes[0].newSellEach).toBe(250);
  });

  it("leaves unchanged items alone", () => {
    const preview = previewQuotePriceRefresh(
      sampleQuote([
        sampleItem({
          costEach: 150,
          sellEach: 250,
        }),
      ])
    );
    expect(preview.summary.wouldUpdate).toBe(0);
    expect(preview.summary.unchanged).toBe(1);
  });

  it("applies catalogue updates to the quote", () => {
    const updated = applyQuotePriceRefresh(sampleQuote([sampleItem()]));
    const item = updated.options[0].sections[0].items[0];
    expect(item.costEach).toBe(150);
    expect(item.sellEach).toBe(250);
  });

  it("recalculates sell from markup when cost changes", () => {
    const updated = proposeUpdatedBomItem(
      sampleItem({
        markupPercent: 20,
        sellEach: 120,
      })
    );
    expect(updated?.costEach).toBe(150);
    expect(updated?.sellEach).toBe(180);
  });

  it("uses active Tencia cost when product has no stored cost", () => {
    mockGetProductByCowagCode.mockReturnValue(
      sampleProduct({ costEach: null, sellPrice: 250 })
    );
    mockGetActiveTenciaImportMatch.mockReturnValue({
      costEach: 140,
      supplier: "Grundfos",
      supplierPartNumber: "GRU-123",
    });

    const updated = proposeUpdatedBomItem(sampleItem());
    expect(updated?.costEach).toBe(140);
    expect(updated?.sellEach).toBe(250);
    expect(updated?.supplier).toBe("Grundfos");
    expect(updated?.supplierPartNumber).toBe("GRU-123");
  });

  it("skips POA lines", () => {
    const preview = previewQuotePriceRefresh(
      sampleQuote([
        sampleItem({
          pricingState: "poa",
        }),
      ])
    );
    expect(preview.summary.skipped).toBe(1);
    expect(preview.summary.wouldUpdate).toBe(0);
  });
});
