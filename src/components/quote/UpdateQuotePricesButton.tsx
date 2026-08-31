"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Quote } from "@/types";
import type { QuotePriceRefreshPreview } from "@/lib/quote/refresh-prices";
import { formatPrice } from "@/lib/pricing/calculations";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

function formatEach(value: number | null): string {
  if (value == null) return "—";
  return formatPrice(value);
}

export function UpdateQuotePricesButton({
  quote,
  onUpdated,
}: {
  quote: Quote;
  onUpdated: (quote: Quote) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<QuotePriceRefreshPreview | null>(null);

  async function loadPreview() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/refresh-prices`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load price changes");
      setPreview(data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load price changes");
    } finally {
      setLoading(false);
    }
  }

  async function applyChanges() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/refresh-prices/apply`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not apply price changes");

      onUpdated(data.quote);
      setOpen(false);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply price changes");
    } finally {
      setApplying(false);
    }
  }

  const updates = preview?.changes.filter((c) => c.status === "would_update") ?? [];

  return (
    <>
      <button
        type="button"
        className="btn-secondary"
        disabled={loading}
        onClick={() => void loadPreview()}
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        Update with current prices
      </button>

      {error && !open ? <p className="text-sm text-red-600">{error}</p> : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Update with current prices"
        subtitle="Compare this quote against the current catalogue and active Tencia import costs."
        size="xl"
        footer={
          preview ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink-secondary">
                {preview.summary.wouldUpdate > 0
                  ? `${preview.summary.wouldUpdate} line item${preview.summary.wouldUpdate === 1 ? "" : "s"} will be updated.`
                  : "All line items already match current catalogue prices."}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={applying || preview.summary.wouldUpdate === 0}
                  onClick={() => void applyChanges()}
                >
                  {applying ? "Applying…" : "Apply changes"}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <p className="text-sm text-ink-secondary">Checking current catalogue prices…</p>
        ) : preview ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4 text-sm">
              <div className="rounded-xl border border-border p-3">
                <p className="text-ink-secondary">Would update</p>
                <p className="text-lg font-semibold text-ink">{preview.summary.wouldUpdate}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-ink-secondary">Unchanged</p>
                <p className="text-lg font-semibold text-ink">{preview.summary.unchanged}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-ink-secondary">Not in catalogue</p>
                <p className="text-lg font-semibold text-ink">{preview.summary.notFound}</p>
              </div>
              <div className="rounded-xl border border-border p-3">
                <p className="text-ink-secondary">Skipped</p>
                <p className="text-lg font-semibold text-ink">{preview.summary.skipped}</p>
              </div>
            </div>

            {updates.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-border bg-brand-soft/20 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">Item</th>
                      <th className="px-4 py-3 font-medium">Cost each</th>
                      <th className="px-4 py-3 font-medium">Sell each</th>
                    </tr>
                  </thead>
                  <tbody>
                    {updates.map((change) => (
                      <tr key={change.itemId} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-ink">{change.description}</p>
                          <p className="mt-1 text-ink-secondary">
                            {change.optionName} · {change.sectionName}
                            {change.cowagPartNumber ? ` · ${change.cowagPartNumber}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums">
                          {formatEach(change.previousCostEach)} →{" "}
                          <span className="font-medium text-ink">{formatEach(change.newCostEach)}</span>
                        </td>
                        <td className="px-4 py-3 align-top tabular-nums">
                          {formatEach(change.previousSellEach)} →{" "}
                          <span className="font-medium text-ink">{formatEach(change.newSellEach)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-secondary">
                No price differences were found against the current catalogue.
              </p>
            )}

            {preview.summary.notFound > 0 && (
              <details className="rounded-xl border border-border p-4 text-sm">
                <summary className="cursor-pointer font-medium text-ink">
                  {preview.summary.notFound} item{preview.summary.notFound === 1 ? "" : "s"} not found in
                  catalogue
                </summary>
                <ul className="mt-3 space-y-2 text-ink-secondary">
                  {preview.changes
                    .filter((c) => c.status === "not_found")
                    .slice(0, 12)
                    .map((change) => (
                      <li key={change.itemId}>
                        {change.description}
                        {change.cowagPartNumber ? ` (${change.cowagPartNumber})` : ""}
                      </li>
                    ))}
                </ul>
              </details>
            )}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <p className="text-sm text-ink-secondary">
              Only matched catalogue/Tencia prices are updated. Manual overrides, FREE, Included, and POA lines
              are left unchanged where appropriate.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
