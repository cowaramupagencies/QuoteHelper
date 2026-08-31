"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type {
  CatalogueImportBatch,
  CatalogueImportPreview,
  CatalogueImportStatus,
} from "@/types/catalogue-imports";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

interface CategoryOverview {
  id: string;
  name: string;
  activeBatchId: string | null;
  activeBatchFilename: string | null;
  activeBatchImportedAt: string | null;
  batches: CatalogueImportBatch[];
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

function statusLabel(status: CatalogueImportStatus): string {
  switch (status) {
    case "imported":
      return "Imported (not live)";
    case "active":
      return "Active";
    case "superseded":
      return "Superseded";
    case "failed":
      return "Failed";
  }
}

function columnMappingSummary(mapping: Record<string, string | null>): string {
  const parts = Object.entries(mapping)
    .filter(([, header]) => header)
    .map(([field, header]) => `${field}: "${header}"`);
  return parts.length > 0 ? parts.join(" · ") : "No columns matched";
}

function ImportPreviewPanel({ preview }: { preview: CatalogueImportPreview }) {
  const { parse, activeBatch, changes } = preview;
  const hasActive = activeBatch != null;

  return (
    <div className="rounded-xl border border-border bg-brand-soft/20 p-4 text-sm space-y-4">
      <div>
        <p className="font-medium text-ink">Import preview — {preview.originalFilename}</p>
        <p className="mt-1 text-ink-secondary">
          Target category: <strong className="text-ink">{preview.categoryName}</strong>
          {" · "}
          {parse.rowsParsed} rows parsed
        </p>
        <p className="mt-1 text-ink-secondary">{columnMappingSummary(parse.columnMapping)}</p>
      </div>

      {parse.errors.length > 0 && (
        <ul className="list-disc pl-5 text-red-600">
          {parse.errors.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      {parse.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-ink-secondary">
          {parse.warnings.map((msg) => (
            <li key={msg}>{msg}</li>
          ))}
        </ul>
      )}

      {preview.canImport && (
        <div className="space-y-2">
          <p className="font-medium text-ink">If you import this file</p>
          {!hasActive ? (
            <p className="text-ink-secondary">
              This category has no live version yet. Importing will store a new version ({parse.rowsParsed}{" "}
              rows). You can review it before activating.
            </p>
          ) : (
            <>
              <p className="text-ink-secondary">
                Compared to the current live version <strong className="text-ink">{activeBatch.originalFilename}</strong>{" "}
                ({activeBatch.rowCount} rows, {formatWhen(activeBatch.importedAt)}):
              </p>
              <ul className="list-disc pl-5 text-ink-secondary space-y-1">
                <li>
                  <strong className="text-ink">{changes.newCount}</strong> new product
                  {changes.newCount === 1 ? "" : "s"} in this CSV
                </li>
                <li>
                  <strong className="text-ink">{changes.costChangeCount}</strong> cost
                  {changes.costChangeCount === 1 ? "" : "s"} changed
                </li>
                <li>
                  <strong className="text-ink">{changes.unchangedCount}</strong> unchanged (same cost)
                </li>
                {changes.removedCount > 0 && (
                  <li>
                    <strong className="text-ink">{changes.removedCount}</strong> product
                    {changes.removedCount === 1 ? "" : "s"} in the live version but not in this CSV
                    {" "}(will remain in the old version; only affects live data if you activate this import)
                  </li>
                )}
              </ul>
            </>
          )}

          {changes.newItems.length > 0 && (
            <div>
              <p className="font-medium text-ink mt-2">Sample new items</p>
              <ul className="mt-1 space-y-1 text-ink-secondary">
                {changes.newItems.map((item) => (
                  <li key={item.code}>
                    {item.code} — {item.description} ({formatMoney(item.costEach)})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {changes.costChanges.length > 0 && (
            <div>
              <p className="font-medium text-ink mt-2">Sample cost changes</p>
              <ul className="mt-1 space-y-1 text-ink-secondary">
                {changes.costChanges.map((item) => (
                  <li key={item.code}>
                    {item.code} — {formatMoney(item.previousCost)} → {formatMoney(item.newCost)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {changes.removedItems.length > 0 && (
            <div>
              <p className="font-medium text-ink mt-2">Sample items not in CSV</p>
              <ul className="mt-1 space-y-1 text-ink-secondary">
                {changes.removedItems.map((item) => (
                  <li key={item.code}>
                    {item.code} — {item.description} (live cost {formatMoney(item.costEach)})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-ink-secondary pt-1">
            Upload stores a new import version only. Live catalogue data changes only if you activate it.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AdminCatalogueImportsPage() {
  const [categories, setCategories] = useState<CategoryOverview[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CatalogueImportBatch | null>(null);
  const [preview, setPreview] = useState<CatalogueImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [activateOnUpload, setActivateOnUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/catalogue-imports");
      const data = (await res.json()) as CategoryOverview[];
      setCategories(data);
      setSelectedCategoryId((current) => {
        if (current && data.some((c) => c.id === current)) return current;
        return data[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runPreview = useCallback(async (nextFile: File, categoryId: string) => {
    setPreviewing(true);
    setError(null);
    setPreview(null);
    try {
      const body = new FormData();
      body.append("file", nextFile);
      body.append("categoryId", categoryId);
      const res = await fetch("/api/admin/catalogue-imports/preview", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Preview failed");
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }, []);

  useEffect(() => {
    if (!file || !selectedCategoryId) {
      setPreview(null);
      return;
    }
    void runPreview(file, selectedCategoryId);
  }, [file, selectedCategoryId, runPreview]);

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategoryName.trim();
    if (!name) return;

    setAddingCategory(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/catalogue-imports/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add category");

      setCategories(data.overview);
      setSelectedCategoryId(data.category.id);
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !selectedCategoryId) {
      setError("Choose a CSV file and category first.");
      return;
    }
    if (preview && !preview.canImport) {
      setError("Fix CSV issues shown in the preview before uploading.");
      return;
    }

    setUploading(true);
    setError(null);
    setLastResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("categoryId", selectedCategoryId);
      if (notes.trim()) body.append("notes", notes.trim());
      body.append("activate", String(activateOnUpload));

      const res = await fetch("/api/admin/catalogue-imports/upload", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      setLastResult(data);
      setFile(null);
      setPreview(null);
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function activateBatch(batchId: string) {
    setActivatingId(batchId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/catalogue-imports/${batchId}/activate`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activation failed");
      setLastResult(data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Catalogue Imports"
        subtitle="Versioned Tencia CSV uploads. Upload and activate separately — previous imports are never deleted."
      />

      <p className="text-sm text-ink-secondary">
        The existing CowAg sell-price catalogue in{" "}
        <Link href="/catalogue" className="text-brand hover:underline">
          Product Catalogue
        </Link>{" "}
        is unchanged. Tencia CSV versions provide per-category cost data once activated. Quote BOM rows
        already saved are never rewritten.
      </p>

      <section className="surface-card space-y-4 p-6 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="section-title">Category</h2>
          <Button type="button" variant="secondary" onClick={() => setShowAddCategory((v) => !v)}>
            {showAddCategory ? "Cancel" : "Add category"}
          </Button>
        </div>

        {showAddCategory && (
          <form onSubmit={handleAddCategory} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="field-label">New category name</label>
              <input
                className="input-field"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Solar pumps"
              />
            </div>
            <Button type="submit" disabled={addingCategory || !newCategoryName.trim()}>
              {addingCategory ? "Adding…" : "Create category"}
            </Button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-ink-secondary">Loading categories…</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-ink-secondary">No categories yet — add one above.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const selected = category.id === selectedCategoryId;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setSelectedCategoryId(category.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selected
                      ? "border-brand bg-brand-soft/30 font-medium text-ink"
                      : "border-border bg-surface text-ink-secondary hover:border-brand/40"
                  }`}
                >
                  {category.name}
                  {category.activeBatchFilename ? (
                    <span className="ml-2 text-xs opacity-70">live</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}

        {selectedCategory && (
          <p className="text-sm text-ink-secondary">
            Currently selected: <strong className="text-ink">{selectedCategory.name}</strong>
            {" · "}
            Active version:{" "}
            {selectedCategory.activeBatchFilename ? (
              <>
                <strong className="text-ink">{selectedCategory.activeBatchFilename}</strong>
                {" · "}
                {formatWhen(selectedCategory.activeBatchImportedAt)}
              </>
            ) : (
              "None — legacy CowAg catalogue only for this category"
            )}
          </p>
        )}
      </section>

      {selectedCategory && (
        <>
          <section className="surface-card space-y-4 p-6 sm:p-7">
            <h2 className="section-title">Upload CSV for {selectedCategory.name}</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="field-label">CSV file</label>
                <input
                  className="input-field"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div>
                <label className="field-label">Notes (optional)</label>
                <input
                  className="input-field"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. August price update from Tencia"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-secondary">
                <input
                  type="checkbox"
                  className="accent-brand"
                  checked={activateOnUpload}
                  onChange={(e) => setActivateOnUpload(e.target.checked)}
                />
                Activate immediately after import (default is upload only)
              </label>

              {previewing && <p className="text-sm text-ink-secondary">Reading CSV…</p>}
              {preview && !previewing ? <ImportPreviewPanel preview={preview} /> : null}

              <div>
                <Button
                  type="submit"
                  disabled={uploading || previewing || !file || (preview != null && !preview.canImport)}
                >
                  {uploading ? "Uploading…" : "Upload import version"}
                </Button>
              </div>
            </form>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {lastResult ? (
              <div className="rounded-xl border border-border bg-brand-soft/20 p-4 text-sm space-y-2">
                <p className="font-medium text-ink">
                  {lastResult.originalFilename} — {statusLabel(lastResult.status)}
                </p>
                <p className="text-ink-secondary">
                  {lastResult.rowCount} rows stored · imported {formatWhen(lastResult.importedAt)}
                </p>
                {lastResult.summary.errors.length > 0 && (
                  <ul className="list-disc pl-5 text-red-600">
                    {lastResult.summary.errors.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                )}
                {lastResult.summary.warnings.length > 0 && (
                  <ul className="list-disc pl-5 text-ink-secondary">
                    {lastResult.summary.warnings.map((msg) => (
                      <li key={msg}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </section>

          <section className="surface-card overflow-hidden">
            <div className="border-b border-border px-6 py-5 sm:px-7">
              <h2 className="section-title">Import history — {selectedCategory.name}</h2>
            </div>

            {selectedCategory.batches.length === 0 ? (
              <p className="px-6 py-5 text-sm text-ink-secondary sm:px-7">No imports yet for this category.</p>
            ) : (
              <ul className="divide-y divide-border">
                {selectedCategory.batches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">{batch.originalFilename}</p>
                      <p className="meta-text mt-1">
                        {formatWhen(batch.importedAt)} · {batch.rowCount} rows · {statusLabel(batch.status)}
                      </p>
                      {batch.notes ? (
                        <p className="mt-1 text-sm text-ink-secondary">{batch.notes}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0">
                      {batch.status === "active" ? (
                        <span className="text-sm font-medium text-brand">Currently live</span>
                      ) : batch.status === "failed" ? (
                        <span className="text-sm text-red-600">Import failed</span>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={activatingId === batch.id}
                          onClick={() => activateBatch(batch.id)}
                        >
                          {activatingId === batch.id ? "Activating…" : "Activate"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
