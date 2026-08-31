# Implementation Report — CowAg Quote Helper V1

## Architecture

- **Next.js 15** App Router (React 19, TypeScript, Tailwind CSS)
- **SQLite** (`data/quote-helper.db`) via `better-sqlite3`
- **FTS5** full-text search on product catalogue
- **ExcelJS** export using canonical template at `data/templates/quotation-template.xlsx`
- Pricing engine in `src/lib/pricing/calculations.ts`
- See `ARCHITECTURE.md` for full data model

## Files Created

### Core
- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`
- `ARCHITECTURE.md`, `README.md`
- `data/cowag-catalogue-seed.json` (6,583 products parsed from price list PDF extract)
- `data/templates/quotation-template.xlsx` (canonical workbook)

### Backend
- `src/lib/db/index.ts` — schema init, FTS rebuild
- `src/lib/db/repository.ts` — quotes, products, templates, price imports
- `src/lib/pricing/calculations.ts` — BOM math, option totals, duplication
- `src/lib/templates/steel-tank-install.ts` — Steel Tank Install template
- `src/lib/excel/generate-workbook.ts` — Job BOM + Quotation export
- `scripts/seed-catalogue.ts` — initial catalogue import

### API Routes
- `/api/quotes`, `/api/quotes/[id]`, `/api/quotes/[id]/export`
- `/api/products`, `/api/templates`, `/api/price-lists`, `/api/scope-clauses`

### UI
- Dashboard, New Quote, Quote Editor (BUILD | SCOPE | PREVIEW)
- Catalogue, Price Lists, Templates pages
- Components: `OptionCard`, `SectionEditor`, `ProductSearch`, etc.

### Tests
- `tests/pricing.test.ts` — calculations, FREE/POA, option duplication
- `tests/excel.test.ts` — workbook generation from template

## Database Schema

| Table | Purpose |
|-------|---------|
| `quotes` | Quote metadata + JSON options/customer/scope |
| `products` | CowAg + supplier/custom catalogue |
| `products_fts` | FTS5 search index |
| `templates` | Job + section templates |
| `scope_clauses` | Reusable scope snippets |
| `price_list_meta` | Import source/date/count |
| `tank_references` | Future TankFinder import (empty) |

## Implemented Functionality

- Dashboard with New Quote, recent quotes, catalogue stats
- Quote creation with Steel Tank Install / Blank templates
- Customer + delivery details, quote number/date
- **BUILD tab:** option cards, collapsible sections, BOM item editing
- Add/Duplicate/Remove options
- Product search (description, CowAg code, partial words)
- Custom items + Save to Catalogue
- Pricing states: Normal, FREE, Included, POA
- Automatic cost/sell/margin calculations (divide-by-zero safe)
- Option totals: cost, sell ex/inc GST, margin
- **SCOPE tab:** editable text + saved clauses
- **PREVIEW tab:** customer-facing option/section summary
- **Excel export:** Job BOM + Quotation sheets populated from data
- Price Lists screen with import summary
- Templates seeded: Steel Tank Install, Blank Quote, 8 section templates

## Tests / Results

```
✓ tests/pricing.test.ts (7 tests)
✓ tests/excel.test.ts (1 test)
8 passed
npm run build — success
Catalogue seeded: 6,583 products
```

## Outstanding / Future

- TankFinder data import into `tank_references` (model ready, not populated)
- Section reorder/remove UI (data model supports it; UI shows enable/rename only)
- Save Current Quote as Template (API exists, UI button not wired)
- PDF price list import UI (seed JSON + re-import API implemented)
- Supplier product individual edit on Price Lists page
- "Update saved catalogue price" prompt when editing during quote
- AI-generated scope (architecture ready via editable scope field)
- Authentication / multi-user (deferred per spec)
- Branding/logos (deferred)
- Some parsed catalogue descriptions contain PDF concatenation artefacts — re-import with cleaner source will improve search quality

## Run

```bash
npm install
npm run db:seed   # first time only
npm run dev
```

Open http://localhost:3000
