import { calculateItemPricing } from "@/lib/pricing/calculations";
import { getActiveTenciaImportMatch } from "@/lib/db/catalogue-imports";
import {
  getProduct,
  getProductByCowagCode,
  getProductBySupplierPartNumber,
} from "@/lib/db/repository";
import type { BomItem, Product, Quote } from "@/types";

export type QuotePriceRefreshItemStatus = "would_update" | "unchanged" | "not_found" | "skipped";

export interface QuotePriceRefreshChange {
  itemId: string;
  optionId: string;
  optionName: string;
  sectionName: string;
  description: string;
  cowagPartNumber?: string;
  status: QuotePriceRefreshItemStatus;
  previousCostEach: number | null;
  newCostEach: number | null;
  previousSellEach: number | null;
  newSellEach: number | null;
  note?: string;
}

export interface QuotePriceRefreshPreview {
  quoteId: string;
  changes: QuotePriceRefreshChange[];
  summary: {
    totalItems: number;
    wouldUpdate: number;
    unchanged: number;
    notFound: number;
    skipped: number;
  };
}

function costsEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.005;
}

function stringsEqual(a?: string | null, b?: string | null): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

export function resolveProductForBomItem(item: BomItem): Product | null {
  if (item.productId) {
    const byId = getProduct(item.productId);
    if (byId) return byId;
  }
  if (item.cowagPartNumber?.trim()) {
    const byCode = getProductByCowagCode(item.cowagPartNumber);
    if (byCode) return byCode;
  }
  if (item.supplierPartNumber?.trim()) {
    const bySupplier = getProductBySupplierPartNumber(item.supplierPartNumber);
    if (bySupplier) return bySupplier;
  }
  return null;
}

function resolveCatalogueDataForItem(item: BomItem, product: Product | null) {
  const tencia = getActiveTenciaImportMatch(item.cowagPartNumber, item.supplierPartNumber);

  return {
    costEach: product?.costEach ?? tencia?.costEach ?? null,
    sellPrice: product?.sellPrice ?? null,
    supplier: product?.supplier ?? tencia?.supplier ?? null,
    supplierPartNumber: product?.supplierPartNumber ?? tencia?.supplierPartNumber ?? null,
  };
}

export function proposeUpdatedBomItem(item: BomItem): BomItem | null {
  if (item.pricingState === "poa") {
    return null;
  }

  const product = resolveProductForBomItem(item);
  const catalogue = resolveCatalogueDataForItem(item, product);

  if (
    catalogue.costEach == null &&
    catalogue.sellPrice == null &&
    !catalogue.supplier?.trim() &&
    !catalogue.supplierPartNumber?.trim()
  ) {
    return null;
  }

  const next: BomItem = { ...item };

  if (catalogue.costEach != null) {
    next.costEach = catalogue.costEach;
  }
  if (catalogue.supplier?.trim()) {
    next.supplier = catalogue.supplier.trim();
  }
  if (catalogue.supplierPartNumber?.trim()) {
    next.supplierPartNumber = catalogue.supplierPartNumber.trim();
  }

  if (item.pricingState === "normal") {
    if (item.markupPercent != null && catalogue.costEach != null) {
      delete next.sellEach;
      delete next.sellTotal;
    } else if (catalogue.sellPrice != null) {
      next.sellEach = catalogue.sellPrice;
    }
  }

  const calculated = calculateItemPricing(next);

  const costChanged = !costsEqual(item.costEach ?? null, calculated.costEach ?? null);
  const sellChanged = !costsEqual(item.sellEach ?? null, calculated.sellEach ?? null);
  const supplierChanged = !stringsEqual(item.supplier, calculated.supplier);
  const supplierPartChanged = !stringsEqual(item.supplierPartNumber, calculated.supplierPartNumber);

  if (!costChanged && !sellChanged && !supplierChanged && !supplierPartChanged) {
    return null;
  }

  return calculated;
}

function describeItemContext(
  quote: Quote,
  optionId: string,
  sectionName: string,
  item: BomItem
): Pick<QuotePriceRefreshChange, "optionId" | "optionName" | "sectionName" | "description" | "cowagPartNumber"> {
  const option = quote.options.find((o) => o.id === optionId);
  return {
    optionId,
    optionName: option?.name ?? "Option",
    sectionName,
    description: item.description || item.cowagPartNumber || "Untitled item",
    cowagPartNumber: item.cowagPartNumber,
  };
}

export function previewQuotePriceRefresh(quote: Quote): QuotePriceRefreshPreview {
  const changes: QuotePriceRefreshChange[] = [];

  for (const option of quote.options) {
    for (const section of option.sections) {
      for (const item of section.items) {
        const context = describeItemContext(quote, option.id, section.name, item);
        const calculated = calculateItemPricing(item);

        if (item.pricingState === "poa") {
          changes.push({
            itemId: item.id,
            ...context,
            status: "skipped",
            previousCostEach: calculated.costEach ?? null,
            newCostEach: calculated.costEach ?? null,
            previousSellEach: calculated.sellEach ?? null,
            newSellEach: calculated.sellEach ?? null,
            note: "POA items are not auto-updated",
          });
          continue;
        }

        const product = resolveProductForBomItem(item);
        const catalogue = resolveCatalogueDataForItem(item, product);

        if (
          catalogue.costEach == null &&
          catalogue.sellPrice == null &&
          !catalogue.supplier?.trim() &&
          !catalogue.supplierPartNumber?.trim()
        ) {
          changes.push({
            itemId: item.id,
            ...context,
            status: "not_found",
            previousCostEach: calculated.costEach ?? null,
            newCostEach: null,
            previousSellEach: calculated.sellEach ?? null,
            newSellEach: null,
            note: "No matching catalogue or active Tencia import found",
          });
          continue;
        }

        const proposed = proposeUpdatedBomItem(item);
        if (!proposed) {
          changes.push({
            itemId: item.id,
            ...context,
            status: "unchanged",
            previousCostEach: calculated.costEach ?? null,
            newCostEach: calculated.costEach ?? null,
            previousSellEach: calculated.sellEach ?? null,
            newSellEach: calculated.sellEach ?? null,
          });
          continue;
        }

        changes.push({
          itemId: item.id,
          ...context,
          status: "would_update",
          previousCostEach: calculated.costEach ?? null,
          newCostEach: proposed.costEach ?? null,
          previousSellEach: calculated.sellEach ?? null,
          newSellEach: proposed.sellEach ?? null,
        });
      }
    }
  }

  return {
    quoteId: quote.id,
    changes,
    summary: {
      totalItems: changes.length,
      wouldUpdate: changes.filter((c) => c.status === "would_update").length,
      unchanged: changes.filter((c) => c.status === "unchanged").length,
      notFound: changes.filter((c) => c.status === "not_found").length,
      skipped: changes.filter((c) => c.status === "skipped").length,
    },
  };
}

export function applyQuotePriceRefresh(quote: Quote): Quote {
  const updateIds = new Set(
    previewQuotePriceRefresh(quote)
      .changes.filter((c) => c.status === "would_update")
      .map((c) => c.itemId)
  );

  if (updateIds.size === 0) return quote;

  return {
    ...quote,
    options: quote.options.map((option) => ({
      ...option,
      sections: option.sections.map((section) => ({
        ...section,
        items: section.items.map((item) => {
          if (!updateIds.has(item.id)) return item;
          return proposeUpdatedBomItem(item) ?? item;
        }),
      })),
    })),
  };
}
