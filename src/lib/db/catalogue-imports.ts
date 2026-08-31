import { v4 as uuidv4 } from "uuid";
import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { parseCatalogueCsv, extractMappedFieldsFromRaw } from "@/lib/catalogue/csv-parser";
import type {
  ActiveTenciaImportMatch,
  CatalogueCategory,
  CatalogueImportBatch,
  CatalogueImportRow,
  CatalogueImportStatus,
  CatalogueImportSummary,
} from "@/types/catalogue-imports";

const DEFAULT_TENCIA_CATEGORIES = [
  { id: "pumps", name: "Pumps", sortOrder: 0 },
  { id: "tanks", name: "Tanks", sortOrder: 1 },
  { id: "filtration", name: "Filtration", sortOrder: 2 },
  { id: "plumbing", name: "Plumbing", sortOrder: 3 },
  { id: "fittings", name: "Fittings", sortOrder: 4 },
  { id: "general", name: "General", sortOrder: 5 },
];

function dbOr(database?: Database.Database): Database.Database {
  return database ?? getDb();
}

export function migrateCatalogueImports(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS catalogue_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS catalogue_import_batches (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'imported',
      summary_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (category_id) REFERENCES catalogue_categories(id)
    );

    CREATE INDEX IF NOT EXISTS idx_catalogue_import_batches_category
      ON catalogue_import_batches(category_id, imported_at DESC);

    CREATE TABLE IF NOT EXISTS catalogue_import_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      cowag_code TEXT,
      supplier TEXT,
      supplier_part_number TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'EACH',
      cost_each REAL,
      sell_price REAL,
      raw_json TEXT NOT NULL DEFAULT '{}',
      search_text TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (batch_id) REFERENCES catalogue_import_batches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_batch ON catalogue_import_rows(batch_id);
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_cowag ON catalogue_import_rows(cowag_code);
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_supplier ON catalogue_import_rows(supplier_part_number);

    CREATE TABLE IF NOT EXISTS catalogue_category_active (
      category_id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      activated_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES catalogue_categories(id),
      FOREIGN KEY (batch_id) REFERENCES catalogue_import_batches(id)
    );
  `);

  seedCatalogueCategories(database);
  ensureImportRowColumns(database);
}

function ensureImportRowColumns(database: Database.Database) {
  const columns = database.prepare("PRAGMA table_info(catalogue_import_rows)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "supplier")) {
    database.exec("ALTER TABLE catalogue_import_rows ADD COLUMN supplier TEXT");
  }
}

function seedCatalogueCategories(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) as c FROM catalogue_categories").get() as { c: number };
  if (count.c > 0) return;

  const insert = database.prepare(
    "INSERT INTO catalogue_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)"
  );
  const now = new Date().toISOString();
  for (const category of DEFAULT_TENCIA_CATEGORIES) {
    insert.run(category.id, category.name, category.sortOrder, now);
  }
}

function parseSummary(raw: string | null | undefined): CatalogueImportSummary {
  if (!raw) {
    return {
      columnMapping: {},
      rowsParsed: 0,
      rowsStored: 0,
      rowsSkipped: 0,
      errors: [],
      warnings: [],
    };
  }
  try {
    return JSON.parse(raw) as CatalogueImportSummary;
  } catch {
    return {
      columnMapping: {},
      rowsParsed: 0,
      rowsStored: 0,
      rowsSkipped: 0,
      errors: ["Invalid summary_json"],
      warnings: [],
    };
  }
}

function rowToBatch(row: Record<string, unknown>, categoryName: string): CatalogueImportBatch {
  return {
    id: row.id as string,
    categoryId: row.category_id as string,
    categoryName,
    originalFilename: row.original_filename as string,
    importedAt: row.imported_at as string,
    rowCount: row.row_count as number,
    notes: (row.notes as string) || null,
    status: row.status as CatalogueImportStatus,
    summary: parseSummary(row.summary_json as string),
  };
}

export function listCatalogueCategories(database?: Database.Database): CatalogueCategory[] {
  const db = dbOr(database);
  const rows = db
    .prepare(
      `
      SELECT c.*,
             a.batch_id AS active_batch_id,
             b.original_filename AS active_batch_filename,
             b.imported_at AS active_batch_imported_at
      FROM catalogue_categories c
      LEFT JOIN catalogue_category_active a ON a.category_id = c.id
      LEFT JOIN catalogue_import_batches b ON b.id = a.batch_id
      ORDER BY c.sort_order, c.name
    `
    )
    .all() as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
    activeBatchId: (row.active_batch_id as string) || null,
    activeBatchFilename: (row.active_batch_filename as string) || null,
    activeBatchImportedAt: (row.active_batch_imported_at as string) || null,
  }));
}

export function listImportBatchesForCategory(
  categoryId: string,
  database?: Database.Database
): CatalogueImportBatch[] {
  const db = dbOr(database);
  const category = db.prepare("SELECT name FROM catalogue_categories WHERE id = ?").get(categoryId) as
    | { name: string }
    | undefined;
  if (!category) return [];

  const rows = db
    .prepare(
      "SELECT * FROM catalogue_import_batches WHERE category_id = ? ORDER BY imported_at DESC"
    )
    .all(categoryId) as Record<string, unknown>[];

  return rows.map((row) => rowToBatch(row, category.name));
}

export function getImportBatch(batchId: string, database?: Database.Database): CatalogueImportBatch | null {
  const db = dbOr(database);
  const row = db
    .prepare(
      `
      SELECT b.*, c.name AS category_name
      FROM catalogue_import_batches b
      JOIN catalogue_categories c ON c.id = b.category_id
      WHERE b.id = ?
    `
    )
    .get(batchId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return rowToBatch(row, row.category_name as string);
}

export interface ImportCatalogueCsvInput {
  categoryId: string;
  originalFilename: string;
  csvText: string;
  notes?: string;
}

export function importCatalogueCsv(
  input: ImportCatalogueCsvInput,
  database?: Database.Database
): CatalogueImportBatch {
  const db = dbOr(database);
  const category = db.prepare("SELECT id FROM catalogue_categories WHERE id = ?").get(input.categoryId);
  if (!category) {
    throw new Error(`Unknown category: ${input.categoryId}`);
  }

  const parsed = parseCatalogueCsv(input.csvText);
  const batchId = uuidv4();
  const importedAt = new Date().toISOString();
  const rowsSkipped = parsed.warnings.filter((w) => w.startsWith("Skipped row")).length;

  const summary: CatalogueImportSummary = {
    columnMapping: parsed.columnMapping,
    rowsParsed: parsed.rows.length + rowsSkipped,
    rowsStored: parsed.rows.length,
    rowsSkipped,
    errors: parsed.errors,
    warnings: parsed.warnings,
  };

  const status: CatalogueImportStatus =
    parsed.errors.length > 0 || parsed.rows.length === 0 ? "failed" : "imported";

  const insertBatch = db.prepare(`
    INSERT INTO catalogue_import_batches
      (id, category_id, original_filename, imported_at, row_count, notes, status, summary_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRow = db.prepare(`
    INSERT INTO catalogue_import_rows
      (id, batch_id, cowag_code, supplier, supplier_part_number, description, unit, cost_each, sell_price, raw_json, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertBatch.run(
      batchId,
      input.categoryId,
      input.originalFilename,
      importedAt,
      parsed.rows.length,
      input.notes ?? null,
      status,
      JSON.stringify(summary)
    );

    for (const row of parsed.rows) {
      const searchText = [row.cowagCode, row.supplier, row.supplierPartNumber, row.description, row.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      insertRow.run(
        uuidv4(),
        batchId,
        row.cowagCode,
        row.supplier,
        row.supplierPartNumber,
        row.description,
        row.unit,
        row.costEach,
        row.sellPrice,
        JSON.stringify(row.raw),
        searchText
      );
    }
  });

  tx();

  return getImportBatch(batchId, db)!;
}

export function activateImportBatch(batchId: string, database?: Database.Database): CatalogueImportBatch {
  const db = dbOr(database);
  const batch = getImportBatch(batchId, db);
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "failed") throw new Error("Cannot activate a failed import batch");
  if (batch.rowCount === 0) throw new Error("Cannot activate an empty import batch");

  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO catalogue_category_active (category_id, batch_id, activated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(category_id) DO UPDATE SET
        batch_id = excluded.batch_id,
        activated_at = excluded.activated_at
    `
    ).run(batch.categoryId, batchId, now);

    db.prepare(
      `
      UPDATE catalogue_import_batches
      SET status = 'superseded'
      WHERE category_id = ? AND id != ? AND status = 'active'
    `
    ).run(batch.categoryId, batchId);

    db.prepare("UPDATE catalogue_import_batches SET status = 'active' WHERE id = ?").run(batchId);
  });

  tx();

  return getImportBatch(batchId, db)!;
}

export function getActiveRowsForCategory(
  categoryId: string,
  database?: Database.Database
): CatalogueImportRow[] {
  const db = dbOr(database);
  const active = db
    .prepare("SELECT batch_id FROM catalogue_category_active WHERE category_id = ?")
    .get(categoryId) as { batch_id: string } | undefined;
  if (!active) return [];
  return getRowsForBatch(active.batch_id, db);
}

function resolveImportRow(row: Record<string, unknown>): CatalogueImportRow {
  const rawJson = JSON.parse(row.raw_json as string) as Record<string, string>;
  const mapped =
    Object.keys(rawJson).length > 0
      ? extractMappedFieldsFromRaw(rawJson)
      : {
          cowagCode: (row.cowag_code as string) || null,
          supplier: (row.supplier as string) || null,
          supplierPartNumber: (row.supplier_part_number as string) || null,
          description: (row.description as string) || null,
          unit: (row.unit as string) || null,
          costEach: row.cost_each as number | null,
          sellPrice: row.sell_price as number | null,
        };

  return {
    id: row.id as string,
    batchId: row.batch_id as string,
    cowagCode: mapped.cowagCode,
    supplier: mapped.supplier,
    supplierPartNumber: mapped.supplierPartNumber,
    description: mapped.description || (row.description as string),
    unit: mapped.unit || (row.unit as string) || "EACH",
    costEach: mapped.costEach ?? (row.cost_each as number | null),
    sellPrice: mapped.sellPrice ?? (row.sell_price as number | null),
    rawJson,
  };
}

export function getRowsForBatch(batchId: string, database?: Database.Database): CatalogueImportRow[] {
  const db = dbOr(database);
  const rows = db
    .prepare("SELECT * FROM catalogue_import_rows WHERE batch_id = ? ORDER BY description")
    .all(batchId) as Record<string, unknown>[];

  return rows.map(resolveImportRow);
}

function mapActiveTenciaRow(row: Record<string, unknown>): ActiveTenciaImportMatch {
  const resolved = resolveImportRow(row);
  return {
    costEach: resolved.costEach,
    supplier: resolved.supplier,
    supplierPartNumber: resolved.supplierPartNumber,
  };
}

export function getActiveTenciaImportMatch(
  cowagCode?: string | null,
  supplierPartNumber?: string | null,
  database?: Database.Database
): ActiveTenciaImportMatch | null {
  const db = dbOr(database);

  if (cowagCode?.trim()) {
    const row = db
      .prepare(
        `
        SELECT *
        FROM catalogue_import_rows r
        JOIN catalogue_category_active a ON a.batch_id = r.batch_id
        WHERE r.cowag_code IS NOT NULL
          AND UPPER(TRIM(r.cowag_code)) = UPPER(?)
        LIMIT 1
      `
      )
      .get(cowagCode.trim()) as Record<string, unknown> | undefined;
    if (row) return mapActiveTenciaRow(row);
  }

  if (supplierPartNumber?.trim()) {
    const row = db
      .prepare(
        `
        SELECT *
        FROM catalogue_import_rows r
        JOIN catalogue_category_active a ON a.batch_id = r.batch_id
        WHERE r.supplier_part_number IS NOT NULL
          AND UPPER(TRIM(r.supplier_part_number)) = UPPER(?)
        LIMIT 1
      `
      )
      .get(supplierPartNumber.trim()) as Record<string, unknown> | undefined;
    if (row) return mapActiveTenciaRow(row);
  }

  return null;
}

export function getActiveTenciaCostMap(database?: Database.Database): Map<string, number> {
  const db = dbOr(database);
  const rows = db
    .prepare(
      `
      SELECT r.cowag_code, r.cost_each
      FROM catalogue_import_rows r
      JOIN catalogue_category_active a ON a.batch_id = r.batch_id
      WHERE r.cost_each IS NOT NULL AND r.cowag_code IS NOT NULL
    `
    )
    .all() as Array<{ cowag_code: string; cost_each: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.cowag_code.trim().toUpperCase(), row.cost_each);
  }
  return map;
}

export function getActiveTenciaCostForCode(
  cowagCode: string | null | undefined,
  database?: Database.Database
): number | null {
  if (!cowagCode?.trim()) return null;
  return getActiveTenciaImportMatch(cowagCode, null, database)?.costEach ?? null;
}

export function getAdminCatalogueImportsOverview(database?: Database.Database) {
  const categories = listCatalogueCategories(database);
  return categories.map((category) => ({
    ...category,
    batches: listImportBatchesForCategory(category.id, database),
  }));
}

function slugifyCategoryId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createCatalogueCategory(name: string, database?: Database.Database): CatalogueCategory {
  const db = dbOr(database);
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  let id = slugifyCategoryId(trimmed);
  if (!id) throw new Error("Category name must contain letters or numbers");

  const existing = db.prepare("SELECT id FROM catalogue_categories WHERE id = ?").get(id);
  if (existing) {
    let suffix = 2;
    while (db.prepare("SELECT id FROM catalogue_categories WHERE id = ?").get(`${id}-${suffix}`)) {
      suffix++;
    }
    id = `${id}-${suffix}`;
  }

  const maxSort = db.prepare("SELECT COALESCE(MAX(sort_order), -1) as m FROM catalogue_categories").get() as {
    m: number;
  };
  const now = new Date().toISOString();

  db.prepare("INSERT INTO catalogue_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    trimmed,
    maxSort.m + 1,
    now
  );

  return listCatalogueCategories(db).find((c) => c.id === id)!;
}
