"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Download, LayoutTemplate } from "lucide-react";
import type { Quote } from "@/types";
import { QuoteEditor } from "@/components/quote/QuoteEditor";
import { UpdateQuotePricesButton } from "@/components/quote/UpdateQuotePricesButton";
import { CopyBomForExcelButton } from "@/components/quote/CopyBomForExcelButton";
import { useAutoSaveQuote } from "@/hooks/useAutoSaveQuote";

function SaveStatus({
  status,
  error,
  onRetry,
}: {
  status: ReturnType<typeof useAutoSaveQuote>["status"];
  error: string | null;
  onRetry: () => void;
}) {
  if (status === "error") {
    return (
      <span className="text-sm text-red-600">
        Save failed{error ? `: ${error}` : ""}.{" "}
        <button type="button" className="underline font-medium" onClick={onRetry}>
          Retry
        </button>
      </span>
    );
  }

  const label =
    status === "saving"
      ? "Saving…"
      : status === "pending"
        ? "Unsaved changes…"
        : "All changes saved";

  return (
    <span
      className={
        status === "saved"
          ? "text-sm text-ink-secondary"
          : "text-sm text-ink-secondary animate-pulse"
      }
      aria-live="polite"
    >
      {label}
    </span>
  );
}

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);

  useEffect(() => {
    params.then((p) => setQuoteId(p.id));
  }, [params]);

  useEffect(() => {
    if (!quoteId) return;
    fetch(`/api/quotes/${quoteId}`)
      .then((r) => r.json())
      .then(setQuote);
  }, [quoteId]);

  const { status, error, saveNow } = useAutoSaveQuote(quote, setQuote);

  const saveAsTemplate = useCallback(async () => {
    const name = window.prompt("Template name", quote?.templateName ?? "Custom template");
    if (!name || !quote) return;
    await saveNow();
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        kind: "job",
        description: `Saved from quote ${quote.quoteNumber}`,
        payload: {
          options: quote.options,
          customerPricingMode: quote.customerPricingMode ?? "itemised",
        },
      }),
    });
  }, [quote, saveNow]);

  if (!quote) {
    return <div className="py-20 text-center text-muted">Loading quote…</div>;
  }

  const isSaving = status === "saving" || status === "pending";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Link href="/" className="btn-ghost !min-h-0 !px-3 !py-2 mt-1">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">
              {quote.customer.name || "Untitled Quote"}
            </h1>
            <p className="text-muted">
              #{quote.quoteNumber} · {quote.templateName ?? "Custom"}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <UpdateQuotePricesButton quote={quote} onUpdated={setQuote} />
            <CopyBomForExcelButton quote={quote} />
            <button type="button" className="btn-secondary" onClick={saveAsTemplate}>
              <LayoutTemplate className="h-4 w-4" />
              Save as Template
            </button>
            <button
              className="btn-primary"
              disabled={isSaving}
              onClick={async () => {
                await saveNow();
                window.location.assign(`/api/quotes/${quote.id}/export`);
              }}
            >
              <Download className="h-4 w-4" />
              Export Excel
            </button>
          </div>
          <SaveStatus status={status} error={error} onRetry={() => void saveNow()} />
        </div>
      </div>

      <QuoteEditor quote={quote} onChange={setQuote} saveStatus={status} />
    </div>
  );
}
