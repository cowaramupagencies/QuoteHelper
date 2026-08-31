import { parseCatalogueCsv } from "@/lib/catalogue/csv-parser";
import {
  getActiveRowsForCategory,
  getImportBatch,
  listCatalogueCategories,
} from "@/lib/db/catalogue-imports";
import type { CatalogueImportPreview } from "@/types/catalogue-imports";

function rowKey(row: {
  cowagCode: string | null;
  supplierPartNumber: string | null;
}): string | null {
  if (row.cowagCode?.trim()) return `cowag:${row.cowagCode.trim().toUpperCase()}`;
  if (row.supplierPartNumber?.trim()) return `supplier:${row.supplierPartNumber.trim().toUpperCase()}`;
  return null;
}

function costsEqual(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.005;
}

function indexRows<T extends { cowagCode: string | null; supplierPartNumber: string | null }>(
  rows: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = rowKey(row);
    if (key) map.set(key, row);
  }
  return map;
}

export async function previewCatalogueImport(input: {
  categoryId: string;
  originalFilename: string;
  csvText: string;
}): Promise<CatalogueImportPreview> {
  const categories = await listCatalogueCategories();
  const category = categories.find((c) => c.id === input.categoryId);
  if (!category) {
    throw new Error(`Unknown category: ${input.categoryId}`);
  }

  const parsed = parseCatalogueCsv(input.csvText);
  const activeBatch = category.activeBatchId ? await getImportBatch(category.activeBatchId) : null;
  const activeRows = await getActiveRowsForCategory(input.categoryId);
  const activeByKey = indexRows(activeRows);
  const incomingByKey = indexRows(parsed.rows);

  const newItems: CatalogueImportPreview["changes"]["newItems"] = [];
  const removedItems: CatalogueImportPreview["changes"]["removedItems"] = [];
  const costChanges: CatalogueImportPreview["changes"]["costChanges"] = [];
  let unchanged = 0;

  for (const [key, row] of incomingByKey) {
    const existing = activeByKey.get(key);
    if (!existing) {
      if (newItems.length < 8) {
        newItems.push({
          code: row.cowagCode ?? row.supplierPartNumber ?? key,
          description: row.description,
          costEach: row.costEach,
        });
      }
      continue;
    }

    if (!costsEqual(existing.costEach, row.costEach)) {
      if (costChanges.length < 8) {
        costChanges.push({
          code: row.cowagCode ?? row.supplierPartNumber ?? key,
          description: row.description,
          previousCost: existing.costEach,
          newCost: row.costEach,
        });
      }
    } else {
      unchanged++;
    }
  }

  for (const [key, row] of activeByKey) {
    if (!incomingByKey.has(key)) {
      if (removedItems.length < 8) {
        removedItems.push({
          code: row.cowagCode ?? row.supplierPartNumber ?? key,
          description: row.description,
          costEach: row.costEach,
        });
      }
    }
  }

  const newCount = [...incomingByKey.keys()].filter((k) => !activeByKey.has(k)).length;
  const removedCount = [...activeByKey.keys()].filter((k) => !incomingByKey.has(k)).length;
  const costChangeCount = [...incomingByKey.entries()].filter(([key, row]) => {
    const existing = activeByKey.get(key);
    return existing && !costsEqual(existing.costEach, row.costEach);
  }).length;

  return {
    categoryId: category.id,
    categoryName: category.name,
    originalFilename: input.originalFilename,
    parse: {
      columnMapping: parsed.columnMapping,
      rowsParsed: parsed.rows.length,
      errors: parsed.errors,
      warnings: parsed.warnings,
    },
    activeBatch: activeBatch
      ? {
          id: activeBatch.id,
          originalFilename: activeBatch.originalFilename,
          importedAt: activeBatch.importedAt,
          rowCount: activeBatch.rowCount,
        }
      : null,
    changes: {
      newCount,
      removedCount,
      costChangeCount,
      unchangedCount: unchanged,
      newItems,
      removedItems,
      costChanges,
    },
    canImport: parsed.errors.length === 0 && parsed.rows.length > 0,
  };
}
