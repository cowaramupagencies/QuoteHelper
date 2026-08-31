"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

interface Meta {
  sourceFile: string;
  lastUpdated: string;
  productCount: number;
}

interface ImportSummary {
  matched: number;
  pricesChanged: number;
  newProducts: number;
  notFound: number;
}

export default function PriceListsPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [currentCount, setCurrentCount] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/price-lists");
    const data = await res.json();
    setMeta(data.meta);
    setCurrentCount(data.currentCount);
  }

  useEffect(() => {
    load();
  }, []);

  async function importSeed() {
    setLoading(true);
    try {
      const res = await fetch("/api/price-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed" }),
      });
      setSummary(await res.json());
      await load();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Price Lists"
        subtitle="Manage CowAg catalogue pricing and imports."
      />

      <section className="surface-card space-y-5 p-6 sm:p-7">
        <h2 className="section-title">CowAg price list</h2>
        <p className="text-sm text-ink-secondary">
          Imports from <strong>Current Price List - To Save on Desktop.pdf</strong> in the project data
          folder. Sell prices always use <strong>Sell Price 1</strong> from the PDF.
        </p>
        {meta ? (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-secondary">Source file</dt>
              <dd className="text-right font-medium text-ink">{meta.sourceFile}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-secondary">Last updated</dt>
              <dd>{new Date(meta.lastUpdated).toLocaleDateString("en-AU")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-secondary">Products in catalogue</dt>
              <dd>{currentCount.toLocaleString()}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-ink-secondary">No price list imported yet.</p>
        )}

        <Button
          type="button"
          onClick={importSeed}
          disabled={loading}
          className="w-full sm:w-auto"
        >
          {loading ? "Importing…" : currentCount > 0 ? "Re-import price list" : "Import price list"}
        </Button>
      </section>

      {summary && (
        <section className="surface-card space-y-3 p-6 sm:p-7">
          <h2 className="section-title">Import summary</h2>
          <ul className="space-y-2 text-sm text-ink-secondary">
            <li>Products matched: {summary.matched}</li>
            <li>Prices changed: {summary.pricesChanged}</li>
            <li>New products: {summary.newProducts}</li>
            <li>Products not found: {summary.notFound}</li>
          </ul>
        </section>
      )}
    </div>
  );
}
