import { AsyncLocalStorage } from "node:async_hooks";
import { createPool, sql } from "@vercel/postgres";
import {
  createBlankQuoteTemplate,
  createSteelTankInstallTemplate,
  getSectionTemplates,
} from "@/lib/templates/steel-tank-install";

export type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number;
};

export type QueryFn = (text: string, params?: unknown[]) => Promise<QueryResult>;

const txContext = new AsyncLocalStorage<QueryFn>();

let queryOverride: QueryFn | null = null;
let schemaReady: Promise<void> | null = null;
let pool: ReturnType<typeof createPool> | null = null;

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

export function __setTestQueryRunner(runner: QueryFn | null) {
  queryOverride = runner;
  schemaReady = null;
}

async function runQuery(text: string, params: unknown[] = []): Promise<QueryResult> {
  const tx = txContext.getStore();
  if (tx) {
    return tx(text, params);
  }

  if (queryOverride) {
    return queryOverride(text, params);
  }

  const result = await sql.query(text, params);
  return {
    rows: result.rows as Record<string, unknown>[],
    rowCount: result.rowCount ?? 0,
  };
}

export const query = runQuery;

export async function queryOne(
  text: string,
  params: unknown[] = []
): Promise<Record<string, unknown> | null> {
  const { rows } = await runQuery(text, params);
  return rows[0] ?? null;
}

/** Multi-row INSERT in chunks (avoids thousands of round-trips for large CSV imports). */
export async function insertMany(
  table: string,
  columns: readonly string[],
  rows: unknown[][],
  chunkSize = 250
): Promise<void> {
  if (rows.length === 0) return;

  const colList = columns.join(", ");
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let paramIndex = 1;
    const valueGroups = chunk.map((row) => {
      const placeholders = row.map(() => `$${paramIndex++}`).join(", ");
      return `(${placeholders})`;
    });
    await runQuery(
      `INSERT INTO ${table} (${colList}) VALUES ${valueGroups.join(", ")}`,
      chunk.flat()
    );
  }
}

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (queryOverride) {
    return txContext.run(queryOverride, fn);
  }

  const client = await getPool().connect();
  const tx: QueryFn = async (text, params = []) => {
    const result = await client.query(text, params);
    return {
      rows: result.rows as Record<string, unknown>[],
      rowCount: result.rowCount ?? 0,
    };
  };

  try {
    await client.query("BEGIN");
    const result = await txContext.run(tx, fn);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureDb(): Promise<void> {
  if (!schemaReady) {
    schemaReady = migrateSchema();
  }
  await schemaReady;
}

async function migrateSchema() {
  await runQuery(`
    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL,
      quote_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      template_id TEXT,
      template_name TEXT,
      customer_json TEXT NOT NULL,
      delivery_json TEXT NOT NULL,
      scope_text TEXT NOT NULL DEFAULT '',
      customer_pricing_mode TEXT NOT NULL DEFAULT 'itemised',
      options_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'cowag',
      cowag_code TEXT,
      supplier TEXT,
      supplier_part_number TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'EACH',
      sell_price DOUBLE PRECISION,
      cost_each DOUBLE PRECISION,
      source TEXT,
      last_updated TEXT NOT NULL,
      search_text TEXT NOT NULL DEFAULT ''
    )
  `);

  await runQuery(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_cowag_code
      ON products(cowag_code)
      WHERE cowag_code IS NOT NULL
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_products_search_text ON products(search_text)
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS scope_clauses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      category TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS price_list_meta (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      product_count INTEGER NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS tank_references (
      id TEXT PRIMARY KEY,
      supplier TEXT NOT NULL,
      model TEXT NOT NULL,
      capacity_litres INTEGER,
      material TEXT,
      dimensions TEXT,
      base_requirements TEXT,
      blue_metal_notes TEXT,
      metadata_json TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS catalogue_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS catalogue_import_batches (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES catalogue_categories(id),
      original_filename TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'imported',
      summary_json TEXT NOT NULL DEFAULT '{}'
    )
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_batches_category
      ON catalogue_import_batches(category_id, imported_at DESC)
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS catalogue_import_rows (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES catalogue_import_batches(id),
      cowag_code TEXT,
      supplier TEXT,
      supplier_part_number TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'EACH',
      cost_each DOUBLE PRECISION,
      sell_price DOUBLE PRECISION,
      raw_json TEXT NOT NULL DEFAULT '{}',
      search_text TEXT NOT NULL DEFAULT ''
    )
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_batch
      ON catalogue_import_rows(batch_id)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_cowag
      ON catalogue_import_rows(cowag_code)
  `);

  await runQuery(`
    CREATE INDEX IF NOT EXISTS idx_catalogue_import_rows_supplier
      ON catalogue_import_rows(supplier_part_number)
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS catalogue_category_active (
      category_id TEXT PRIMARY KEY REFERENCES catalogue_categories(id),
      batch_id TEXT NOT NULL REFERENCES catalogue_import_batches(id),
      activated_at TEXT NOT NULL
    )
  `);

  await seedDefaults();
}

async function seedDefaults() {
  const clauseCount = await queryOne("SELECT COUNT(*)::int AS c FROM scope_clauses");
  if ((clauseCount?.c as number) === 0) {
    const clauses = [
      ["sand-pad-included", "Sand pad included", "Sand pad preparation and earthworks are included in this quotation.", "earthworks"],
      ["sand-pad-excluded", "Sand pad excluded", "Sand pad / earthworks are excluded and to be arranged by others.", "earthworks"],
      ["plumbing-included", "Plumbing included", "Plumbing in/out connections are included as specified.", "plumbing"],
      ["plumbing-excluded", "Plumbing excluded", "Plumbing connections are excluded from this quotation.", "plumbing"],
      ["pump-uv-separate", "Pump/UV quoted separately", "Pump and UV equipment are quoted separately unless otherwise noted.", "equipment"],
      ["labour-hourly", "Labour charged hourly", "Additional labour beyond scope may be charged at hourly rates.", "labour"],
      ["site-access", "Site access conditions", "Quote assumes reasonable site access for delivery and installation equipment.", "site"],
    ] as const;
    for (const [id, title, text, category] of clauses) {
      await runQuery("INSERT INTO scope_clauses (id, title, text, category) VALUES ($1, $2, $3, $4)", [
        id,
        title,
        text,
        category,
      ]);
    }
  }

  const templateCount = await queryOne("SELECT COUNT(*)::int AS c FROM templates WHERE kind = 'job'");
  if ((templateCount?.c as number) === 0) {
    for (const template of [
      createSteelTankInstallTemplate(),
      createBlankQuoteTemplate(),
      ...getSectionTemplates(),
    ]) {
      await runQuery(
        "INSERT INTO templates (id, name, kind, description, payload_json, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          template.id,
          template.name,
          template.kind,
          template.description ?? null,
          JSON.stringify(template.payload),
          template.createdAt,
        ]
      );
    }
  } else {
    const blank = createBlankQuoteTemplate();
    await runQuery(
      "UPDATE templates SET payload_json = $1, description = $2 WHERE id = $3 AND kind = 'job'",
      [JSON.stringify(blank.payload), blank.description ?? null, blank.id]
    );
  }

  const categoryCount = await queryOne("SELECT COUNT(*)::int AS c FROM catalogue_categories");
  if ((categoryCount?.c as number) === 0) {
    const categories = [
      { id: "pumps", name: "Pumps", sortOrder: 0 },
      { id: "tanks", name: "Tanks", sortOrder: 1 },
      { id: "filtration", name: "Filtration", sortOrder: 2 },
      { id: "plumbing", name: "Plumbing", sortOrder: 3 },
      { id: "fittings", name: "Fittings", sortOrder: 4 },
      { id: "general", name: "General", sortOrder: 5 },
    ];
    const now = new Date().toISOString();
    for (const category of categories) {
      await runQuery(
        "INSERT INTO catalogue_categories (id, name, sort_order, created_at) VALUES ($1, $2, $3, $4)",
        [category.id, category.name, category.sortOrder, now]
      );
    }
  }
}
