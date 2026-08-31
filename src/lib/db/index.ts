import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { migrateCatalogueImports } from "@/lib/db/catalogue-imports";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "quote-helper.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
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
      options_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'cowag',
      cowag_code TEXT,
      supplier TEXT,
      supplier_part_number TEXT,
      description TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'EACH',
      sell_price REAL,
      cost_each REAL,
      source TEXT,
      last_updated TEXT NOT NULL,
      search_text TEXT NOT NULL DEFAULT ''
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_cowag_code ON products(cowag_code) WHERE cowag_code IS NOT NULL;

    CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
      product_id UNINDEXED,
      cowag_code,
      supplier_part_number,
      description,
      supplier,
      search_text,
      tokenize='unicode61 remove_diacritics 1'
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      description TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scope_clauses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS price_list_meta (
      id TEXT PRIMARY KEY,
      source_file TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      product_count INTEGER NOT NULL
    );

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
    );
  `);

  migrateSchema(database);
  migrateCatalogueImports(database);
  refreshBuiltInBlankTemplate(database);
  seedDefaults(database);
}

function refreshBuiltInBlankTemplate(database: Database.Database) {
  const { createBlankQuoteTemplate } = require("../templates/steel-tank-install") as typeof import("../templates/steel-tank-install");
  const blank = createBlankQuoteTemplate();
  database
    .prepare(
      "UPDATE templates SET payload_json = ?, description = ? WHERE id = ? AND kind = 'job'"
    )
    .run(JSON.stringify(blank.payload), blank.description ?? null, blank.id);
}

function migrateSchema(database: Database.Database) {
  const columns = database.prepare("PRAGMA table_info(quotes)").all() as Array<{ name: string }>;
  if (!columns.some((c) => c.name === "customer_pricing_mode")) {
    database.exec(
      "ALTER TABLE quotes ADD COLUMN customer_pricing_mode TEXT NOT NULL DEFAULT 'itemised'"
    );
  }

  const ftsInfo = database.prepare("PRAGMA table_info(products_fts)").all() as Array<{ name: string }>;
  if (ftsInfo.length > 0 && !ftsInfo.some((c) => c.name === "supplier_part_number")) {
    rebuildProductFts(database);
  }
}

function seedDefaults(database: Database.Database) {
  const clauseCount = database.prepare("SELECT COUNT(*) as c FROM scope_clauses").get() as { c: number };
  if (clauseCount.c === 0) {
    const insert = database.prepare(
      "INSERT INTO scope_clauses (id, title, text, category) VALUES (?, ?, ?, ?)"
    );
    const clauses = [
      ["sand-pad-included", "Sand pad included", "Sand pad preparation and earthworks are included in this quotation.", "earthworks"],
      ["sand-pad-excluded", "Sand pad excluded", "Sand pad / earthworks are excluded and to be arranged by others.", "earthworks"],
      ["plumbing-included", "Plumbing included", "Plumbing in/out connections are included as specified.", "plumbing"],
      ["plumbing-excluded", "Plumbing excluded", "Plumbing connections are excluded from this quotation.", "plumbing"],
      ["pump-uv-separate", "Pump/UV quoted separately", "Pump and UV equipment are quoted separately unless otherwise noted.", "equipment"],
      ["labour-hourly", "Labour charged hourly", "Additional labour beyond scope may be charged at hourly rates.", "labour"],
      ["site-access", "Site access conditions", "Quote assumes reasonable site access for delivery and installation equipment.", "site"],
    ];
    for (const [id, title, text, category] of clauses) {
      insert.run(id, title, text, category);
    }
  }

  const templateCount = database.prepare("SELECT COUNT(*) as c FROM templates WHERE kind = 'job'").get() as { c: number };
  if (templateCount.c === 0) {
    const { createSteelTankInstallTemplate, createBlankQuoteTemplate, getSectionTemplates } = require("../templates/steel-tank-install") as typeof import("../templates/steel-tank-install");
    const insert = database.prepare(
      "INSERT INTO templates (id, name, kind, description, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const template of [createSteelTankInstallTemplate(), createBlankQuoteTemplate(), ...getSectionTemplates()]) {
      insert.run(
        template.id,
        template.name,
        template.kind,
        template.description ?? null,
        JSON.stringify(template.payload),
        template.createdAt
      );
    }
  }
}

export function rebuildProductFts(database?: Database.Database) {
  const db = database ?? getDb();
  db.exec("DROP TABLE IF EXISTS products_fts");
  db.exec(`
    CREATE VIRTUAL TABLE products_fts USING fts5(
      product_id UNINDEXED,
      cowag_code,
      supplier_part_number,
      description,
      supplier,
      search_text,
      tokenize='unicode61 remove_diacritics 1'
    )
  `);
  const products = db.prepare("SELECT * FROM products").all() as Array<{
    id: string;
    cowag_code: string | null;
    supplier_part_number: string | null;
    description: string;
    supplier: string | null;
    search_text: string;
  }>;
  const insert = db.prepare(
    "INSERT INTO products_fts (product_id, cowag_code, supplier_part_number, description, supplier, search_text) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    for (const p of products) {
      insert.run(
        p.id,
        p.cowag_code ?? "",
        p.supplier_part_number ?? "",
        p.description,
        p.supplier ?? "",
        p.search_text
      );
    }
  });
  tx();
}
