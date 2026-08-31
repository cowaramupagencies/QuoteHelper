"use client";

import { useState } from "react";
import { ClipboardCopy, Check } from "lucide-react";
import type { Quote } from "@/types";
import { formatJobBomClipboardText } from "@/lib/excel/job-bom-rows";

export function CopyBomForExcelButton({
  quote,
  showHint = false,
}: {
  quote: Quote;
  showHint?: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    setStatus("idle");
    try {
      const bomText = formatJobBomClipboardText(quote);
      if (!bomText.trim()) {
        throw new Error("No BOM rows to copy");
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard not available");
      }

      await navigator.clipboard.writeText(bomText);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className={showHint ? "flex flex-col items-start gap-1" : undefined}>
      <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
        {status === "copied" ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
        {status === "copied" ? "BOM copied" : "Copy BOM for Excel"}
      </button>
      {showHint ? (
        <p className="text-xs text-ink-secondary max-w-md">
          Tab-separated columns A–O (Supplier through Notes), matching the Job BOM sheet. Open your
          CowAg template, select cell <strong className="text-ink">A6</strong>, and paste.
        </p>
      ) : null}
      {status === "error" ? (
        <p className="text-xs text-red-600">Could not copy — try Export Excel instead.</p>
      ) : null}
    </div>
  );
}
