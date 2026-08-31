export type PricingState = "normal" | "free" | "included" | "poa";

/** How line items appear on the customer quotation / Excel export */
export type CustomerPricingMode = "itemised" | "single_total" | "grouped";

export interface BomItem {
  id: string;
  supplier?: string;
  supplierPartNumber?: string;
  cowagPartNumber?: string;
  description: string;
  quantity: number;
  unit?: string;
  costEach?: number | null;
  costTotal?: number | null;
  markupPercent?: number | null;
  sellEach?: number | null;
  sellTotal?: number | null;
  marginDollar?: number | null;
  marginPercent?: number | null;
  pricingState: PricingState;
  notes?: string;
  productId?: string;
}

export interface BomSection {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  customerLabel?: string;
  /** When pricing mode is grouped, sections with the same group label are combined on the customer quote */
  customerPricingGroup?: string;
  showOnCustomerQuote: boolean;
  customerTotalOverride?: number | null;
  items: BomItem[];
}

export interface QuoteOption {
  id: string;
  name: string;
  sortOrder: number;
  sections: BomSection[];
}

export interface CustomerDetails {
  name: string;
  customerId?: string;
  phone?: string;
  mobile?: string;
  email?: string;
}

export interface DeliveryDetails {
  address?: string;
  suburb?: string;
  startDate?: string;
}

export interface Quote {
  id: string;
  quoteNumber: string;
  quoteDate: string;
  status: "draft" | "sent" | "archived";
  templateId?: string;
  templateName?: string;
  customer: CustomerDetails;
  delivery: DeliveryDetails;
  scopeText: string;
  customerPricingMode?: CustomerPricingMode;
  options: QuoteOption[];
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  type: "cowag" | "supplier";
  cowagCode?: string;
  supplier?: string;
  supplierPartNumber?: string;
  description: string;
  unit: string;
  sellPrice?: number | null;
  costEach?: number | null;
  source?: string;
  lastUpdated: string;
}

export interface JobTemplate {
  id: string;
  name: string;
  kind: "job" | "section";
  description?: string;
  payload: {
    options?: QuoteOption[];
    section?: BomSection;
    customerPricingMode?: CustomerPricingMode;
  };
  createdAt: string;
}

export interface ScopeClause {
  id: string;
  title: string;
  text: string;
  category?: string;
}

export interface PriceListMeta {
  id: string;
  sourceFile: string;
  lastUpdated: string;
  productCount: number;
}

export interface TankReference {
  id: string;
  supplier: string;
  model: string;
  capacityLitres?: number;
  material?: string;
  dimensions?: string;
  baseRequirements?: string;
  blueMetalNotes?: string;
  metadata?: Record<string, unknown>;
}

export interface OptionTotals {
  costTotal: number | null;
  sellExGst: number;
  gst: number;
  sellIncGst: number;
  marginDollar: number | null;
  marginPercent: number | null;
}

export interface CustomerQuoteLine {
  label: string;
  exGst: number;
}

export interface SectionSummary {
  name: string;
  enabled: boolean;
  internalTotal: number;
  costTotal: number | null;
  customerLabel: string;
  customerTotal: number;
  showOnCustomerQuote: boolean;
  displayStatus?: "not_included" | "free" | "poa" | "priced";
}

export interface SectionTotals {
  costTotal: number | null;
  sellExGst: number;
  marginDollar: number | null;
  marginPercent: number | null;
}
