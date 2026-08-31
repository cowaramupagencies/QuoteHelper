import { v4 as uuidv4 } from "uuid";
import type { BomItem, BomSection, CustomerPricingMode, OptionTotals, PricingState, QuoteOption, SectionSummary, SectionTotals, CustomerQuoteLine } from "@/types";

const GST_RATE = 0.1;

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!denominator || !Number.isFinite(denominator)) return null;
  return numerator / denominator;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateItemPricing(item: BomItem): BomItem {
  const qty = item.quantity || 0;
  const costEach = item.costEach ?? null;
  const costTotal =
    costEach != null ? roundMoney(qty * costEach) : item.costTotal ?? null;

  let sellEach = item.sellEach ?? null;
  let sellTotal = item.sellTotal ?? null;
  let markupPercent = item.markupPercent ?? null;

  if (item.pricingState === "free") {
    sellEach = 0;
    sellTotal = 0;
  } else if (item.pricingState === "included") {
    sellEach = 0;
    sellTotal = 0;
  } else if (item.pricingState === "poa") {
    sellEach = null;
    sellTotal = null;
  } else {
    if (sellEach == null && costEach != null && markupPercent != null) {
      sellEach = roundMoney(costEach * (1 + markupPercent / 100));
    }
    if (sellEach != null) {
      sellTotal = roundMoney(qty * sellEach);
    } else if (sellTotal != null && qty > 0) {
      sellEach = roundMoney(sellTotal / qty);
    }

    if (markupPercent == null && sellEach != null && costEach != null && costEach > 0) {
      markupPercent = roundMoney(((sellEach - costEach) / costEach) * 100);
    }
  }

  const marginDollar =
    sellTotal != null && costTotal != null ? roundMoney(sellTotal - costTotal) : null;
  const marginPercent =
    marginDollar != null && sellTotal != null && sellTotal > 0
      ? roundMoney(safeDivide(marginDollar, sellTotal)! * 100)
      : sellTotal === 0 && costTotal === 0
        ? null
        : null;

  return {
    ...item,
    costTotal,
    sellEach,
    sellTotal,
    marginDollar,
    marginPercent,
    markupPercent,
  };
}

export function sumItems(items: BomItem[]): number {
  return roundMoney(
    items.reduce((sum, item) => {
      const calculated = calculateItemPricing(item);
      if (calculated.pricingState === "included" || calculated.pricingState === "poa") {
        return sum;
      }
      return sum + (calculated.sellTotal ?? 0);
    }, 0)
  );
}

export function sumItemCosts(items: BomItem[]): number | null {
  let hasCost = false;
  const total = items.reduce((sum, item) => {
    const calculated = calculateItemPricing(item);
    if (calculated.costTotal != null) {
      hasCost = true;
      return sum + calculated.costTotal;
    }
    return sum;
  }, 0);
  return hasCost ? roundMoney(total) : null;
}

export function sectionInternalTotal(section: BomSection): number {
  if (!section.enabled) return 0;
  return sumItems(section.items);
}

export function sectionCustomerTotal(section: BomSection): number {
  if (!section.enabled || !section.showOnCustomerQuote) return 0;
  if (section.customerTotalOverride != null) return section.customerTotalOverride;
  return sectionInternalTotal(section);
}

export function summarizeSection(section: BomSection): SectionSummary {
  const internalTotal = sectionInternalTotal(section);
  const costTotal = sumItemCosts(section.items);
  const allIncluded = section.items.every(
    (i) => i.pricingState === "included" || !section.enabled
  );
  const allFree = section.items.every((i) => i.pricingState === "free");
  const anyPoa = section.items.some((i) => i.pricingState === "poa");

  let displayStatus: SectionSummary["displayStatus"] = "priced";
  if (!section.enabled || section.items.length === 0) displayStatus = "not_included";
  else if (allIncluded) displayStatus = "not_included";
  else if (anyPoa) displayStatus = "poa";
  else if (allFree) displayStatus = "free";
  else if (internalTotal === 0) displayStatus = "not_included";

  return {
    name: section.name,
    enabled: section.enabled,
    internalTotal,
    costTotal,
    customerLabel: section.customerLabel || section.name,
    customerTotal: sectionCustomerTotal(section),
    showOnCustomerQuote: section.showOnCustomerQuote,
    displayStatus,
  };
}

export function calculateSectionTotals(section: BomSection): SectionTotals {
  const sellExGst = sectionInternalTotal(section);
  const costTotal = sumItemCosts(section.items);
  const marginDollar =
    costTotal != null ? roundMoney(sellExGst - costTotal) : null;
  const marginPercent =
    marginDollar != null && sellExGst > 0
      ? roundMoney(safeDivide(marginDollar, sellExGst)! * 100)
      : null;

  return { costTotal, sellExGst, marginDollar, marginPercent };
}

export function calculateOptionTotals(option: QuoteOption): OptionTotals {
  const enabledSections = option.sections.filter((s) => s.enabled);
  const allItems = enabledSections.flatMap((s) => s.items.map(calculateItemPricing));

  const sellExGst = roundMoney(
    allItems.reduce((sum, item) => {
      if (item.pricingState === "included" || item.pricingState === "poa") return sum;
      return sum + (item.sellTotal ?? 0);
    }, 0)
  );

  const costTotal = sumItemCosts(allItems);
  const marginDollar =
    costTotal != null ? roundMoney(sellExGst - costTotal) : null;
  const marginPercent =
    marginDollar != null && sellExGst > 0
      ? roundMoney(safeDivide(marginDollar, sellExGst)! * 100)
      : null;

  const gst = roundMoney(sellExGst * GST_RATE);
  const sellIncGst = roundMoney(sellExGst + gst);

  return { costTotal, sellExGst, gst, sellIncGst, marginDollar, marginPercent };
}

function sectionShouldShowOnCustomerQuote(section: BomSection): boolean {
  if (!section.enabled || !section.showOnCustomerQuote) return false;
  const total = sectionCustomerTotal(section);
  if (total === 0 && section.items.every((i) => i.pricingState === "included")) return false;
  return true;
}

export function buildCustomerQuoteLines(
  option: QuoteOption,
  mode: CustomerPricingMode = "itemised"
): CustomerQuoteLine[] {
  const sections = option.sections
    .filter((s) => s.enabled && s.showOnCustomerQuote)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (mode === "single_total") {
    return [];
  }

  if (mode === "grouped") {
    const groups = new Map<string, number>();
    for (const section of sections) {
      if (!sectionShouldShowOnCustomerQuote(section)) continue;
      const label = section.customerPricingGroup?.trim() || section.customerLabel || section.name;
      groups.set(label, roundMoney((groups.get(label) ?? 0) + sectionCustomerTotal(section)));
    }
    return Array.from(groups.entries()).map(([label, exGst]) => ({ label, exGst }));
  }

  return sections
    .filter(sectionShouldShowOnCustomerQuote)
    .map((section) => ({
      label: section.customerLabel || section.name,
      exGst: sectionCustomerTotal(section),
    }));
}

export function formatPrice(amount: number | null | undefined, state?: PricingState): string {
  if (state === "free") return "FREE";
  if (state === "included") return "Included";
  if (state === "poa") return "POA";
  if (amount == null) return "—";
  return `$${amount.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatSectionSummary(summary: SectionSummary): string {
  if (summary.displayStatus === "not_included") return "Not Included";
  if (summary.displayStatus === "free") return "FREE";
  if (summary.displayStatus === "poa") return "POA";
  return formatPrice(summary.internalTotal);
}

export function formatSectionTotalsBrief(summary: SectionSummary): string {
  const sell = formatSectionSummary(summary);
  if (summary.displayStatus === "not_included" || summary.displayStatus === "free" || summary.displayStatus === "poa") {
    return sell;
  }
  const cost = summary.costTotal != null ? formatPrice(summary.costTotal) : "—";
  return `${sell} sell · ${cost} cost`;
}

export function duplicateOption(option: QuoteOption, newName: string): QuoteOption {
  const clone = structuredClone(option);
  return {
    ...clone,
    id: uuidv4(),
    name: newName,
    sections: clone.sections.map((section, sIdx) => ({
      ...section,
      id: uuidv4(),
      sortOrder: sIdx,
      items: section.items.map((item) => ({
        ...item,
        id: uuidv4(),
      })),
    })),
  };
}

export { GST_RATE };
