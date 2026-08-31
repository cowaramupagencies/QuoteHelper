import { v4 as uuidv4 } from "uuid";
import { calculateItemPricing } from "@/lib/pricing/calculations";
import type { BomItem, Product } from "@/types";

/** Snapshot catalogue values onto a BOM row — cost only when explicitly available. */
export function productToBomItem(product: Product, quantity = 1): BomItem {
  const costEach =
    product.costEach != null && Number.isFinite(product.costEach) ? product.costEach : null;

  return calculateItemPricing({
    id: uuidv4(),
    description: product.description,
    cowagPartNumber: product.cowagCode,
    supplier: product.supplier,
    supplierPartNumber: product.supplierPartNumber,
    quantity,
    unit: product.unit,
    costEach,
    sellEach: product.sellPrice ?? null,
    pricingState: "normal",
    productId: product.id,
  });
}

export function createManualBomItem(): BomItem {
  return calculateItemPricing({
    id: uuidv4(),
    description: "",
    quantity: 1,
    pricingState: "normal",
  });
}

export function createSearchBomItem(): BomItem {
  return createManualBomItem();
}
