#!/usr/bin/env python3
"""Parse CowAg price list PDF — always uses Sell Price 1 as sell price."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF required: pip3 install pymupdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF = ROOT / "data/price-lists/Current Price List - To Save on Desktop.pdf"
OUTPUT_JSON = ROOT / "data/cowag-catalogue-seed.json"
SOURCE_LABEL = "CowAg Price List 30/06/2026 (Sell Price 1)"

COL = {
    "code": (0, 130),
    "desc": (130, 385),
    "unit": (385, 432),
    "sell1": (432, 492),
    "sell2": (492, 548),
    "sell3": (548, 603),
    "sell4": (603, 658),
    "sell5": (658, 718),
    "sell6": (718, 778),
    "tax": (778, 900),
}

SKIP_PREFIXES = (
    "Category",
    "Sub Category",
    "Date:",
    "Stock Location",
    "COWARAMUP",
    "Stock Code",
    "Sell Price",
    "(All",
    "(Excluding",
    "--",
)


def col_for(x: float) -> str:
    for name, (a, b) in COL.items():
        if a <= x < b:
            return name
    return "other"


def parse_money(value: str) -> float | None:
    value = value.strip().replace(",", "")
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def is_header_row(cells: dict[str, list[str]], y: float) -> bool:
    if y < 90:
        return True
    joined = " ".join(word for words in cells.values() for word in words)
    return any(joined.startswith(prefix) for prefix in SKIP_PREFIXES)


def parse_pdf(pdf_path: Path) -> list[dict]:
    doc = fitz.open(pdf_path)
    raw_rows: list[dict[str, str]] = []

    for page in doc:
        words = page.get_text("words")
        grouped: dict[float, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        for w in words:
            y = round(w[1], 1)
            grouped[y][col_for(w[0])].append(w[4])

        for y in sorted(grouped.keys()):
            cells = grouped[y]
            if is_header_row(cells, y):
                continue

            code = "".join(cells.get("code", [])).strip()
            desc = " ".join(cells.get("desc", [])).strip()
            unit = " ".join(cells.get("unit", [])).strip()
            sell1 = " ".join(cells.get("sell1", [])).strip()
            tax = " ".join(cells.get("tax", [])).strip()

            if not any([code, desc, sell1, tax]):
                continue

            raw_rows.append(
                {"code": code, "desc": desc, "unit": unit, "sell1": sell1, "tax": tax}
            )

    items: list[dict] = []
    i = 0
    while i < len(raw_rows):
        row = raw_rows[i]
        code = row["code"]

        if i + 1 < len(raw_rows):
            nxt = raw_rows[i + 1]
            if (
                nxt["code"]
                and not nxt["desc"]
                and not nxt["sell1"]
                and not nxt["tax"]
                and not nxt["unit"]
            ):
                if code.endswith("-") or row["desc"] or row["sell1"] or row["tax"]:
                    code = code + nxt["code"]
                    i += 1

        desc = row["desc"]
        unit = row["unit"] or "EACH"
        sell_price = parse_money(row["sell1"])

        if code:
            items.append(
                {
                    "cowagCode": code,
                    "description": desc or code,
                    "unit": unit,
                    "sellPrice": sell_price,
                    "source": SOURCE_LABEL,
                }
            )

        i += 1

    by_code: dict[str, dict] = {}
    for item in items:
        by_code[item["cowagCode"]] = item

    return list(by_code.values())


def main() -> None:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        sys.exit(1)

    items = parse_pdf(pdf_path)
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"Parsed {len(items)} products from {pdf_path.name}")
    print(f"Wrote {OUTPUT_JSON}")


if __name__ == "__main__":
    main()
