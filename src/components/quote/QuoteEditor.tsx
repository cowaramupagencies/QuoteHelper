"use client";

import { useState } from "react";
import clsx from "clsx";
import type { Quote } from "@/types";
import type { AutoSaveStatus } from "@/hooks/useAutoSaveQuote";
import { JobBomTab } from "./spreadsheet/JobBomTab";
import { QuotationTab } from "./spreadsheet/QuotationTab";

type Tab = "bom" | "quotation";

function saveStatusLabel(status: AutoSaveStatus): string {
  if (status === "saving") return "Saving…";
  if (status === "pending") return "Unsaved changes…";
  if (status === "error") return "Save failed";
  return "All changes saved";
}

export function QuoteEditor({
  quote,
  onChange,
  saveStatus,
}: {
  quote: Quote;
  onChange: (quote: Quote) => void;
  saveStatus: AutoSaveStatus;
}) {
  const [tab, setTab] = useState<Tab>("bom");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-2 shadow-card">
        {(
          [
            ["bom", "Job BOM"],
            ["quotation", "Quotation"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              "tab-btn flex-1 sm:flex-none sm:min-w-[9rem]",
              tab === id ? "tab-btn-active" : "tab-btn-inactive"
            )}
          >
            {label}
          </button>
        ))}
        <span
          className={clsx(
            "ml-auto text-sm",
            saveStatus === "error" ? "text-red-600" : "text-ink-secondary",
            (saveStatus === "pending" || saveStatus === "saving") && "animate-pulse"
          )}
          aria-live="polite"
        >
          {saveStatusLabel(saveStatus)}
        </span>
      </div>

      {tab === "bom" && <JobBomTab quote={quote} onChange={onChange} />}
      {tab === "quotation" && <QuotationTab quote={quote} onChange={onChange} />}
    </div>
  );
}
