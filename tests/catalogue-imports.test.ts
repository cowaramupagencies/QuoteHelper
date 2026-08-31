import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  activateImportBatch,
  createCatalogueCategory,
  getActiveRowsForCategory,
  getActiveTenciaCostForCode,
  getActiveTenciaImportMatch,
  getImportBatch,
  importCatalogueCsv,
  listImportBatchesForCategory,
  searchActiveCatalogueImports,
} from "@/lib/db/catalogue-imports";
import { query, queryOne } from "@/lib/db/client";
import { parseCatalogueCsv, extractMappedFieldsFromRaw } from "@/lib/catalogue/csv-parser";
import { previewCatalogueImport } from "@/lib/catalogue/import-preview";
import { searchProducts } from "@/lib/db/repository";
import { setupTestDb, teardownTestDb } from "./test-db";

const PUMPS_CSV_V1 = `Code,Description,Last Cost,Unit
PUMP-001,Test Pump,100.00,EACH
PUMP-002,Another Pump,200.00,EACH`;

const PUMPS_CSV_V2 = `Code,Description,Last Cost,Unit
PUMP-001,Test Pump,150.00,EACH`;

const TANKS_CSV = `Code,Description,Last Cost,Unit
TANK-100,Round Tank,5000.00,EACH`;

describe("parseCatalogueCsv", () => {
  it("detects common code and cost headers", () => {
    const parsed = parseCatalogueCsv(PUMPS_CSV_V1);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.columnMapping.cowagCode).toBe("Code");
    expect(parsed.columnMapping.costEach).toBe("Last Cost");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].cowagCode).toBe("PUMP-001");
    expect(parsed.rows[0].costEach).toBe(100);
  });

  it("detects Tencia export headers: SUPPLIER PT NO -> supplier, Supplier_stock -> part number", () => {
    const csv = `Code,Description,Sum of LAST_COST,SUPPLIER PT NO,Supplier_stock
PUMP-001,Test Pump,123.45,VINIDE,GRU-12345`;

    const parsed = parseCatalogueCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.columnMapping.costEach).toBe("Sum of LAST_COST");
    expect(parsed.columnMapping.supplier).toBe("SUPPLIER PT NO");
    expect(parsed.columnMapping.supplierPartNumber).toBe("Supplier_stock");
    expect(parsed.rows[0].costEach).toBe(123.45);
    expect(parsed.rows[0].supplier).toBe("VINIDE");
    expect(parsed.rows[0].supplierPartNumber).toBe("GRU-12345");
  });

  it("detects Supplier Code as the supplier column and Supplier_stock as part number", () => {
    const csv = `Code,Description,Sum of LAST_COST,Supplier Code,Supplier_stock
PUMP-001,Test Pump,123.45,VINIDE,GRU-12345`;

    const parsed = parseCatalogueCsv(csv);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.columnMapping.costEach).toBe("Sum of LAST_COST");
    expect(parsed.columnMapping.supplier).toBe("Supplier Code");
    expect(parsed.columnMapping.supplierPartNumber).toBe("Supplier_stock");
    expect(parsed.rows[0].supplier).toBe("VINIDE");
    expect(parsed.rows[0].supplierPartNumber).toBe("GRU-12345");
  });

  it("re-resolves swapped supplier fields from saved raw_json", () => {
    const mapped = extractMappedFieldsFromRaw({
      Code: "PUMP-001",
      Description: "Test Pump",
      "Sum of LAST_COST": "123.45",
      "Supplier Code": "VINIDE",
      Supplier_stock: "GRU-12345",
    });
    expect(mapped.supplier).toBe("VINIDE");
    expect(mapped.supplierPartNumber).toBe("GRU-12345");
  });
});

describe("catalogue import versioning", () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("keeps multiple import versions for the same category", async () => {
    await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });

    const batches = await listImportBatchesForCategory("pumps");
    expect(batches).toHaveLength(2);
    expect(batches.every((b) => b.status === "imported")).toBe(true);
    expect(new Set(batches.map((b) => b.id)).size).toBe(2);
  });

  it("activates a newer version without deleting older imports", async () => {
    const v1 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    const v2 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });

    await activateImportBatch(v1.id);
    await activateImportBatch(v2.id);

    expect((await getImportBatch(v1.id))?.status).toBe("superseded");
    expect((await getImportBatch(v2.id))?.status).toBe("active");
    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(150);
    expect((await listImportBatchesForCategory("pumps"))).toHaveLength(2);
  });

  it("does not change active data for another category", async () => {
    const pumps = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    const tanks = await importCatalogueCsv({
      categoryId: "tanks",
      originalFilename: "tanks-v1.csv",
      csvText: TANKS_CSV,
    });

    await activateImportBatch(pumps.id);
    await activateImportBatch(tanks.id);

    const pumpsV2 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });
    await activateImportBatch(pumpsV2.id);

    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(150);
    expect(await getActiveTenciaCostForCode("TANK-100")).toBe(5000);
    expect((await getActiveRowsForCategory("tanks"))).toHaveLength(1);
    expect((await getImportBatch(tanks.id))?.status).toBe("active");
  });

  it("can reactivate an older version", async () => {
    const v1 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    const v2 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });

    await activateImportBatch(v2.id);
    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(150);

    await activateImportBatch(v1.id);
    expect((await getImportBatch(v1.id))?.status).toBe("active");
    expect((await getImportBatch(v2.id))?.status).toBe("superseded");
    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(100);
  });

  it("does not rewrite saved quote BOM snapshots when active version changes", async () => {
    const options = [
      {
        id: "opt1",
        name: "Option 1",
        sortOrder: 0,
        sections: [
          {
            id: "sec1",
            name: "Pump",
            enabled: true,
            sortOrder: 0,
            showOnCustomerQuote: true,
            items: [
              {
                id: "item1",
                description: "Test Pump",
                cowagPartNumber: "PUMP-001",
                quantity: 1,
                costEach: 100,
                sellEach: 200,
                pricingState: "normal",
              },
            ],
          },
        ],
      },
    ];
    const originalJson = JSON.stringify(options);
    await query(
      `INSERT INTO quotes (
        id, quote_number, quote_date, status, customer_json, delivery_json,
        scope_text, options_json, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        "quote-1",
        "114700",
        "2026-08-31",
        "draft",
        "{}",
        "{}",
        "",
        originalJson,
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    const batch = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });
    await activateImportBatch(batch.id);

    const row = await queryOne("SELECT options_json FROM quotes WHERE id = $1", ["quote-1"]);
    expect(row?.options_json).toBe(originalJson);
    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(150);
  });

  it("switches active version atomically via a single category pointer", async () => {
    const v1 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    const v2 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });

    await activateImportBatch(v1.id);
    await activateImportBatch(v2.id);

    const activeRows = await queryOne(`
      SELECT COUNT(*)::int AS c
      FROM catalogue_category_active a
      JOIN catalogue_import_batches b ON b.id = a.batch_id
      WHERE a.category_id = 'pumps' AND b.status = 'active'
    `);

    expect(activeRows?.c).toBe(1);
    expect(await getActiveTenciaCostForCode("PUMP-001")).toBe(150);
  });

  it("previews changes against the active version before import", async () => {
    const v1 = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-v1.csv",
      csvText: PUMPS_CSV_V1,
    });
    await activateImportBatch(v1.id);

    const preview = await previewCatalogueImport({
      categoryId: "pumps",
      originalFilename: "pumps-v2.csv",
      csvText: PUMPS_CSV_V2,
    });

    expect(preview.canImport).toBe(true);
    expect(preview.changes.newCount).toBe(0);
    expect(preview.changes.removedCount).toBe(1);
    expect(preview.changes.costChangeCount).toBe(1);
    expect(preview.changes.costChanges[0]?.code).toBe("PUMP-001");
  });

  it("can create a new category", async () => {
    const category = await createCatalogueCategory("Solar pumps");
    expect(category.id).toBe("solar-pumps");
    expect(category.name).toBe("Solar pumps");
  });

  it("stores supplier fields from Tencia CSV imports", async () => {
    const csv = `Code,Description,Sum of LAST_COST,SUPPLIER PT NO,Supplier_stock
PUMP-001,Test Pump,123.45,VINIDE,GRU-12345`;

    const batch = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps-tencia.csv",
      csvText: csv,
    });
    await activateImportBatch(batch.id);

    const rows = await getActiveRowsForCategory("pumps");
    expect(rows[0].costEach).toBe(123.45);
    expect(rows[0].supplier).toBe("VINIDE");
    expect(rows[0].supplierPartNumber).toBe("GRU-12345");

    const match = await getActiveTenciaImportMatch("PUMP-001", null);
    expect(match?.costEach).toBe(123.45);
    expect(match?.supplier).toBe("VINIDE");
    expect(match?.supplierPartNumber).toBe("GRU-12345");
  });

  it("re-resolves supplier fields from raw_json when older imports stored them swapped", async () => {
    const batchId = "batch-swapped";
    await query(
      `
      INSERT INTO catalogue_import_batches
        (id, category_id, original_filename, imported_at, row_count, notes, status, summary_json)
      VALUES ($1, 'pumps', 'old.csv', $2, 1, NULL, 'imported', '{}')
    `,
      [batchId, new Date().toISOString()]
    );

    await query(
      `
      INSERT INTO catalogue_import_rows
        (id, batch_id, cowag_code, supplier, supplier_part_number, description, unit, cost_each, sell_price, raw_json, search_text)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
      [
        "row-1",
        batchId,
        "PUMP-001",
        null,
        "VINIDE",
        "Test Pump",
        "EACH",
        123.45,
        null,
        JSON.stringify({
          Code: "PUMP-001",
          Description: "Test Pump",
          "Sum of LAST_COST": "123.45",
          "Supplier Code": "VINIDE",
          Supplier_stock: "GRU-12345",
        }),
        "pump-001 vinide",
      ]
    );

    await activateImportBatch(batchId);
    const match = await getActiveTenciaImportMatch("PUMP-001", null);
    expect(match?.supplier).toBe("VINIDE");
    expect(match?.supplierPartNumber).toBe("GRU-12345");
  });

  it("includes active catalogue imports in product search", async () => {
    const batch = await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps.csv",
      csvText: PUMPS_CSV_V1,
    });
    await activateImportBatch(batch.id);

    const catalogueOnly = await searchActiveCatalogueImports("pump-001", 5, "code");
    expect(catalogueOnly).toHaveLength(1);
    expect(catalogueOnly[0].cowagCode).toBe("PUMP-001");

    const merged = await searchProducts("pump-001", 5, "code");
    expect(merged.some((p) => p.cowagCode === "PUMP-001")).toBe(true);
    expect(merged[0].costEach).toBe(100);
  });

  it("does not search catalogue rows until the import batch is activated", async () => {
    await importCatalogueCsv({
      categoryId: "pumps",
      originalFilename: "pumps.csv",
      csvText: PUMPS_CSV_V1,
    });

    const rows = await searchActiveCatalogueImports("PUMP-001", 5, "code");
    expect(rows).toHaveLength(0);
  });
});
