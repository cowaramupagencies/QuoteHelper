# Spreadsheet Pivot — Implementation Report

## Problem reframed

The app is now a **smart browser-based Job BOM + Quotation workbook**, not a card/section builder. The painful workflow was switching between Excel and Tencia to search items and paste codes/prices — inline catalogue search in the BOM table is the primary feature.

## What was retained (no rewrite)

| Layer | Status |
|-------|--------|
| SQLite schema + `quotes.options_json` nested model | Unchanged |
| Product FTS search + `/api/products` | Unchanged |
| Price list import + catalogue seed | Unchanged |
| Templates API + steel tank seed structures | Unchanged |
| Excel export (`generate-workbook.ts`) | Enhanced, not replaced |
| Pricing engine (`calculations.ts`) | Enhanced (markup derivation) |
| Scope capacity limits (`scope/capacity.ts`) | Unchanged |
| App shell, design tokens, dashboard | Unchanged |

**Data model:** `Quote → QuoteOption → BomSection → BomItem` maps directly to Excel option headers, section headers, and item rows. Price values remain snapshotted on each BOM row.

## What changed

### Quote workspace tabs
- **JOB BOM** — spreadsheet editing (replaces BUILD / SCOPE / PREVIEW)
- **QUOTATION** — customer fields, scope, pricing rollups (replaces separate forms + preview)

### New components
- `src/components/quote/spreadsheet/JobBomTab.tsx`
- `src/components/quote/spreadsheet/BomSpreadsheet.tsx`
- `src/components/quote/spreadsheet/InlineProductSearch.tsx`
- `src/components/quote/spreadsheet/QuotationTab.tsx`
- `src/lib/quote/bom-mutations.ts` — add/duplicate/remove options, sections, items
- `src/lib/quote/product-to-item.ts` — catalogue → BOM row (sell from catalogue, cost only when available)

### Removed (replaced)
- `BuildTab`, `OptionCard`, `SectionEditor`, `ScopeTab`, `PreviewTab`, `ProductSearch`, `QuoteDetailsForm`

### Job BOM features
- Columns match CowAg workbook: Supplier → Margin %
- Black **option** header rows, green **section** header rows, section/option total rows
- **+ Add Item** — inline catalogue search (type → pick → qty)
- **+ Add Manual Item** — blank row + **Save to catalogue**
- **+ Add Section / + Add Option**
- Duplicate/remove options and sections
- Pricing states: Normal, FREE, Included, POA
- Auto totals: Cost Total, Sell Total, Margin $, Margin % (Excel logic: margin % = margin ÷ sell)
- Mark-up % derived when cost + sell entered

### Quotation tab
- Customer, quote #, date, delivery fields
- Scope of Works editor with **814-char Excel box cap** (red when over)
- Saved clauses insert
- Customer pricing mode: itemised / grouped / single total
- Per-section: customer label, on-quote toggle, pricing group, sell override
- Live preview of exported quotation lines

### Excel export
- Dynamic row generation (no hard-coded source row numbers)
- Section header rows + section/option subtotals on Job BOM
- Quotation sheet unchanged in structure (scope merge A70:L82, pricing rows)

### Other
- **Save as Template** button on quote page (uses existing `/api/templates` POST)
- Spreadsheet CSS in `globals.css` (sticky headers, header row colours, cell focus)

## Verification

- **Tests:** 22/22 passing (`pricing`, `excel`, `scope-capacity`)
- **Production build:** passing

## Still outstanding

1. **Last Cost from Tencia** — catalogue supports `costEach`; current seed is sell-price only. Future import should match by CowAg code and populate cost without touching historical quote rows.
2. **Keyboard polish** — basic Enter/Escape/arrow in search; full Tab-through-new-row flow could be tightened.
3. **Section `enabled` toggle** — still in data model; no spreadsheet UI toggle (sections can be removed instead).
4. **Row reorder** — drag-and-drop section/option ordering not implemented.
5. **Mobile** — horizontal scroll works; editing is desktop-first as specified.
6. **Pump/UV/poly templates** — section templates exist in DB; only Steel Tank Install is fully seeded with section placeholders.

## Quick usage

1. Open a quote → **Job BOM** tab
2. **+ Add Item** → type `nipple` / `SJ35` → Enter to select → set Qty
3. **Quotation** tab → edit scope + section customer labels
4. **Save** → **Export Excel**
