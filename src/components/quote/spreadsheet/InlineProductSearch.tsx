"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/pricing/calculations";

const ITEM_HEIGHT = 58;
const DROPDOWN_GAP = 6;
const VIEWPORT_MARGIN = 20;
const MIN_VISIBLE_ITEMS = 5;
const PREFERRED_VISIBLE_ITEMS = 6;
const MAX_VISIBLE_ITEMS = 8;

function layoutDropdown(input: HTMLInputElement): CSSProperties {
  const rect = input.getBoundingClientRect();
  const viewportH = window.innerHeight;

  const spaceBelow = viewportH - rect.bottom - VIEWPORT_MARGIN;
  const spaceAbove = rect.top - VIEWPORT_MARGIN;

  const preferredHeight = PREFERRED_VISIBLE_ITEMS * ITEM_HEIGHT;
  const minHeight = MIN_VISIBLE_ITEMS * ITEM_HEIGHT;
  const maxHeightCap = MAX_VISIBLE_ITEMS * ITEM_HEIGHT;

  let openBelow = spaceBelow >= minHeight || spaceBelow >= spaceAbove;
  let available = openBelow ? spaceBelow : spaceAbove;
  let height = Math.min(preferredHeight, maxHeightCap, available);

  if (height < minHeight) {
    openBelow = spaceBelow >= spaceAbove;
    available = openBelow ? spaceBelow : spaceAbove;
    height = Math.min(maxHeightCap, Math.max(available, minHeight * 0.85));
  }

  height = Math.max(height, ITEM_HEIGHT * 3);

  const style: CSSProperties = {
    position: "fixed",
    left: rect.left,
    width: Math.max(rect.width, 340),
    maxWidth: "min(34rem, calc(100vw - 1rem))",
    height,
    overflowY: "auto",
    zIndex: 9999,
  };

  if (openBelow) {
    style.top = rect.bottom + DROPDOWN_GAP;
  } else {
    style.bottom = viewportH - rect.top + DROPDOWN_GAP;
  }

  return style;
}

export function InlineProductSearch({
  autoFocus,
  value = "",
  onChange,
  onSelect,
  onCancel,
  searchMode = "all",
}: {
  autoFocus?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onSelect: (product: Product) => void;
  onCancel?: () => void;
  searchMode?: "all" | "code";
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Product[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const reposition = () => {
    const el = inputRef.current;
    if (!el) return;
    setDropdownStyle(layoutDropdown(el));
  };

  const openSearch = (scrollIntoView = false) => {
    setOpen(true);
    const el = inputRef.current;
    if (!el) return;
    reposition();
    if (scrollIntoView) {
      window.requestAnimationFrame(() => {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        reposition();
      });
    }
  };

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      openSearch(true);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("bom-search-active");
      return;
    }

    document.body.classList.add("bom-search-active");
    reposition();
    const update = () => reposition();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.body.classList.remove("bom-search-active");
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, results.length, loading, query]);

  useEffect(() => {
    if (!open || query.trim().length < 1) {
      setResults([]);
      setHighlight(0);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/products?q=${encodeURIComponent(query.trim())}&limit=20&mode=${searchMode}`
        );
        if (!res.ok) {
          throw new Error("Search failed");
        }
        const data = (await res.json()) as Product[];
        if (!Array.isArray(data)) {
          throw new Error("Unexpected search response");
        }
        setResults(data);
        setHighlight(0);
      } catch {
        setResults([]);
        setError("Could not search catalogue");
      } finally {
        setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query, open, searchMode]);

  const pick = (product: Product) => {
    onSelect(product);
    setOpen(false);
  };

  const showDropdown =
    open && (loading || error != null || results.length > 0 || query.trim().length >= 1);

  return (
    <>
      <input
        ref={inputRef}
        className="bom-cell-input w-full min-w-[220px]"
        placeholder={
          searchMode === "code"
            ? "Type CowAg stock code…"
            : "Type stock code or description…"
        }
        value={query}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange?.(next);
          openSearch();
        }}
        onFocus={() => openSearch(true)}
        onBlur={(e) => {
          const related = e.relatedTarget as Node | null;
          if (dropdownRef.current?.contains(related)) return;
          window.setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            onCancel?.();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          }
          if (e.key === "Enter" && results[highlight]) {
            e.preventDefault();
            pick(results[highlight]);
          }
        }}
      />
      {showDropdown &&
        typeof document !== "undefined" &&
        createPortal(
          <ul
            ref={dropdownRef}
            style={dropdownStyle}
            className="catalogue-search-dropdown rounded-xl border border-border bg-surface shadow-card"
            onMouseDown={(e) => e.preventDefault()}
          >
            {loading && (
              <li className="px-3 py-2.5 text-sm text-ink-secondary">Searching…</li>
            )}
            {error && <li className="px-3 py-2.5 text-sm text-red-600">{error}</li>}
            {!loading && !error && results.length === 0 && query.trim().length >= 1 && (
              <li className="px-3 py-2.5 text-sm text-ink-secondary">
                No matches — try a stock code or keyword
              </li>
            )}
            {!loading &&
              !error &&
              results.map((product, index) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className={`catalogue-search-option flex w-full flex-col gap-1 px-3 py-2.5 text-left ${
                      index === highlight ? "bg-brand-soft" : "hover:bg-brand-soft/60"
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
                      {product.cowagCode ? (
                        <span className="font-mono font-medium text-ink">{product.cowagCode}</span>
                      ) : (
                        "No code"
                      )}
                      {" · "}
                      {product.unit}
                      {product.costEach != null ? ` · Cost ${formatPrice(product.costEach)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
          </ul>,
          document.body
        )}
    </>
  );
}
