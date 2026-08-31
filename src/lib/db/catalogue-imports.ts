import { v4 as uuidv4 } from "uuid";
import { ensureDb, insertMany, query, queryOne, withTransaction } from "@/lib/db/client";
import { parseCatalogueCsv, extractMappedFieldsFromRaw } from "@/lib/catalogue/csv-parser";
import type {
  ActiveTenciaImportMatch,
  CatalogueCategory,
  CatalogueImportBatch,
  CatalogueImportRow,
  CatalogueImportStatus,
  CatalogueImportSummary,
} from "@/types/catalogue-imports";

const ACTIVE_IMPORT_FROM = `
  FROM catalogue_import_rows r
  JOIN catalogue_category_active a ON a.batch_id = r.batch_id
`;

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

export async function listCatalogueCategories(): Promise<CatalogueCategory[]> {
  await ensureDb();
  const { rows } = await query(`
    SELECT c.*,
           a.batch_id AS active_batch_id,
           b.original_filename AS active_batch_filename,
           b.imported_at AS active_batch_imported_at
    FROM catalogue_categories c
    LEFT JOIN catalogue_category_active a ON a.category_id = c.id
    LEFT JOIN catalogue_import_batches b ON b.id = a.batch_id
    ORDER BY c.sort_order, c.name
  `);

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

export async function listImportBatchesForCategory(
  categoryId: string
): Promise<CatalogueImportBatch[]> {
  await ensureDb();
  const category = await queryOne("SELECT name FROM catalogue_categories WHERE id = $1", [categoryId]);
  if (!category) return [];

  const { rows } = await query(
    "SELECT * FROM catalogue_import_batches WHERE category_id = $1 ORDER BY imported_at DESC",
    [categoryId]
  );

  return rows.map((row) => rowToBatch(row, category.name as string));
}

export async function getImportBatch(batchId: string): Promise<CatalogueImportBatch | null> {
  await ensureDb();
  const row = await queryOne(
    `
    SELECT b.*, c.name AS category_name
    FROM catalogue_import_batches b
    JOIN catalogue_categories c ON c.id = b.category_id
    WHERE b.id = $1
  `,
    [batchId]
  );

  if (!row) return null;
  return rowToBatch(row, row.category_name as string);
}

export interface ImportCatalogueCsvInput {
  categoryId: string;
  originalFilename: string;
  csvText: string;
  notes?: string;
}

export async function importCatalogueCsv(
  input: ImportCatalogueCsvInput
): Promise<CatalogueImportBatch> {
  await ensureDb();
  const category = await queryOne("SELECT id FROM catalogue_categories WHERE id = $1", [input.categoryId]);
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

  await withTransaction(async () => {
    await query(
      `
      INSERT INTO catalogue_import_batches
        (id, category_id, original_filename, imported_at, row_count, notes, status, summary_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        batchId,
        input.categoryId,
        input.originalFilename,
        importedAt,
        parsed.rows.length,
        input.notes ?? null,
        status,
        JSON.stringify(summary),
      ]
    );

    const importRowColumns = [
      "id",
      "batch_id",
      "cowag_code",
      "supplier",
      "supplier_part_number",
      "description",
      "unit",
      "cost_each",
      "sell_price",
      "raw_json",
      "search_text",
    ] as const;

    const importRows = parsed.rows.map((row) => {
      const searchText = [row.cowagCode, row.supplier, row.supplierPartNumber, row.description, row.unit]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return [
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
        searchText,
      ];
    });

    await insertMany("catalogue_import_rows", importRowColumns, importRows);
  });

  return (await getImportBatch(batchId))!;
}

export async function activateImportBatch(batchId: string): Promise<CatalogueImportBatch> {
  await ensureDb();
  const batch = await getImportBatch(batchId);
  if (!batch) throw new Error("Import batch not found");
  if (batch.status === "failed") throw new Error("Cannot activate a failed import batch");
  if (batch.rowCount === 0) throw new Error("Cannot activate an empty import batch");

  const now = new Date().toISOString();

  await withTransaction(async () => {
    await query("DELETE FROM catalogue_category_active WHERE category_id = $1", [batch.categoryId]);
    await query(
      `
      INSERT INTO catalogue_category_active (category_id, batch_id, activated_at)
      VALUES ($1, $2, $3)
    `,
      [batch.categoryId, batchId, now]
    );

    await query(
      `
      UPDATE catalogue_import_batches
      SET status = 'superseded'
      WHERE category_id = $1 AND id != $2 AND status = 'active'
    `,
      [batch.categoryId, batchId]
    );

    await query("UPDATE catalogue_import_batches SET status = 'active' WHERE id = $1", [batchId]);
  });

  return (await getImportBatch(batchId))!;
}

export async function getActiveRowsForCategory(categoryId: string): Promise<CatalogueImportRow[]> {
  await ensureDb();
  const active = await queryOne("SELECT batch_id FROM catalogue_category_active WHERE category_id = $1", [
    categoryId,
  ]);
  if (!active) return [];
  return getRowsForBatch(active.batch_id as string);
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

export async function getRowsForBatch(batchId: string): Promise<CatalogueImportRow[]> {
  await ensureDb();
  const { rows } = await query(
    "SELECT * FROM catalogue_import_rows WHERE batch_id = $1 ORDER BY description",
    [batchId]
  );
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

export async function getActiveTenciaImportMatch(
  cowagCode?: string | null,
  supplierPartNumber?: string | null
): Promise<ActiveTenciaImportMatch | null> {
  await ensureDb();

  if (cowagCode?.trim()) {
    const row = await queryOne(
      `
      SELECT r.*
      FROM catalogue_import_rows r
      JOIN catalogue_category_active a ON a.batch_id = r.batch_id
      WHERE r.cowag_code = $1
      LIMIT 1
    `,
      [cowagCode.trim()]
    );
    if (row) return mapActiveTenciaRow(row);
  }

  if (supplierPartNumber?.trim()) {
    const row = await queryOne(
      `
      SELECT r.*
      FROM catalogue_import_rows r
      JOIN catalogue_category_active a ON a.batch_id = r.batch_id
      WHERE r.supplier_part_number = $1
      LIMIT 1
    `,
      [supplierPartNumber.trim()]
    );
    if (row) return mapActiveTenciaRow(row);
  }

  return null;
}

export async function getActiveTenciaCostMap(): Promise<Map<string, number>> {
  await ensureDb();
  const { rows } = await query(`
    SELECT r.cowag_code, r.cost_each
    FROM catalogue_import_rows r
    JOIN catalogue_category_active a ON a.batch_id = r.batch_id
    WHERE r.cost_each IS NOT NULL AND r.cowag_code IS NOT NULL
  `);

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row.cowag_code).trim().toUpperCase(), row.cost_each as number);
  }
  return map;
}

export async function getActiveTenciaCostForCode(
  cowagCode: string | null | undefined
): Promise<number | null> {
  if (!cowagCode?.trim()) return null;
  const match = await getActiveTenciaImportMatch(cowagCode, null);
  if (match?.costEach == null) return null;
  return Number(match.costEach);
}

/** Search live Tencia catalogue imports (active batch per category). */
export async function searchActiveCatalogueImports(
  searchQuery: string,
  limit = 20,
  mode: "all" | "code" = "all"
): Promise<CatalogueImportRow[]> {
  await ensureDb();
  const q = searchQuery.trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: CatalogueImportRow[] = [];

  const pushRows = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = row.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(resolveImportRow(row));
      if (results.length >= limit) return true;
    }
    return false;
  };

  const compact = q.replace(/\s+/g, "");
  const upper = compact.toUpperCase();
  const lower = compact.toLowerCase();
  const lowerRaw = q.toLowerCase();
  const like = `%${lowerRaw}%`;
  const codeLike = `%${lower}%`;
  const codePrefix = `${lower}%`;

  if (
    pushRows(
      (
        await query(
          `
        SELECT r.*
        ${ACTIVE_IMPORT_FROM}
        WHERE UPPER(r.cowag_code) = $1
           OR UPPER(r.supplier_part_number) = $2
           OR UPPER(REPLACE(r.cowag_code, ' ', '')) = $3
        LIMIT $4
      `,
          [upper, upper, upper, limit]
        )
      ).rows
    )
  ) {
    return results;
  }

  if (
    pushRows(
      (
        await query(
          `
        SELECT r.*
        ${ACTIVE_IMPORT_FROM}
        WHERE LOWER(r.cowag_code) LIKE $1
           OR LOWER(r.supplier_part_number) LIKE $2
        ORDER BY LENGTH(r.cowag_code), r.cowag_code
        LIMIT $3
      `,
          [codePrefix, codePrefix, limit]
        )
      ).rows
    )
  ) {
    return results;
  }

  if (
    pushRows(
      (
        await query(
          `
        SELECT r.*
        ${ACTIVE_IMPORT_FROM}
        WHERE LOWER(r.cowag_code) LIKE $1
           OR LOWER(r.supplier_part_number) LIKE $2
        ORDER BY
          CASE WHEN LOWER(r.cowag_code) LIKE $3 THEN 0 ELSE 1 END,
          LENGTH(r.cowag_code),
          r.cowag_code
        LIMIT $4
      `,
          [codeLike, codeLike, codePrefix, limit]
        )
      ).rows
    )
  ) {
    return results;
  }

  if (mode === "code") return results;

  pushRows(
    (
      await query(
        `
        SELECT r.*
        ${ACTIVE_IMPORT_FROM}
        WHERE r.description ILIKE $1
           OR r.cowag_code ILIKE $1
           OR r.supplier_part_number ILIKE $1
           OR r.search_text ILIKE $1
        ORDER BY r.description
        LIMIT $2
      `,
        [like, limit]
      )
    ).rows
  );

  return results;
}

export async function getAdminCatalogueImportsOverview() {
  const categories = await listCatalogueCategories();
  return Promise.all(
    categories.map(async (category) => ({
      ...category,
      batches: await listImportBatchesForCategory(category.id),
    }))
  );
}

function slugifyCategoryId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCatalogueCategory(name: string): Promise<CatalogueCategory> {
  await ensureDb();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  let id = slugifyCategoryId(trimmed);
  if (!id) throw new Error("Category name must contain letters or numbers");

  const existing = await queryOne("SELECT id FROM catalogue_categories WHERE id = $1", [id]);
  if (existing) {
    let suffix = 2;
    while (await queryOne("SELECT id FROM catalogue_categories WHERE id = $1", [`${id}-${suffix}`])) {
      suffix++;
    }
    id = `${id}-${suffix}`;
  }

  const maxSort = await queryOne("SELECT COALESCE(MAX(sort_order), -1) AS m FROM catalogue_categories");
  const now = new Date().toISOString();

  await query("INSERT INTO catalogue_categories (id, name, sort_order, created_at) VALUES ($1, $2, $3, $4)", [
    id,
    trimmed,
    ((maxSort?.m as number) ?? -1) + 1,
    now,
  ]);

  return (await listCatalogueCategories()).find((c) => c.id === id)!;
}
