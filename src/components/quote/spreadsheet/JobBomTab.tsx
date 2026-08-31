"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { BomItem, Quote } from "@/types";
import {
  addItem,
  addOption,
  addSection,
  findOption,
  findSection,
  getDefaultTarget,
} from "@/lib/quote/bom-mutations";
import { createManualBomItem } from "@/lib/quote/product-to-item";
import { calculateOptionTotals, formatPrice } from "@/lib/pricing/calculations";
import { BomSpreadsheet } from "./BomSpreadsheet";
import { AddItemModal } from "./AddItemModal";
import { CopyBomForExcelButton } from "@/components/quote/CopyBomForExcelButton";

export type BomSearchTarget = { itemId: string; field: "description" | "cowag" };

type AddItemTarget = { optionId: string; sectionId: string; sectionName: string };

function sectionLabel(quote: Quote, optionId: string, sectionId: string): string {
  const option = findOption(quote, optionId);
  const section = option ? findSection(option, sectionId) : undefined;
  return section?.name ?? "Section";
}

export function JobBomTab({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (quote: Quote) => void;
}) {
  const [searchTarget, setSearchTarget] = useState<BomSearchTarget | null>(null);
  const [target, setTarget] = useState<{ optionId: string; sectionId: string } | null>(null);
  const [addItemTarget, setAddItemTarget] = useState<AddItemTarget | null>(null);
  const [hideEmptySections, setHideEmptySections] = useState(true);

  const resolveTarget = (q: Quote) => {
    return target ?? getDefaultTarget(q);
  };

  const ensureTarget = (
    q: Quote,
    optionId?: string,
    sectionId?: string
  ): { quote: Quote; target: { optionId: string; sectionId: string } } => {
    if (optionId && sectionId) {
      return { quote: q, target: { optionId, sectionId } };
    }
    let next = q;
    let t = resolveTarget(next);
    if (!t) {
      next = addOption(q);
      t = getDefaultTarget(next)!;
    }
    return { quote: next, target: t };
  };

  const handleAddOption = () => {
    const next = addOption(quote);
    onChange(next);
    const added = next.options[next.options.length - 1];
    const section = added.sections[0];
    if (section) setTarget({ optionId: added.id, sectionId: section.id });
  };

  const handleAddSection = () => {
    const { quote: q, target: t } = ensureTarget(quote);
    const next = addSection(q, t.optionId);
    onChange(next);
    const option = next.options.find((o) => o.id === t.optionId)!;
    const section = option.sections[option.sections.length - 1];
    setTarget({ optionId: option.id, sectionId: section.id });
  };

  const openAddItemModal = (optionId?: string, sectionId?: string) => {
    const { quote: q, target: t } = ensureTarget(quote, optionId, sectionId);
    if (q !== quote) onChange(q);
    setTarget(t);
    setAddItemTarget({
      optionId: t.optionId,
      sectionId: t.sectionId,
      sectionName: sectionLabel(q, t.optionId, t.sectionId),
    });
  };

  const handleAddManualItem = (optionId?: string, sectionId?: string) => {
    const { quote: q, target: t } = ensureTarget(quote, optionId, sectionId);
    const item = createManualBomItem();
    onChange(addItem(q, t.optionId, t.sectionId, item));
    setTarget(t);
  };

  const handleConfirmAddItem = (item: BomItem) => {
    if (!addItemTarget) return;
    onChange(addItem(quote, addItemTarget.optionId, addItemTarget.sectionId, item));
    setAddItemTarget(null);
  };

  const grandSell = quote.options.reduce(
    (sum, o) => sum + calculateOptionTotals(o).sellExGst,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary !min-h-0 !px-4 !py-2.5" onClick={() => openAddItemModal()}>
          <Plus className="h-4 w-4" /> Add Item
        </button>
        <button type="button" className="btn-secondary !min-h-0 !px-4 !py-2.5" onClick={() => handleAddManualItem()}>
          <Plus className="h-4 w-4" /> Add Manual Item
        </button>
        <button type="button" className="btn-secondary !min-h-0 !px-4 !py-2.5" onClick={handleAddSection}>
          <Plus className="h-4 w-4" /> Add Section
        </button>
        <button type="button" className="btn-secondary !min-h-0 !px-4 !py-2.5" onClick={handleAddOption}>
          <Plus className="h-4 w-4" /> Add Option
        </button>
        <CopyBomForExcelButton quote={quote} />
        <p className="ml-auto text-sm text-ink-secondary">
          Quote sell total (ex GST): <span className="font-semibold text-ink">{formatPrice(grandSell)}</span>
        </p>
        <label className="flex items-center gap-2 text-sm text-ink-secondary whitespace-nowrap">
          <input
            type="checkbox"
            className="accent-brand"
            checked={hideEmptySections}
            onChange={(e) => setHideEmptySections(e.target.checked)}
          />
          Hide empty sections
        </label>
      </div>

      <p className="text-sm text-ink-secondary">
        Click <strong>Add Item</strong> to search by stock code and set quantity. Use{" "}
        <strong>Copy BOM for Excel</strong> to paste straight into your CowAg template at cell{" "}
        <strong>A6</strong> (columns A–O). You can still edit cells inline below.
      </p>

      <BomSpreadsheet
        quote={quote}
        onChange={onChange}
        searchTarget={searchTarget}
        onSearchTargetChange={setSearchTarget}
        hideEmptySections={hideEmptySections}
        onAddItem={openAddItemModal}
        onAddManualItem={handleAddManualItem}
      />

      <AddItemModal
        open={addItemTarget != null}
        sectionName={addItemTarget?.sectionName ?? "Section"}
        onClose={() => setAddItemTarget(null)}
        onAdd={handleConfirmAddItem}
      />

      <div aria-hidden className="h-24 shrink-0 sm:h-32" />
    </div>
  );
}
