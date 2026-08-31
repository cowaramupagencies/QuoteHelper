"use client";

import type { Quote } from "@/types";

export function BomSheetMeta({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (quote: Quote) => void;
}) {
  return (
    <div className="bom-meta-grid border-b border-border bg-page/80 px-3 py-3 text-sm">
      <div className="bom-meta-row">
        <span className="bom-meta-label">Quote Ref</span>
        <input
          className="bom-meta-input"
          value={quote.quoteNumber}
          onChange={(e) => onChange({ ...quote, quoteNumber: e.target.value })}
        />
        <span className="bom-meta-label ml-6">Customer ID</span>
        <input
          className="bom-meta-input"
          value={quote.customer.customerId ?? ""}
          onChange={(e) =>
            onChange({ ...quote, customer: { ...quote.customer, customerId: e.target.value } })
          }
        />
      </div>
      <div className="bom-meta-row mt-2">
        <span className="bom-meta-label">Date</span>
        <input
          type="date"
          className="bom-meta-input"
          value={quote.quoteDate.slice(0, 10)}
          onChange={(e) => onChange({ ...quote, quoteDate: e.target.value })}
        />
        <span className="bom-meta-label ml-6">Customer Name</span>
        <input
          className="bom-meta-input flex-1 min-w-[12rem]"
          value={quote.customer.name}
          onChange={(e) =>
            onChange({ ...quote, customer: { ...quote.customer, name: e.target.value } })
          }
        />
      </div>
    </div>
  );
}
