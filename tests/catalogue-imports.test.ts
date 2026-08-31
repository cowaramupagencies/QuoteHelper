import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import {
  activateImportBatch,
  createCatalogueCategory,
  getActiveRowsForCategory,
  getActiveTenciaCostForCode,
  getActiveTenciaImportMatch,
  getImportBatch,
  importCatalogueCsv,
  listImportBatchesForCategory,
  migrateCatalogueImports,
} from "@/lib/db/catalogue-imports";
import { parseCatalogueCsv, extractMappedFieldsFromRaw } from "@/lib/catalogue/csv-parser";
import { previewCatalogueImport } from "@/lib/catalogue/import-preview";

const PUMPS_CSV_V1 = `Code,Description,Last Cost,Unit
PUMP-001,Test Pump,100.00,EACH
PUMP-002,Another Pump,200.00,EACH`;

const PUMPS_CSV_V2 = `Code,Description,Last Cost,Unit
PUMP-001,Test Pump,150.00,EACH`;

const TANKS_CSV = `Code,Description,Last Cost,Unit
TANK-100,Round Tank,5000.00,EACH`;

function createMemoryDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrateCatalogueImports(db);
  db.exec(`
    CREATE TABLE quotes (
      id TEXT PRIMARY KEY,
      options_json TEXT NOT NULL
    )
  `);
  return db;
}

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
  let db: Database.Database;

  beforeEach(() => {
    db = createMemoryDb();
  });

  it("keeps multiple import versions for the same category", () => {
    importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );

    const batches = listImportBatchesForCategory("pumps", db);
    expect(batches).toHaveLength(2);
    expect(batches.every((b) => b.status === "imported")).toBe(true);
    expect(new Set(batches.map((b) => b.id)).size).toBe(2);
  });

  it("activates a newer version without deleting older imports", () => {
    const v1 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    const v2 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );

    activateImportBatch(v1.id, db);
    activateImportBatch(v2.id, db);

    expect(getImportBatch(v1.id, db)?.status).toBe("superseded");
    expect(getImportBatch(v2.id, db)?.status).toBe("active");
    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(150);
    expect(listImportBatchesForCategory("pumps", db)).toHaveLength(2);
  });

  it("does not change active data for another category", () => {
    const pumps = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    const tanks = importCatalogueCsv(
      { categoryId: "tanks", originalFilename: "tanks-v1.csv", csvText: TANKS_CSV },
      db
    );

    activateImportBatch(pumps.id, db);
    activateImportBatch(tanks.id, db);

    const pumpsV2 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );
    activateImportBatch(pumpsV2.id, db);

    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(150);
    expect(getActiveTenciaCostForCode("TANK-100", db)).toBe(5000);
    expect(getActiveRowsForCategory("tanks", db)).toHaveLength(1);
    expect(getImportBatch(tanks.id, db)?.status).toBe("active");
  });

  it("can reactivate an older version", () => {
    const v1 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    const v2 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );

    activateImportBatch(v2.id, db);
    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(150);

    activateImportBatch(v1.id, db);
    expect(getImportBatch(v1.id, db)?.status).toBe("active");
    expect(getImportBatch(v2.id, db)?.status).toBe("superseded");
    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(100);
  });

  it("does not rewrite saved quote BOM snapshots when active version changes", () => {
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
    db.prepare("INSERT INTO quotes (id, options_json) VALUES (?, ?)").run("quote-1", originalJson);

    const batch = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );
    activateImportBatch(batch.id, db);

    const row = db.prepare("SELECT options_json FROM quotes WHERE id = ?").get("quote-1") as {
      options_json: string;
    };
    expect(row.options_json).toBe(originalJson);
    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(150);
  });

  it("switches active version atomically via a single category pointer", () => {
    const v1 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    const v2 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );

    activateImportBatch(v1.id, db);
    activateImportBatch(v2.id, db);

    const activeRows = db
      .prepare(
        `
        SELECT COUNT(*) as c
        FROM catalogue_category_active a
        JOIN catalogue_import_batches b ON b.id = a.batch_id
        WHERE a.category_id = 'pumps' AND b.status = 'active'
      `
      )
      .get() as { c: number };

    expect(activeRows.c).toBe(1);
    expect(getActiveTenciaCostForCode("PUMP-001", db)).toBe(150);
  });

  it("previews changes against the active version before import", () => {
    const v1 = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-v1.csv", csvText: PUMPS_CSV_V1 },
      db
    );
    activateImportBatch(v1.id, db);

    const preview = previewCatalogueImport(
      { categoryId: "pumps", originalFilename: "pumps-v2.csv", csvText: PUMPS_CSV_V2 },
      db
    );

    expect(preview.canImport).toBe(true);
    expect(preview.changes.newCount).toBe(0);
    expect(preview.changes.removedCount).toBe(1);
    expect(preview.changes.costChangeCount).toBe(1);
    expect(preview.changes.costChanges[0]?.code).toBe("PUMP-001");
  });

  it("can create a new category", () => {
    const category = createCatalogueCategory("Solar pumps", db);
    expect(category.id).toBe("solar-pumps");
    expect(category.name).toBe("Solar pumps");
  });

  it("stores supplier fields from Tencia CSV imports", () => {
    const csv = `Code,Description,Sum of LAST_COST,SUPPLIER PT NO,Supplier_stock
PUMP-001,Test Pump,123.45,VINIDE,GRU-12345`;

    const batch = importCatalogueCsv(
      { categoryId: "pumps", originalFilename: "pumps-tencia.csv", csvText: csv },
      db
    );
    activateImportBatch(batch.id, db);

    const rows = getActiveRowsForCategory("pumps", db);
    expect(rows[0].costEach).toBe(123.45);
    expect(rows[0].supplier).toBe("VINIDE");
    expect(rows[0].supplierPartNumber).toBe("GRU-12345");

    const match = getActiveTenciaImportMatch("PUMP-001", null, db);
    expect(match?.costEach).toBe(123.45);
    expect(match?.supplier).toBe("VINIDE");
    expect(match?.supplierPartNumber).toBe("GRU-12345");
  });

  it("re-resolves supplier fields from raw_json when older imports stored them swapped", () => {
    const batchId = "batch-swapped";
    db.prepare(
      `
      INSERT INTO catalogue_import_batches
        (id, category_id, original_filename, imported_at, row_count, notes, status, summary_json)
      VALUES (?, 'pumps', 'old.csv', ?, 1, NULL, 'imported', '{}')
    `
    ).run(batchId, new Date().toISOString());

    db.prepare(
      `
      INSERT INTO catalogue_import_rows
        (id, batch_id, cowag_code, supplier, supplier_part_number, description, unit, cost_each, sell_price, raw_json, search_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
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
      "pump-001 vinide"
    );

    activateImportBatch(batchId, db);
    const match = getActiveTenciaImportMatch("PUMP-001", null, db);
    expect(match?.supplier).toBe("VINIDE");
    expect(match?.supplierPartNumber).toBe("GRU-12345");
  });
});
