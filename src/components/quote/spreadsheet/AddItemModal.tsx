"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/pricing/calculations";
import { productToBomItem } from "@/lib/quote/product-to-item";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/** Fixed height so the modal never shifts when results load or clear. */
const RESULTS_PANEL_CLASS = "h-[15rem]";

export function AddItemModal({
  open,
  sectionName,
  onClose,
  onAdd,
}: {
  open: boolean;
  sectionName: string;
  onClose: () => void;
  onAdd: (item: ReturnType<typeof productToBomItem>) => void;
}) {
  const [code, setCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setQuantity("1");
    setResults([]);
    setSelected(null);
    setHighlight(0);
    setError(null);
    window.requestAnimationFrame(() => codeRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const q = code.trim();
    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (selected) return;

    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/products?q=${encodeURIComponent(q)}&limit=12&mode=all`
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as Product[];
        setResults(Array.isArray(data) ? data : []);
        setHighlight(0);
      } catch {
        setResults([]);
        setError("Could not search catalogue");
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [code, open, selected]);

  const pick = (product: Product) => {
    setSelected(product);
    setCode(product.cowagCode ?? product.supplierPartNumber ?? product.description);
  };

  const clearSelection = () => {
    setSelected(null);
    setCode("");
    setResults([]);
    setHighlight(0);
    codeRef.current?.focus();
  };

  const parsedQty = () => {
    const n = Number(quantity);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const preview =
    selected != null ? productToBomItem(selected, parsedQty() ?? 1) : null;

  const canAdd = selected != null && parsedQty() != null;

  const submit = () => {
    if (!selected || !canAdd) return;
    onAdd(productToBomItem(selected, parsedQty()!));
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add item"
      subtitle={`Adding to ${sectionName}`}
      size="md"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={!canAdd}>
            Add to quote
          </Button>
        </div>
      }
    >
      <div>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <div>
            <label className="field-label" htmlFor="add-item-code">
              CowAg code or description
            </label>
            <input
              ref={codeRef}
              id="add-item-code"
              className="input-field font-mono"
              placeholder="e.g. PIGNIB-15 or nipple"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setSelected(null);
              }}
              onKeyDown={(e) => {
                if (selected) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlight((h) => Math.max(h - 1, 0));
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results[highlight]) pick(results[highlight]);
                }
              }}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="add-item-qty">
              Quantity
            </label>
            <input
              id="add-item-qty"
              className="input-field text-right tabular-nums"
              type="number"
              min={0.01}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdd) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>

        <div
          className={`mt-4 ${RESULTS_PANEL_CLASS} overflow-y-auto rounded-xl border border-border bg-page/40`}
          aria-live="polite"
        >
          {selected && preview ? (
            <div className="p-4 space-y-3">
              <p className="text-sm font-medium text-ink">{preview.description}</p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-ink-secondary">Code</dt>
                <dd className="font-mono text-ink">{preview.cowagPartNumber || "—"}</dd>
                <dt className="text-ink-secondary">Unit</dt>
                <dd>{preview.unit || "EACH"}</dd>
                <dt className="text-ink-secondary">Sell each</dt>
                <dd className="tabular-nums">{formatPrice(preview.sellEach)}</dd>
                <dt className="text-ink-secondary">Sell total</dt>
                <dd className="font-semibold tabular-nums text-brand-dark">
                  {formatPrice(preview.sellTotal)}
                </dd>
                {preview.costEach != null && (
                  <>
                    <dt className="text-ink-secondary">Cost each</dt>
                    <dd className="tabular-nums">{formatPrice(preview.costEach)}</dd>
                  </>
                )}
              </dl>
              <button
                type="button"
                className="text-xs text-brand hover:underline"
                onClick={clearSelection}
              >
                Choose a different product
              </button>
            </div>
          ) : loading ? (
            <p className="flex h-full items-center px-4 text-sm text-ink-secondary">
              Searching catalogue…
            </p>
          ) : error ? (
            <p className="flex h-full items-center px-4 text-sm text-red-600">{error}</p>
          ) : results.length > 0 ? (
            <ul className="divide-y divide-border">
              {results.map((product, index) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors ${
                      index === highlight ? "bg-brand-soft" : "hover:bg-brand-soft/50"
                    }`}
                    onClick={() => pick(product)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{product.description}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-dark">
                        {formatPrice(product.sellPrice)}
                      </span>
                    </div>
                    <span className="text-xs text-ink-secondary">
                      <span className="font-mono font-medium text-ink">
                        {product.cowagCode || product.supplierPartNumber || "No code"}
                      </span>
                      {" · "}
                      {product.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : code.trim().length >= 1 ? (
            <p className="flex h-full items-center px-4 text-sm text-ink-secondary">
              No matches — try a different code or keyword.
            </p>
          ) : (
            <p className="flex h-full items-center px-4 text-sm text-ink-secondary">
              Matching products will appear here as you type.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
