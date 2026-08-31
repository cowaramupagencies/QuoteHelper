export type CatalogueImportStatus = "imported" | "active" | "superseded" | "failed";

export interface CatalogueCategory {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  activeBatchId: string | null;
  activeBatchFilename: string | null;
  activeBatchImportedAt: string | null;
}

export interface CatalogueImportBatch {
  id: string;
  categoryId: string;
  categoryName: string;
  originalFilename: string;
  importedAt: string;
  rowCount: number;
  notes: string | null;
  status: CatalogueImportStatus;
  summary: CatalogueImportSummary;
}

export interface CatalogueImportSummary {
  columnMapping: Record<string, string | null>;
  rowsParsed: number;
  rowsStored: number;
  rowsSkipped: number;
  errors: string[];
  warnings: string[];
}

export interface CatalogueImportRow {
  id: string;
  batchId: string;
  cowagCode: string | null;
  supplier: string | null;
  supplierPartNumber: string | null;
  description: string;
  unit: string;
  costEach: number | null;
  sellPrice: number | null;
  rawJson: Record<string, string>;
}

export interface ActiveTenciaImportMatch {
  costEach: number | null;
  supplier: string | null;
  supplierPartNumber: string | null;
}

export interface ParsedCatalogueCsv {
  headers: string[];
  columnMapping: Record<string, string | null>;
  rows: Array<{
    cowagCode: string | null;
    supplierPartNumber: string | null;
    supplier: string | null;
    description: string;
    unit: string;
    costEach: number | null;
    sellPrice: number | null;
    raw: Record<string, string>;
  }>;
  errors: string[];
  warnings: string[];
}

export interface CatalogueImportPreview {
  categoryId: string;
  categoryName: string;
  originalFilename: string;
  parse: {
    columnMapping: Record<string, string | null>;
    rowsParsed: number;
    errors: string[];
    warnings: string[];
  };
  activeBatch: {
    id: string;
    originalFilename: string;
    importedAt: string;
    rowCount: number;
  } | null;
  changes: {
    newCount: number;
    removedCount: number;
    costChangeCount: number;
    unchangedCount: number;
    newItems: Array<{ code: string; description: string; costEach: number | null }>;
    removedItems: Array<{ code: string; description: string; costEach: number | null }>;
    costChanges: Array<{
      code: string;
      description: string;
      previousCost: number | null;
      newCost: number | null;
    }>;
  };
  canImport: boolean;
}
