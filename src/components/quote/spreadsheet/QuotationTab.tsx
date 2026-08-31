"use client";

import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import type { CustomerPricingMode, Quote } from "@/types";
import {
  formatPrice,
  formatSectionSummary,
  summarizeSection,
} from "@/lib/pricing/calculations";
import { getScopeCapacityStatus } from "@/lib/scope/capacity";
import { updateSection } from "@/lib/quote/bom-mutations";
import { QuotationPricingSheet } from "./QuotationPricingSheet";

const PRICING_MODE_OPTIONS: { value: CustomerPricingMode; label: string; hint: string }[] = [
  {
    value: "itemised",
    label: "Itemised",
    hint: "Each section appears as its own line on the customer quote.",
  },
  {
    value: "grouped",
    label: "Combined sections",
    hint: "Sections with the same pricing group roll up into one line.",
  },
  {
    value: "single_total",
    label: "All in one",
    hint: "Only the option total is shown — no section breakdown.",
  },
];

interface Clause {
  id: string;
  title: string;
  text: string;
  category: string | null;
}

export function QuotationTab({
  quote,
  onChange,
}: {
  quote: Quote;
  onChange: (quote: Quote) => void;
}) {
  const [clauses, setClauses] = useState<Clause[]>([]);
  const scopeCapacity = getScopeCapacityStatus(quote.scopeText);
  const pricingMode = quote.customerPricingMode ?? "itemised";

  useEffect(() => {
    fetch("/api/scope-clauses")
      .then((r) => r.json())
      .then(setClauses);
  }, []);

  const patch = (partial: Partial<Quote>) => onChange({ ...quote, ...partial });

  const insertClause = (text: string) => {
    const next = quote.scopeText ? `${quote.scopeText}\n\n${text}` : text;
    patch({ scopeText: next });
  };

  return (
    <div className="space-y-8">
      <section className="surface-card p-5 sm:p-6">
        <h2 className="section-title mb-4">Customer &amp; quote details</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="To / Customer">
            <input
              className="input-field"
              value={quote.customer.name}
              onChange={(e) =>
                patch({ customer: { ...quote.customer, name: e.target.value } })
              }
            />
          </Field>
          <Field label="Quote number">
            <input
              className="input-field"
              value={quote.quoteNumber}
              onChange={(e) => patch({ quoteNumber: e.target.value })}
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              className="input-field"
              value={quote.quoteDate.slice(0, 10)}
              onChange={(e) => patch({ quoteDate: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              className="input-field"
              value={quote.customer.email ?? ""}
              onChange={(e) =>
                patch({ customer: { ...quote.customer, email: e.target.value } })
              }
            />
          </Field>
          <Field label="Mobile">
            <input
              className="input-field"
              value={quote.customer.mobile ?? ""}
              onChange={(e) =>
                patch({ customer: { ...quote.customer, mobile: e.target.value } })
              }
            />
          </Field>
          <Field label="Phone">
            <input
              className="input-field"
              value={quote.customer.phone ?? ""}
              onChange={(e) =>
                patch({ customer: { ...quote.customer, phone: e.target.value } })
              }
            />
          </Field>
          <Field label="Site / delivery address">
            <input
              className="input-field"
              value={quote.delivery.address ?? ""}
              onChange={(e) =>
                patch({ delivery: { ...quote.delivery, address: e.target.value } })
              }
            />
          </Field>
          <Field label="Suburb">
            <input
              className="input-field"
              value={quote.delivery.suburb ?? ""}
              onChange={(e) =>
                patch({ delivery: { ...quote.delivery, suburb: e.target.value } })
              }
            />
          </Field>
          <Field label="Start date">
            <input
              className="input-field"
              value={quote.delivery.startDate ?? ""}
              onChange={(e) =>
                patch({ delivery: { ...quote.delivery, startDate: e.target.value } })
              }
              placeholder="TBC"
            />
          </Field>
          <Field label="Customer quote pricing" className="sm:col-span-2 lg:col-span-3">
            <select
              className="input-field"
              value={pricingMode}
              onChange={(e) =>
                patch({ customerPricingMode: e.target.value as CustomerPricingMode })
              }
            >
              {PRICING_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-ink-secondary">
              {PRICING_MODE_OPTIONS.find((o) => o.value === pricingMode)?.hint}
            </p>
          </Field>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3 surface-card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Scope of Works and Supply</h2>
            <span
              className={clsx(
                "text-sm font-medium tabular-nums",
                scopeCapacity.isOverLimit ? "text-red-600" : "text-ink-secondary"
              )}
            >
              {scopeCapacity.charCount}/{scopeCapacity.maxCharacters} chars
              {scopeCapacity.isOverLimit ? " — over Excel box" : ""}
            </span>
          </div>
          <textarea
            className={clsx(
              "input-field min-h-[320px] resize-y font-normal leading-relaxed",
              scopeCapacity.isOverLimit && "border-red-300 focus:border-red-400 focus:ring-red-200"
            )}
            value={quote.scopeText}
            onChange={(e) => patch({ scopeText: e.target.value })}
            placeholder={"Proposal:\n\nSupply & Installation of…\n\n- Item one\n- Item two\n\nExclusions\n…"}
          />
          {scopeCapacity.isOverLimit && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Scope exceeds the standard Excel box (A70:L82). Trim wording or export may push pricing
              down.
            </p>
          )}
        </div>
        <div className="space-y-3 surface-card p-5 sm:p-6">
          <h2 className="section-title">Saved clauses</h2>
          <div className="space-y-2 max-h-[420px] overflow-auto">
            {clauses.map((clause) => (
              <button
                key={clause.id}
                type="button"
                className="w-full rounded-xl border border-border p-3 text-left hover:border-brand/30 hover:bg-brand-soft/40"
                onClick={() => insertClause(clause.text)}
              >
                <p className="font-medium text-sm">{clause.title}</p>
                <p className="mt-1 text-xs text-ink-secondary line-clamp-2">{clause.text}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-card p-5 sm:p-6 space-y-4">
        <h2 className="section-title">Section → Quotation mapping</h2>
        <p className="text-sm text-ink-secondary">
          Each BOM section can appear on the customer quote. Use <strong>Quote group</strong> to combine
          multiple sections into one pricing line (set pricing mode to Combined sections). Override
          sell totals when the customer-facing amount differs from the BOM.
        </p>

        {quote.options.map((option) => (
          <div key={option.id} className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-page text-left text-xs uppercase tracking-wide text-ink-secondary">
                  <th className="px-3 py-2 font-semibold">BOM section</th>
                  <th className="px-3 py-2 font-semibold">Customer label</th>
                  <th className="px-3 py-2 font-semibold">On quote</th>
                  <th className="px-3 py-2 font-semibold">Quote group</th>
                  <th className="px-3 py-2 font-semibold">BOM sell (ex)</th>
                  <th className="px-3 py-2 font-semibold">Override</th>
                </tr>
              </thead>
              <tbody>
                {option.sections
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((section) => {
                    const summary = summarizeSection(section);
                    return (
                      <tr key={section.id} className="border-t border-border/70">
                        <td className="px-3 py-2 font-medium">{section.name}</td>
                        <td className="px-3 py-2">
                          <input
                            className="input-field !min-h-0 !py-2 text-sm w-full"
                            value={section.customerLabel ?? ""}
                            onChange={(e) =>
                              onChange(
                                updateSection(quote, option.id, section.id, {
                                  customerLabel: e.target.value,
                                })
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-brand"
                            checked={section.showOnCustomerQuote}
                            onChange={(e) =>
                              onChange(
                                updateSection(quote, option.id, section.id, {
                                  showOnCustomerQuote: e.target.checked,
                                })
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-field !min-h-0 !py-2 text-sm w-full"
                            placeholder="e.g. Pump package"
                            value={section.customerPricingGroup ?? ""}
                            onChange={(e) =>
                              onChange(
                                updateSection(quote, option.id, section.id, {
                                  customerPricingGroup: e.target.value,
                                })
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-ink-secondary tabular-nums">
                          {formatSectionSummary(summary)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="input-field !min-h-0 !py-2 text-sm w-28"
                            placeholder="Auto"
                            value={section.customerTotalOverride ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              onChange(
                                updateSection(quote, option.id, section.id, {
                                  customerTotalOverride: raw === "" ? null : Number(raw),
                                })
                              );
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <QuotationPricingSheet quote={quote} />
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
