# Cowaramup Agencies Quote Helper — Architecture

## Overview

Internal quoting web app that populates the existing Excel quotation workbook. The app owns structured quote data; Excel export is a presentation layer matching the canonical template.

## Stack

- **Frontend:** Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js Route Handlers
- **Database:** SQLite via `better-sqlite3` (single-file, internal tool)
- **Excel:** `exceljs` — loads canonical template, writes structured rows
- **Tests:** Vitest

## Data Model

### Quotes
- Customer details, quote number, date, status (draft/sent)
- Template reference (optional)
- Scope of works (HTML/text)
- JSON payload: `options[]` each with `sections[]` each with `items[]`

### BOM Item Fields
`supplier`, `supplierPartNumber`, `cowagPartNumber`, `description`, `quantity`, `costEach`, `costTotal`, `markupPercent`, `sellEach`, `sellTotal`, `marginDollar`, `marginPercent`, `pricingState` (normal|free|included|poa), `unit`

### Section Fields
`name`, `enabled`, `sortOrder`, `customerLabel`, `showOnCustomerQuote`, `customerTotalOverride`

### Option Fields
`name`, `sortOrder`, sections[]

### Products (Catalogue)
- **CowAg:** `cowagCode` (unique), description, unit, sellPrice, costEach (nullable), source, lastUpdated
- **Supplier/custom:** no CowAg code required; searchable by description/supplier

### Templates
- Job templates: full option/section structure
- Section templates: reusable section + items

### Scope Clauses
Reusable text snippets for scope editor.

### Price List Imports
Import metadata + diff summary (matched/changed/new/not found).

### TankReference (future)
Placeholder table/service for Kingspan/Coerco/WCP data from TankFinder — never overrides quote-specific supplier pricing.

## Pricing Engine

Calculations in `src/lib/pricing/calculations.ts`:
- `costTotal = qty × costEach` (when costEach present)
- `sellEach` from markup% or manual entry
- `sellTotal = qty × sellEach` (except FREE/Included/POA)
- Margin safe against divide-by-zero
- Section/option rollups aggregate item totals

## Excel Export

1. Load `data/templates/quotation-template.xlsx`
2. **Job BOM sheet:** write option headings, then item rows with all BOM columns
3. **Quotation sheet:** customer block, scope, customer-facing option lines
4. No fragile cross-sheet row references — values written directly

## UI Flow

Dashboard → New Quote → BUILD | SCOPE | PREVIEW → Export Excel

Steel Tank Install template seeds 3 default sections per option; options are flexible (add/duplicate/remove).

## Search

SQLite FTS5 virtual table on products (description, cowagCode, supplier, tokens). Partial word matching via normalized query.
