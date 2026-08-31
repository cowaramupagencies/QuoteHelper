/** Column layout matching the CowAg Job BOM Excel sheet (row 5 headers). */
export const BOM_COLUMN_COUNT = 17;

export type BomColumnId =
  | "subAssy"
  | "cc"
  | "supplier"
  | "supplierPtNo"
  | "cowagPtNo"
  | "description"
  | "qty"
  | "costEa"
  | "costTotal"
  | "markup"
  | "sellEa"
  | "sellTotal"
  | "marginDollar"
  | "marginPercent"
  | "notes"
  | "state"
  | "actions";

export const BOM_COLUMNS: { id: BomColumnId; label: string; className: string }[] = [
  { id: "subAssy", label: "Sub-Assy", className: "bom-col-subassy" },
  { id: "cc", label: "CC", className: "bom-col-cc" },
  { id: "supplier", label: "Supplier", className: "bom-col-supplier" },
  { id: "supplierPtNo", label: "Supplier Pt No", className: "bom-col-supplier-pt" },
  { id: "cowagPtNo", label: "CowAg Pt No", className: "bom-col-cowag" },
  { id: "description", label: "Description", className: "bom-col-description" },
  { id: "qty", label: "Qty", className: "bom-col-qty" },
  { id: "costEa", label: "Cost Ea", className: "bom-col-money" },
  { id: "costTotal", label: "Cost Total", className: "bom-col-money" },
  { id: "markup", label: "Mark-up %", className: "bom-col-pct" },
  { id: "sellEa", label: "Sell Ea", className: "bom-col-money" },
  { id: "sellTotal", label: "Sell Total", className: "bom-col-money" },
  { id: "marginDollar", label: "Margin $", className: "bom-col-money" },
  { id: "marginPercent", label: "Margin %", className: "bom-col-pct" },
  { id: "notes", label: "Notes", className: "bom-col-notes" },
  { id: "state", label: "State", className: "bom-col-state" },
  { id: "actions", label: "", className: "bom-col-actions" },
];

export function bomColIndex(id: BomColumnId): number {
  return BOM_COLUMNS.findIndex((c) => c.id === id);
}
