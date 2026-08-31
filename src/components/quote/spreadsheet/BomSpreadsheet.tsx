"use client";

import { Fragment, useMemo, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import type { BomItem, PricingState, Product, Quote } from "@/types";
import {
  buildBomRowViews,
  duplicateOptionInQuote,
  duplicateSectionInQuote,
  findItem,
  findOption,
  findSection,
  removeItem,
  removeOption,
  removeSection,
  updateItem,
  updateOption,
  updateSection,
} from "@/lib/quote/bom-mutations";
import { productToBomItem } from "@/lib/quote/product-to-item";
import {
  calculateOptionTotals,
  calculateSectionTotals,
  formatPrice,
} from "@/lib/pricing/calculations";
import { BOM_COLUMNS, BOM_COLUMN_COUNT } from "./bom-columns";
import { BomSheetMeta } from "./BomSheetMeta";
import { InlineProductSearch } from "./InlineProductSearch";

const PRICING_STATES: { value: PricingState; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "free", label: "FREE" },
  { value: "included", label: "Included" },
  { value: "poa", label: "POA" },
];

function parseNum(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function displayMoney(value: number | null | undefined, state?: PricingState) {
  if (state === "free") return "FREE";
  if (state === "included") return "Included";
  if (state === "poa") return "POA";
  return formatPrice(value);
}

function EmptyCell() {
  return <span className="bom-empty-cell" />;
}

export function BomSpreadsheet({
  quote,
  onChange,
  searchTarget,
  onSearchTargetChange,
  hideEmptySections = false,
  onAddItem,
  onAddManualItem,
}: {
  quote: Quote;
  onChange: (quote: Quote) => void;
  searchTarget: { itemId: string; field: "description" | "cowag" } | null;
  onSearchTargetChange: (target: { itemId: string; field: "description" | "cowag" } | null) => void;
  hideEmptySections?: boolean;
  onAddItem: (optionId: string, sectionId: string) => void;
  onAddManualItem: (optionId: string, sectionId: string) => void;
}) {
  const rows = useMemo(() => {
    const all = buildBomRowViews(quote);
    if (!hideEmptySections) return all;
    return all.filter((row) => {
      if (
        row.type !== "section-header" &&
        row.type !== "section-total" &&
        row.type !== "section-add-actions"
      ) {
        return true;
      }
      const option = findOption(quote, row.optionId);
      const section = option ? findSection(option, row.sectionId) : undefined;
      return (section?.items.length ?? 0) > 0;
    });
  }, [quote, hideEmptySections]);

  const [activeCell, setActiveCell] = useState<string | null>(null);

  const saveToCatalogue = async (item: BomItem) => {
    await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: item.cowagPartNumber ? "cowag" : "supplier",
        cowagCode: item.cowagPartNumber,
        supplier: item.supplier,
        supplierPartNumber: item.supplierPartNumber,
        description: item.description,
        unit: item.unit || "EACH",
        sellPrice: item.sellEach,
        costEach: item.costEach,
      }),
    });
  };

  const patchItem = (
    optionId: string,
    sectionId: string,
    itemId: string,
    patch: Partial<BomItem>
  ) => {
    onChange(updateItem(quote, optionId, sectionId, itemId, patch));
  };

  return (
    <div className="bom-sheet-wrap surface-card overflow-hidden">
      <BomSheetMeta quote={quote} onChange={onChange} />
      <div className="bom-sheet-scroll bom-sheet-buffer">
        <table className="bom-sheet">
          <thead>
            <tr>
              {BOM_COLUMNS.map((col) => (
                <th key={col.id} className={col.className}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              if (row.type === "option-header") {
                const option = findOption(quote, row.optionId)!;
                const totals = calculateOptionTotals(option);
                return (
                  <tr key={`opt-${row.optionId}`} className="bom-row-option">
                    <td className="bom-col-subassy" />
                    <td className="bom-col-cc" />
                    <td className="bom-col-supplier" />
                    <td className="bom-col-supplier-pt" />
                    <td className="bom-col-cowag" />
                    <td className="bom-col-description" colSpan={1}>
                      <input
                        className="bom-header-input w-full"
                        value={option.name}
                        onChange={(e) =>
                          onChange(updateOption(quote, row.optionId, { name: e.target.value }))
                        }
                      />
                    </td>
                    <td className="bom-col-qty" />
                    <td className="bom-col-money" />
                    <td className="bom-col-money bom-header-stat">
                      {formatPrice(totals.costTotal)}
                    </td>
                    <td className="bom-col-pct" />
                    <td className="bom-col-money" />
                    <td className="bom-col-money bom-header-stat">
                      {formatPrice(totals.sellExGst)}
                    </td>
                    <td className="bom-col-money bom-header-stat">
                      {formatPrice(totals.marginDollar)}
                    </td>
                    <td className="bom-col-pct bom-header-stat">
                      {totals.marginPercent != null
                        ? `${totals.marginPercent.toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className="bom-col-notes bom-header-stat text-xs uppercase tracking-wide">
                      Option total
                    </td>
                    <td className="bom-col-state" />
                    <td className="bom-col-actions">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          className="bom-icon-btn"
                          title="Duplicate option"
                          onClick={() => onChange(duplicateOptionInQuote(quote, row.optionId))}
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {quote.options.length > 1 && (
                          <button
                            type="button"
                            className="bom-icon-btn"
                            title="Remove option"
                            onClick={() => onChange(removeOption(quote, row.optionId))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.type === "section-header") {
                const option = findOption(quote, row.optionId)!;
                const section = findSection(option, row.sectionId)!;
                const totals = calculateSectionTotals(section);
                return (
                  <tr key={`sec-${row.sectionId}`} className="bom-row-section">
                    <td className="bom-col-subassy">
                      <input
                        className="bom-header-input w-full text-xs"
                        value={section.name}
                        onChange={(e) =>
                          onChange(
                            updateSection(quote, row.optionId, row.sectionId, {
                              name: e.target.value,
                              customerLabel: e.target.value,
                            })
                          )
                        }
                      />
                    </td>
                    <td className="bom-col-cc" />
                    <td className="bom-col-supplier" />
                    <td className="bom-col-supplier-pt" />
                    <td className="bom-col-cowag" />
                    <td className="bom-col-description text-xs opacity-90">Section</td>
                    <td className="bom-col-qty" />
                    <td className="bom-col-money" />
                    <td className="bom-col-money bom-header-stat text-xs">
                      {formatPrice(totals.costTotal)}
                    </td>
                    <td className="bom-col-pct" />
                    <td className="bom-col-money" />
                    <td className="bom-col-money bom-header-stat text-xs">
                      {formatPrice(totals.sellExGst)}
                    </td>
                    <td className="bom-col-money" />
                    <td className="bom-col-pct" />
                    <td className="bom-col-notes">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label className="inline-flex items-center gap-1 whitespace-nowrap">
                          <input
                            type="checkbox"
                            className="accent-white"
                            checked={section.showOnCustomerQuote}
                            onChange={(e) =>
                              onChange(
                                updateSection(quote, row.optionId, row.sectionId, {
                                  showOnCustomerQuote: e.target.checked,
                                })
                              )
                            }
                          />
                          On quote
                        </label>
                        <input
                          className="bom-header-input min-w-[7rem] flex-1 text-xs"
                          placeholder="Quote group"
                          title="Pricing group — sections with the same label combine on Quotation tab"
                          value={section.customerPricingGroup ?? ""}
                          onChange={(e) =>
                            onChange(
                              updateSection(quote, row.optionId, row.sectionId, {
                                customerPricingGroup: e.target.value,
                              })
                            )
                          }
                        />
                      </div>
                    </td>
                    <td className="bom-col-state" />
                    <td className="bom-col-actions">
                      <div className="flex justify-end gap-0.5">
                        <button
                          type="button"
                          className="bom-icon-btn"
                          title="Duplicate section"
                          onClick={() =>
                            onChange(duplicateSectionInQuote(quote, row.optionId, row.sectionId))
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="bom-icon-btn"
                          title="Remove section"
                          onClick={() =>
                            onChange(removeSection(quote, row.optionId, row.sectionId))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.type === "section-add-actions") {
                const option = findOption(quote, row.optionId)!;
                const section = findSection(option, row.sectionId)!;
                return (
                  <tr key={`add-${row.sectionId}`} className="bom-row-add-actions">
                    <td colSpan={BOM_COLUMN_COUNT}>
                      <div className="flex flex-wrap items-center gap-2 py-1.5 pl-[7.5rem]">
                        <button
                          type="button"
                          className="bom-add-item-btn"
                          onClick={() => onAddItem(row.optionId, row.sectionId)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Item
                        </button>
                        <button
                          type="button"
                          className="bom-add-item-btn bom-add-item-btn-secondary"
                          onClick={() => onAddManualItem(row.optionId, row.sectionId)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Manual Item
                        </button>
                        <span className="text-xs text-muted">{section.name}</span>
                      </div>
                    </td>
                  </tr>
                );
              }

              if (row.type === "section-total") {
                const option = findOption(quote, row.optionId)!;
                const section = findSection(option, row.sectionId)!;
                const totals = calculateSectionTotals(section);
                const nextRow = rows[rowIndex + 1];
                const gapBeforeNextOption = nextRow?.type === "option-header";
                return (
                  <Fragment key={`tot-${row.sectionId}`}>
                    <tr className="bom-row-total">
                      <td className="bom-col-subassy bom-total-label">{section.name}</td>
                      <td className="bom-col-cc" />
                      <td className="bom-col-supplier" />
                      <td className="bom-col-supplier-pt" />
                      <td className="bom-col-cowag" />
                      <td className="bom-col-description bom-total-label text-right">
                        Section total
                      </td>
                      <td className="bom-col-qty" />
                      <td className="bom-col-money" />
                      <td className="bom-col-money bom-total-stat">{formatPrice(totals.costTotal)}</td>
                      <td className="bom-col-pct" />
                      <td className="bom-col-money" />
                      <td className="bom-col-money bom-total-stat">{formatPrice(totals.sellExGst)}</td>
                      <td className="bom-col-money bom-total-stat">
                        {formatPrice(totals.marginDollar)}
                      </td>
                      <td className="bom-col-pct bom-total-stat">
                        {totals.marginPercent != null ? `${totals.marginPercent.toFixed(1)}%` : "—"}
                      </td>
                      <td className="bom-col-notes" />
                      <td className="bom-col-state" />
                      <td className="bom-col-actions" />
                    </tr>
                    {gapBeforeNextOption && (
                      <tr className="bom-row-option-gap" aria-hidden="true">
                        <td colSpan={BOM_COLUMN_COUNT} />
                      </tr>
                    )}
                  </Fragment>
                );
              }

              const option = findOption(quote, row.optionId)!;
              const section = findSection(option, row.sectionId)!;
              const item = findItem(section, row.itemId)!;
              const cellKey = (field: string) => `${item.id}-${field}`;
              const selectProduct = (product: Product) => {
                const populated = productToBomItem(product);
                onChange(
                  updateItem(quote, row.optionId, row.sectionId, item.id, {
                    ...populated,
                    id: item.id,
                  })
                );
                onSearchTargetChange(null);
              };

              return (
                <tr
                  key={item.id}
                  className={clsx("bom-row-item", activeCell?.startsWith(item.id) && "bom-row-active")}
                >
                  <td className="bom-col-subassy">
                    <span className="bom-subassy-label">{section.name}</span>
                  </td>
                  <td className="bom-col-cc">
                    <EmptyCell />
                  </td>
                  <td className="bom-col-supplier">
                    <input
                      className="bom-cell-input"
                      value={item.supplier ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          supplier: e.target.value,
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("supplier"))}
                    />
                  </td>
                  <td className="bom-col-supplier-pt">
                    <input
                      className="bom-cell-input"
                      value={item.supplierPartNumber ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          supplierPartNumber: e.target.value,
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("supplierPt"))}
                    />
                  </td>
                  <td className="bom-col-cowag overflow-visible">
                    <InlineProductSearch
                      autoFocus={
                        searchTarget?.itemId === item.id && searchTarget.field === "cowag"
                      }
                      searchMode="code"
                      value={item.cowagPartNumber ?? ""}
                      onChange={(cowagPartNumber) =>
                        patchItem(row.optionId, row.sectionId, item.id, { cowagPartNumber })
                      }
                      onSelect={selectProduct}
                      onCancel={() => onSearchTargetChange(null)}
                    />
                  </td>
                  <td className="bom-col-description overflow-visible">
                    <InlineProductSearch
                      autoFocus={
                        searchTarget?.itemId === item.id && searchTarget.field === "description"
                      }
                      searchMode="all"
                      value={item.description}
                      onChange={(description) =>
                        patchItem(row.optionId, row.sectionId, item.id, { description })
                      }
                      onSelect={selectProduct}
                      onCancel={() => onSearchTargetChange(null)}
                    />
                  </td>
                  <td className="bom-col-qty">
                    <input
                      className="bom-cell-number mx-auto block"
                      type="number"
                      min={0}
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          quantity: parseNum(e.target.value) ?? 0,
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("qty"))}
                    />
                  </td>
                  <td className="bom-col-money">
                    <input
                      className="bom-cell-number ml-auto block"
                      value={item.costEach ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          costEach: parseNum(e.target.value),
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("costEa"))}
                    />
                  </td>
                  <td className="bom-col-money bom-readonly text-right">
                    {displayMoney(item.costTotal, item.pricingState)}
                  </td>
                  <td className="bom-col-pct">
                    <input
                      className="bom-cell-number ml-auto block"
                      value={item.markupPercent ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          markupPercent: parseNum(e.target.value),
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("markup"))}
                    />
                  </td>
                  <td className="bom-col-money">
                    <input
                      className="bom-cell-number ml-auto block"
                      value={item.sellEach ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          sellEach: parseNum(e.target.value),
                        })
                      }
                      onFocus={() => setActiveCell(cellKey("sellEa"))}
                    />
                  </td>
                  <td className="bom-col-money bom-readonly text-right">
                    {displayMoney(item.sellTotal, item.pricingState)}
                  </td>
                  <td className="bom-col-money bom-readonly text-right">
                    {displayMoney(item.marginDollar, item.pricingState)}
                  </td>
                  <td className="bom-col-pct bom-readonly text-right">
                    {item.marginPercent != null ? `${item.marginPercent.toFixed(1)}%` : "—"}
                  </td>
                  <td className="bom-col-notes">
                    <input
                      className="bom-cell-input text-xs"
                      value={item.notes ?? ""}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, { notes: e.target.value })
                      }
                      onFocus={() => setActiveCell(cellKey("notes"))}
                    />
                  </td>
                  <td className="bom-col-state">
                    <select
                      className="bom-cell-input text-xs"
                      value={item.pricingState}
                      onChange={(e) =>
                        patchItem(row.optionId, row.sectionId, item.id, {
                          pricingState: e.target.value as PricingState,
                        })
                      }
                    >
                      {PRICING_STATES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="bom-col-actions">
                    <div className="flex gap-0.5 justify-end">
                      {!item.productId && item.description.trim() && (
                        <button
                          type="button"
                          className="bom-icon-btn text-[10px] px-1"
                          title="Save to catalogue"
                          onClick={() => saveToCatalogue(item)}
                        >
                          Save
                        </button>
                      )}
                      <button
                        type="button"
                        className="bom-icon-btn"
                        title="Remove row"
                        onClick={() => {
                          const label = item.description.trim() || item.cowagPartNumber || "this item";
                          if (!window.confirm(`Remove "${label}" from the quote?`)) return;
                          onChange(removeItem(quote, row.optionId, row.sectionId, item.id));
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
