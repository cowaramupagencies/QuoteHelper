import { v4 as uuidv4 } from "uuid";
import { getDb, rebuildProductFts } from "@/lib/db";
import { getActiveTenciaImportMatch } from "@/lib/db/catalogue-imports";
import type { Product, Quote } from "@/types";

function rowToQuote(row: Record<string, unknown>): Quote {
  return {
    id: row.id as string,
    quoteNumber: row.quote_number as string,
    quoteDate: row.quote_date as string,
    status: row.status as Quote["status"],
    templateId: (row.template_id as string) || undefined,
    templateName: (row.template_name as string) || undefined,
    customer: JSON.parse(row.customer_json as string),
    delivery: JSON.parse(row.delivery_json as string),
    scopeText: row.scope_text as string,
    customerPricingMode: (row.customer_pricing_mode as Quote["customerPricingMode"]) || "itemised",
    options: JSON.parse(row.options_json as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listQuotes(limit = 20): Quote[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM quotes ORDER BY updated_at DESC LIMIT ?")
    .all(limit);
  return rows.map((r) => rowToQuote(r as Record<string, unknown>));
}

export function getQuote(id: string): Quote | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id);
  if (!row) return null;
  return rowToQuote(row as Record<string, unknown>);
}

export function saveQuote(quote: Quote): Quote {
  const db = getDb();
  const now = new Date().toISOString();
  const updated = { ...quote, updatedAt: now };
  db.prepare(`
    INSERT INTO quotes (id, quote_number, quote_date, status, template_id, template_name, customer_json, delivery_json, scope_text, customer_pricing_mode, options_json, created_at, updated_at)
    VALUES (@id, @quote_number, @quote_date, @status, @template_id, @template_name, @customer_json, @delivery_json, @scope_text, @customer_pricing_mode, @options_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      quote_number = excluded.quote_number,
      quote_date = excluded.quote_date,
      status = excluded.status,
      template_id = excluded.template_id,
      template_name = excluded.template_name,
      customer_json = excluded.customer_json,
      delivery_json = excluded.delivery_json,
      scope_text = excluded.scope_text,
      customer_pricing_mode = excluded.customer_pricing_mode,
      options_json = excluded.options_json,
      updated_at = excluded.updated_at
  `).run({
    id: updated.id,
    quote_number: updated.quoteNumber,
    quote_date: updated.quoteDate,
    status: updated.status,
    template_id: updated.templateId ?? null,
    template_name: updated.templateName ?? null,
    customer_json: JSON.stringify(updated.customer),
    delivery_json: JSON.stringify(updated.delivery),
    scope_text: updated.scopeText,
    customer_pricing_mode: updated.customerPricingMode ?? "itemised",
    options_json: JSON.stringify(updated.options),
    created_at: updated.createdAt || now,
    updated_at: updated.updatedAt,
  });
  return updated;
}

export function deleteQuote(id: string) {
  getDb().prepare("DELETE FROM quotes WHERE id = ?").run(id);
}

export function generateQuoteNumber(): string {
  const db = getDb();
  const row = db.prepare("SELECT quote_number FROM quotes ORDER BY created_at DESC LIMIT 1").get() as
    | { quote_number: string }
    | undefined;
  if (!row) return "114694";
  const num = parseInt(row.quote_number.replace(/\D/g, ""), 10);
  return String(isNaN(num) ? 114694 : num + 1);
}

function rowToProduct(row: Record<string, unknown>): Product {
  const product: Product = {
    id: row.id as string,
    type: row.type as Product["type"],
    cowagCode: (row.cowag_code as string) || undefined,
    supplier: (row.supplier as string) || undefined,
    supplierPartNumber: (row.supplier_part_number as string) || undefined,
    description: row.description as string,
    unit: row.unit as string,
    sellPrice: row.sell_price as number | null,
    costEach: row.cost_each as number | null,
    source: (row.source as string) || undefined,
    lastUpdated: row.last_updated as string,
  };
  return enrichProductWithActiveTenciaImport(product);
}

function enrichProductWithActiveTenciaImport(product: Product): Product {
  const tencia = getActiveTenciaImportMatch(product.cowagCode, product.supplierPartNumber);
  if (!tencia) return product;

  const next: Product = { ...product };
  let touched = false;

  if (next.costEach == null && tencia.costEach != null) {
    next.costEach = tencia.costEach;
    touched = true;
  }
  if (tencia.supplier?.trim()) {
    next.supplier = tencia.supplier.trim();
    touched = true;
  }
  if (tencia.supplierPartNumber?.trim()) {
    next.supplierPartNumber = tencia.supplierPartNumber.trim();
    touched = true;
  }

  if (!touched) return product;

  return {
    ...next,
    source: product.source ? `${product.source} · Tencia active` : "Tencia (active import)",
  };
}

export function getProduct(id: string): Product | null {
  const row = getDb().prepare("SELECT * FROM products WHERE id = ?").get(id);
  return row ? rowToProduct(row as Record<string, unknown>) : null;
}

export function getProductByCowagCode(code: string): Product | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const row = getDb()
    .prepare(
      `
      SELECT * FROM products
      WHERE UPPER(TRIM(cowag_code)) = UPPER(?)
         OR UPPER(REPLACE(cowag_code, ' ', '')) = UPPER(REPLACE(?, ' ', ''))
      ORDER BY LENGTH(cowag_code)
      LIMIT 1
    `
    )
    .get(trimmed, trimmed);
  return row ? rowToProduct(row as Record<string, unknown>) : null;
}

export function getProductBySupplierPartNumber(partNumber: string): Product | null {
  const trimmed = partNumber.trim();
  if (!trimmed) return null;
  const row = getDb()
    .prepare(
      `
      SELECT * FROM products
      WHERE UPPER(TRIM(supplier_part_number)) = UPPER(?)
      LIMIT 1
    `
    )
    .get(trimmed);
  return row ? rowToProduct(row as Record<string, unknown>) : null;
}

export function saveProduct(product: Omit<Product, "id" | "lastUpdated"> & { id?: string }): Product {
  const db = getDb();
  const id = product.id ?? uuidv4();
  const now = new Date().toISOString();
  const searchText = [
    product.cowagCode,
    product.description,
    product.supplier,
    product.supplierPartNumber,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  db.prepare(`
    INSERT INTO products (id, type, cowag_code, supplier, supplier_part_number, description, unit, sell_price, cost_each, source, last_updated, search_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      cowag_code = excluded.cowag_code,
      supplier = excluded.supplier,
      supplier_part_number = excluded.supplier_part_number,
      description = excluded.description,
      unit = excluded.unit,
      sell_price = excluded.sell_price,
      cost_each = excluded.cost_each,
      source = excluded.source,
      last_updated = excluded.last_updated,
      search_text = excluded.search_text
  `).run(
    id,
    product.type,
    product.cowagCode ?? null,
    product.supplier ?? null,
    product.supplierPartNumber ?? null,
    product.description,
    product.unit,
    product.sellPrice ?? null,
    product.costEach ?? null,
    product.source ?? null,
    now,
    searchText
  );

  db.prepare("DELETE FROM products_fts WHERE product_id = ?").run(id);
  db.prepare(
    "INSERT INTO products_fts (product_id, cowag_code, supplier_part_number, description, supplier, search_text) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    product.cowagCode ?? "",
    product.supplierPartNumber ?? "",
    product.description,
    product.supplier ?? "",
    searchText
  );

  return { ...product, id, lastUpdated: now };
}

export function searchProducts(
  query: string,
  limit = 20,
  mode: "all" | "code" = "all"
): Product[] {
  const db = getDb();
  const q = query.trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: Product[] = [];

  const pushRows = (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = row.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(rowToProduct(row));
      if (results.length >= limit) return;
    }
  };

  const compact = q.replace(/\s+/g, "");
  const upper = compact.toUpperCase();
  const lower = compact.toLowerCase();
  const lowerRaw = q.toLowerCase();
  const like = `%${lowerRaw}%`;
  const codeLike = `%${lower}%`;
  const codePrefix = `${lower}%`;

  pushRows(
    db
      .prepare(
        `
        SELECT * FROM products
        WHERE UPPER(cowag_code) = ?
           OR UPPER(supplier_part_number) = ?
           OR UPPER(REPLACE(cowag_code, ' ', '')) = ?
        LIMIT ?
      `
      )
      .all(upper, upper, upper, limit) as Record<string, unknown>[]
  );
  if (results.length >= limit) return results;

  pushRows(
    db
      .prepare(
        `
        SELECT * FROM products
        WHERE LOWER(cowag_code) LIKE ?
           OR LOWER(supplier_part_number) LIKE ?
        ORDER BY LENGTH(cowag_code), cowag_code
        LIMIT ?
      `
      )
      .all(codePrefix, codePrefix, limit) as Record<string, unknown>[]
  );
  if (results.length >= limit) return results;

  pushRows(
    db
      .prepare(
        `
        SELECT * FROM products
        WHERE LOWER(cowag_code) LIKE ?
           OR LOWER(supplier_part_number) LIKE ?
        ORDER BY
          CASE WHEN LOWER(cowag_code) LIKE ? THEN 0 ELSE 1 END,
          LENGTH(cowag_code),
          cowag_code
        LIMIT ?
      `
      )
      .all(codeLike, codeLike, codePrefix, limit) as Record<string, unknown>[]
  );
  if (results.length >= limit || mode === "code") return results;

  const tokens = lowerRaw.split(/\s+/).filter(Boolean);
  const ftsQuery = tokens.map((t) => `"${t}"*`).join(" ");

  try {
    pushRows(
      db
        .prepare(
          `
          SELECT p.* FROM products_fts fts
          JOIN products p ON p.id = fts.product_id
          WHERE products_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `
        )
        .all(ftsQuery, limit) as Record<string, unknown>[]
    );
  } catch {
    // FTS unavailable — fall through to LIKE search below.
  }

  if (results.length < limit) {
    pushRows(
      db
        .prepare(
          `
          SELECT * FROM products
          WHERE LOWER(description) LIKE ?
             OR LOWER(cowag_code) LIKE ?
             OR LOWER(supplier_part_number) LIKE ?
             OR LOWER(search_text) LIKE ?
          ORDER BY description
          LIMIT ?
        `
        )
        .all(like, like, like, like, limit) as Record<string, unknown>[]
    );
  }

  return results;
}

export function clearProducts() {
  const db = getDb();
  db.exec("DELETE FROM products");
  rebuildProductFts(db);
}

export function listProducts(limit = 100, offset = 0): Product[] {
  const rows = getDb()
    .prepare("SELECT * FROM products ORDER BY description LIMIT ? OFFSET ?")
    .all(limit, offset);
  return rows.map((r) => rowToProduct(r as Record<string, unknown>));
}

export function countProducts(): number {
  const row = getDb().prepare("SELECT COUNT(*) as c FROM products").get() as { c: number };
  return row.c;
}

export function getPriceListMeta() {
  return getDb().prepare("SELECT * FROM price_list_meta ORDER BY last_updated DESC LIMIT 1").get() as
    | { id: string; source_file: string; last_updated: string; product_count: number }
    | undefined;
}

export interface PriceImportSummary {
  matched: number;
  pricesChanged: number;
  newProducts: number;
  notFound: number;
}

export function importCowagProducts(
  items: Array<{
    cowagCode: string;
    description: string;
    unit: string;
    sellPrice: number | null;
    source: string;
  }>,
  sourceFile: string
): PriceImportSummary {
  const db = getDb();
  const summary: PriceImportSummary = { matched: 0, pricesChanged: 0, newProducts: 0, notFound: 0 };
  const now = new Date().toISOString();

  const findByCode = db.prepare("SELECT * FROM products WHERE cowag_code = ?");
  const tx = db.transaction(() => {
    for (const item of items) {
      const existing = findByCode.get(item.cowagCode) as Record<string, unknown> | undefined;
      if (existing) {
        summary.matched++;
        const oldPrice = existing.sell_price as number | null;
        if (oldPrice !== item.sellPrice) summary.pricesChanged++;
        saveProduct({
          id: existing.id as string,
          type: "cowag",
          cowagCode: item.cowagCode,
          description: item.description,
          unit: item.unit,
          sellPrice: item.sellPrice,
          costEach: existing.cost_each as number | null,
          source: item.source,
        });
      } else {
        summary.newProducts++;
        saveProduct({
          type: "cowag",
          cowagCode: item.cowagCode,
          description: item.description,
          unit: item.unit,
          sellPrice: item.sellPrice,
          source: item.source,
        });
      }
    }

    db.prepare("INSERT INTO price_list_meta (id, source_file, last_updated, product_count) VALUES (?, ?, ?, ?)").run(
      uuidv4(),
      sourceFile,
      now,
      countProducts()
    );
  });
  tx();
  rebuildProductFts();
  return summary;
}

export function listScopeClauses() {
  return getDb().prepare("SELECT * FROM scope_clauses ORDER BY category, title").all() as Array<{
    id: string;
    title: string;
    text: string;
    category: string | null;
  }>;
}

export function listTemplates(kind?: string) {
  const db = getDb();
  const rows = kind
    ? db.prepare("SELECT * FROM templates WHERE kind = ? ORDER BY name").all(kind)
    : db.prepare("SELECT * FROM templates ORDER BY kind, name").all();
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as string,
      name: row.name as string,
      kind: row.kind as string,
      description: (row.description as string) || undefined,
      payload: JSON.parse(row.payload_json as string),
      createdAt: row.created_at as string,
    };
  });
}

export function saveTemplate(template: {
  id?: string;
  name: string;
  kind: string;
  description?: string;
  payload: unknown;
}) {
  const id = template.id ?? uuidv4();
  const now = new Date().toISOString();
  getDb()
    .prepare(`
      INSERT INTO templates (id, name, kind, description, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, payload_json = excluded.payload_json
    `)
    .run(id, template.name, template.kind, template.description ?? null, JSON.stringify(template.payload), now);
  return id;
}
