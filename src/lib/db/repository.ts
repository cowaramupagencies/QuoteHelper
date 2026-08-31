import { v4 as uuidv4 } from "uuid";
import { ensureDb, query, queryOne, withTransaction } from "@/lib/db/client";
import { getActiveTenciaImportMatch, searchActiveCatalogueImports } from "@/lib/db/catalogue-imports";
import type { CatalogueImportRow } from "@/types/catalogue-imports";
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

export async function listQuotes(limit = 20): Promise<Quote[]> {
  await ensureDb();
  const { rows } = await query("SELECT * FROM quotes ORDER BY updated_at DESC LIMIT $1", [limit]);
  return rows.map((r) => rowToQuote(r));
}

export async function getQuote(id: string): Promise<Quote | null> {
  await ensureDb();
  const row = await queryOne("SELECT * FROM quotes WHERE id = $1", [id]);
  return row ? rowToQuote(row) : null;
}

export async function saveQuote(quote: Quote): Promise<Quote> {
  await ensureDb();
  const now = new Date().toISOString();
  const updated = { ...quote, updatedAt: now };
  await query(
    `
    INSERT INTO quotes (
      id, quote_number, quote_date, status, template_id, template_name,
      customer_json, delivery_json, scope_text, customer_pricing_mode,
      options_json, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT(id) DO UPDATE SET
      quote_number = EXCLUDED.quote_number,
      quote_date = EXCLUDED.quote_date,
      status = EXCLUDED.status,
      template_id = EXCLUDED.template_id,
      template_name = EXCLUDED.template_name,
      customer_json = EXCLUDED.customer_json,
      delivery_json = EXCLUDED.delivery_json,
      scope_text = EXCLUDED.scope_text,
      customer_pricing_mode = EXCLUDED.customer_pricing_mode,
      options_json = EXCLUDED.options_json,
      updated_at = EXCLUDED.updated_at
  `,
    [
      updated.id,
      updated.quoteNumber,
      updated.quoteDate,
      updated.status,
      updated.templateId ?? null,
      updated.templateName ?? null,
      JSON.stringify(updated.customer),
      JSON.stringify(updated.delivery),
      updated.scopeText,
      updated.customerPricingMode ?? "itemised",
      JSON.stringify(updated.options),
      updated.createdAt || now,
      updated.updatedAt,
    ]
  );
  return updated;
}

export async function deleteQuote(id: string) {
  await ensureDb();
  await query("DELETE FROM quotes WHERE id = $1", [id]);
}

export async function generateQuoteNumber(): Promise<string> {
  await ensureDb();
  const row = await queryOne("SELECT quote_number FROM quotes ORDER BY created_at DESC LIMIT 1");
  if (!row) return "114694";
  const num = parseInt(String(row.quote_number).replace(/\D/g, ""), 10);
  return String(Number.isNaN(num) ? 114694 : num + 1);
}

async function enrichProductWithActiveTenciaImport(product: Product): Promise<Product> {
  const tencia = await getActiveTenciaImportMatch(product.cowagCode, product.supplierPartNumber);
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

function rowToProduct(row: Record<string, unknown>): Product {
  return {
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
}

async function rowToProductEnriched(row: Record<string, unknown>): Promise<Product> {
  return enrichProductWithActiveTenciaImport(rowToProduct(row));
}

export async function getProduct(id: string): Promise<Product | null> {
  await ensureDb();
  const row = await queryOne("SELECT * FROM products WHERE id = $1", [id]);
  return row ? rowToProductEnriched(row) : null;
}

export async function getProductByCowagCode(code: string): Promise<Product | null> {
  await ensureDb();
  const trimmed = code.trim();
  if (!trimmed) return null;
  const row = await queryOne(
    `
    SELECT * FROM products
    WHERE UPPER(TRIM(cowag_code)) = UPPER($1)
       OR UPPER(REPLACE(cowag_code, ' ', '')) = UPPER(REPLACE($2, ' ', ''))
    ORDER BY LENGTH(cowag_code)
    LIMIT 1
  `,
    [trimmed, trimmed]
  );
  return row ? rowToProductEnriched(row) : null;
}

export async function getProductBySupplierPartNumber(partNumber: string): Promise<Product | null> {
  await ensureDb();
  const trimmed = partNumber.trim();
  if (!trimmed) return null;
  const row = await queryOne(
    `
    SELECT * FROM products
    WHERE UPPER(TRIM(supplier_part_number)) = UPPER($1)
    LIMIT 1
  `,
    [trimmed]
  );
  return row ? rowToProductEnriched(row) : null;
}

export async function saveProduct(
  product: Omit<Product, "id" | "lastUpdated"> & { id?: string }
): Promise<Product> {
  await ensureDb();
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

  await query(
    `
    INSERT INTO products (
      id, type, cowag_code, supplier, supplier_part_number, description,
      unit, sell_price, cost_each, source, last_updated, search_text
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT(id) DO UPDATE SET
      type = EXCLUDED.type,
      cowag_code = EXCLUDED.cowag_code,
      supplier = EXCLUDED.supplier,
      supplier_part_number = EXCLUDED.supplier_part_number,
      description = EXCLUDED.description,
      unit = EXCLUDED.unit,
      sell_price = EXCLUDED.sell_price,
      cost_each = EXCLUDED.cost_each,
      source = EXCLUDED.source,
      last_updated = EXCLUDED.last_updated,
      search_text = EXCLUDED.search_text
  `,
    [
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
      searchText,
    ]
  );

  return { ...product, id, lastUpdated: now };
}

function productMatchKey(product: {
  cowagCode?: string | null;
  supplierPartNumber?: string | null;
}): string | null {
  if (product.cowagCode?.trim()) return `cowag:${product.cowagCode.trim().toUpperCase()}`;
  if (product.supplierPartNumber?.trim()) {
    return `spn:${product.supplierPartNumber.trim().toUpperCase()}`;
  }
  return null;
}

function catalogueImportRowToProduct(row: CatalogueImportRow): Product {
  return {
    id: row.id,
    type: row.cowagCode ? "cowag" : "supplier",
    cowagCode: row.cowagCode ?? undefined,
    supplier: row.supplier ?? undefined,
    supplierPartNumber: row.supplierPartNumber ?? undefined,
    description: row.description,
    unit: row.unit,
    sellPrice: row.sellPrice,
    costEach: row.costEach,
    source: "Tencia (active import)",
    lastUpdated: new Date().toISOString(),
  };
}

export async function searchProducts(
  searchQuery: string,
  limit = 20,
  mode: "all" | "code" = "all"
): Promise<Product[]> {
  await ensureDb();
  const q = searchQuery.trim();
  if (!q) return [];

  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const results: Product[] = [];

  const pushProductRows = async (rows: Record<string, unknown>[]) => {
    for (const row of rows) {
      const id = row.id as string;
      if (seenIds.has(id)) continue;

      const product = await rowToProductEnriched(row);
      const key = productMatchKey(product);
      if (key && seenKeys.has(key)) continue;

      seenIds.add(id);
      if (key) seenKeys.add(key);
      results.push(product);
      if (results.length >= limit) return;
    }
  };

  const pushCatalogueRows = (rows: CatalogueImportRow[]) => {
    for (const row of rows) {
      if (seenIds.has(row.id)) continue;

      const key = productMatchKey(row);
      if (key && seenKeys.has(key)) continue;

      seenIds.add(row.id);
      if (key) seenKeys.add(key);
      results.push(catalogueImportRowToProduct(row));
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

  await pushProductRows(
    (
      await query(
        `
        SELECT * FROM products
        WHERE UPPER(cowag_code) = $1
           OR UPPER(supplier_part_number) = $2
           OR UPPER(REPLACE(cowag_code, ' ', '')) = $3
        LIMIT $4
      `,
        [upper, upper, upper, limit]
      )
    ).rows
  );
  if (results.length >= limit) return results;

  await pushProductRows(
    (
      await query(
        `
        SELECT * FROM products
        WHERE LOWER(cowag_code) LIKE $1
           OR LOWER(supplier_part_number) LIKE $2
        ORDER BY LENGTH(cowag_code), cowag_code
        LIMIT $3
      `,
        [codePrefix, codePrefix, limit]
      )
    ).rows
  );
  if (results.length >= limit) return results;

  await pushProductRows(
    (
      await query(
        `
        SELECT * FROM products
        WHERE LOWER(cowag_code) LIKE $1
           OR LOWER(supplier_part_number) LIKE $2
        ORDER BY
          CASE WHEN LOWER(cowag_code) LIKE $3 THEN 0 ELSE 1 END,
          LENGTH(cowag_code),
          cowag_code
        LIMIT $4
      `,
        [codeLike, codeLike, codePrefix, limit]
      )
    ).rows
  );
  if (results.length >= limit) return results;

  if (results.length < limit) {
    pushCatalogueRows(await searchActiveCatalogueImports(q, limit, mode));
  }
  if (results.length >= limit || mode === "code") return results;

  if (results.length < limit) {
    await pushProductRows(
      (
        await query(
          `
          SELECT * FROM products
          WHERE description ILIKE $1
             OR cowag_code ILIKE $1
             OR supplier_part_number ILIKE $1
             OR search_text ILIKE $1
          ORDER BY description
          LIMIT $2
        `,
          [like, limit]
        )
      ).rows
    );
  }

  return results;
}

export async function clearProducts() {
  await ensureDb();
  await query("DELETE FROM products");
}

export async function listProducts(limit = 100, offset = 0): Promise<Product[]> {
  await ensureDb();
  const { rows } = await query("SELECT * FROM products ORDER BY description LIMIT $1 OFFSET $2", [
    limit,
    offset,
  ]);
  return Promise.all(rows.map((r) => rowToProductEnriched(r)));
}

export async function countProducts(): Promise<number> {
  await ensureDb();
  const row = await queryOne("SELECT COUNT(*)::int AS c FROM products");
  return (row?.c as number) ?? 0;
}

export async function getPriceListMeta() {
  await ensureDb();
  return queryOne("SELECT * FROM price_list_meta ORDER BY last_updated DESC LIMIT 1") as Promise<
    | { id: string; source_file: string; last_updated: string; product_count: number }
    | null
  >;
}

export interface PriceImportSummary {
  matched: number;
  pricesChanged: number;
  newProducts: number;
  notFound: number;
}

export async function importCowagProducts(
  items: Array<{
    cowagCode: string;
    description: string;
    unit: string;
    sellPrice: number | null;
    source: string;
  }>,
  sourceFile: string
): Promise<PriceImportSummary> {
  await ensureDb();
  const summary: PriceImportSummary = { matched: 0, pricesChanged: 0, newProducts: 0, notFound: 0 };
  const now = new Date().toISOString();

  await withTransaction(async () => {
    for (const item of items) {
      const existing = await queryOne("SELECT * FROM products WHERE cowag_code = $1", [item.cowagCode]);
      if (existing) {
        summary.matched++;
        const oldPrice = existing.sell_price as number | null;
        if (oldPrice !== item.sellPrice) summary.pricesChanged++;
        await saveProduct({
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
        await saveProduct({
          type: "cowag",
          cowagCode: item.cowagCode,
          description: item.description,
          unit: item.unit,
          sellPrice: item.sellPrice,
          source: item.source,
        });
      }
    }

    const total = await countProducts();
    await query(
      "INSERT INTO price_list_meta (id, source_file, last_updated, product_count) VALUES ($1, $2, $3, $4)",
      [uuidv4(), sourceFile, now, total]
    );
  });

  return summary;
}

export async function listScopeClauses() {
  await ensureDb();
  const { rows } = await query("SELECT * FROM scope_clauses ORDER BY category, title");
  return rows as Array<{
    id: string;
    title: string;
    text: string;
    category: string | null;
  }>;
}

export async function listTemplates(kind?: string) {
  await ensureDb();
  const { rows } = kind
    ? await query("SELECT * FROM templates WHERE kind = $1 ORDER BY name", [kind])
    : await query("SELECT * FROM templates ORDER BY kind, name");
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    kind: row.kind as string,
    description: (row.description as string) || undefined,
    payload: JSON.parse(row.payload_json as string),
    createdAt: row.created_at as string,
  }));
}

export async function saveTemplate(template: {
  id?: string;
  name: string;
  kind: string;
  description?: string;
  payload: unknown;
}) {
  await ensureDb();
  const id = template.id ?? uuidv4();
  const now = new Date().toISOString();
  await query(
    `
    INSERT INTO templates (id, name, kind, description, payload_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(id) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      payload_json = EXCLUDED.payload_json
  `,
    [id, template.name, template.kind, template.description ?? null, JSON.stringify(template.payload), now]
  );
  return id;
}
