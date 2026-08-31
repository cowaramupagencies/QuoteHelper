"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/pricing/calculations";
import { PageHeader } from "@/components/ui/PageHeader";

export default function CataloguePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/products?limit=50")
      .then((r) => r.json())
      .then(setProducts);
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      fetch(`/api/products?q=${encodeURIComponent(query)}&limit=50`)
        .then((r) => r.json())
        .then(setProducts);
    }
  }, [query]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Product Catalogue"
        subtitle="CowAg price list and saved supplier products."
      />

      <input
        className="input-field max-w-xl"
        placeholder="Search products…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <section className="surface-card overflow-hidden">
        <ul className="divide-y divide-border">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7"
            >
              <div>
                <p className="font-medium text-ink">{p.description}</p>
                <p className="meta-text">
                  {p.cowagCode || p.supplier || "Supplier item"} · {p.unit}
                </p>
              </div>
              <p className="font-medium text-ink">{formatPrice(p.sellPrice)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
