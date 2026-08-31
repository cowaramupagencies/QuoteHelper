"use client";

import type { Quote } from "@/types";
import {
  buildCustomerQuoteLines,
  calculateOptionTotals,
  formatPrice,
  GST_RATE,
} from "@/lib/pricing/calculations";

export function QuotationPricingSheet({ quote }: { quote: Quote }) {
  const pricingMode = quote.customerPricingMode ?? "itemised";

  return (
    <div className="quote-sheet-wrap surface-card overflow-hidden">
      <div className="border-b border-border bg-brand/10 px-4 py-3">
        <h3 className="font-semibold text-brand-dark">Quoted Price</h3>
        <p className="text-xs text-ink-secondary mt-0.5">
          Mirrors the Quotation sheet pricing block — data flows from Job BOM section settings above.
        </p>
      </div>
      <div className="quote-sheet-scroll">
        {quote.options.map((option) => {
          const totals = calculateOptionTotals(option);
          const lines = buildCustomerQuoteLines(option, pricingMode);
          return (
            <div key={option.id} className="border-b border-border last:border-0">
              <table className="quote-pricing-table w-full">
                <thead>
                  <tr className="quote-row-option">
                    <th colSpan={2} className="text-left font-semibold">
                      {option.name}
                    </th>
                    <th className="text-right text-xs uppercase tracking-wide">Ex-GST</th>
                    <th className="text-right text-xs uppercase tracking-wide">Total Inc-GST</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.label} className="quote-row-line">
                      <td colSpan={2}>{line.label}</td>
                      <td className="text-right tabular-nums">{formatPrice(line.exGst)}</td>
                      <td className="text-right tabular-nums">
                        {formatPrice(line.exGst * (1 + GST_RATE))}
                      </td>
                    </tr>
                  ))}
                  <tr className="quote-row-total font-semibold">
                    <td colSpan={2}>{option.name} Total</td>
                    <td className="text-right tabular-nums">{formatPrice(totals.sellExGst)}</td>
                    <td className="text-right tabular-nums">{formatPrice(totals.sellIncGst)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
