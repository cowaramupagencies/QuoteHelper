"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerPricingMode, QuoteOption } from "@/types";
import {
  BLANK_TEMPLATE_ID,
  STEEL_TANK_TEMPLATE_ID,
} from "@/lib/templates/steel-tank-install";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

interface JobTemplate {
  id: string;
  name: string;
  kind: string;
  description?: string;
  createdAt: string;
  payload: {
    options?: QuoteOption[];
    customerPricingMode?: CustomerPricingMode;
  };
}

const BUILTIN_TEMPLATE_ORDER = [STEEL_TANK_TEMPLATE_ID, BLANK_TEMPLATE_ID];

function sortJobTemplates(templates: JobTemplate[]): JobTemplate[] {
  return [...templates].sort((a, b) => {
    const aIdx = BUILTIN_TEMPLATE_ORDER.indexOf(a.id);
    const bIdx = BUILTIN_TEMPLATE_ORDER.indexOf(b.id);
    if (aIdx !== -1 || bIdx !== -1) {
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    }
    return a.name.localeCompare(b.name, "en-AU");
  });
}

function formatSavedTemplateDate(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatJobTemplateLabel(template: JobTemplate): string {
  if (BUILTIN_TEMPLATE_ORDER.includes(template.id)) {
    return template.name;
  }
  return `${template.name} — saved ${formatSavedTemplateDate(template.createdAt)}`;
}

export default function NewQuotePage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    quoteNumber: "",
    templateId: STEEL_TANK_TEMPLATE_ID,
  });

  useEffect(() => {
    fetch("/api/templates?kind=job")
      .then((r) => r.json())
      .then((list: JobTemplate[]) => setTemplates(sortJobTemplates(list)));
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === form.templateId),
    [templates, form.templateId]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const template =
        selectedTemplate ??
        (await fetch("/api/templates?kind=job").then((r) => r.json()) as JobTemplate[]).find(
          (t) => t.id === form.templateId
        );

      const sourceOptions = template?.payload?.options ?? [];
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteNumber: form.quoteNumber || undefined,
          customer: { name: form.customerName },
          templateId: template?.id,
          templateName: template?.name,
          customerPricingMode: template?.payload?.customerPricingMode ?? "itemised",
          options: sourceOptions,
        }),
      });
      const quote = await res.json();
      router.push(`/quotes/${quote.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader
        title="New Quote"
        subtitle="Enter customer details and choose a starting template."
      />

      <form onSubmit={handleCreate} className="surface-card space-y-5 p-6 sm:p-7">
        <div>
          <label className="field-label">Customer name</label>
          <input
            className="input-field"
            value={form.customerName}
            onChange={(e) => setForm({ ...form, customerName: e.target.value })}
            placeholder="Craig Lawson"
            required
          />
        </div>
        <div>
          <label className="field-label">Quote number (optional)</label>
          <input
            className="input-field"
            value={form.quoteNumber}
            onChange={(e) => setForm({ ...form, quoteNumber: e.target.value })}
            placeholder="Auto-generated if blank"
          />
        </div>
        <div>
          <label className="field-label">Job template</label>
          <select
            className="input-field"
            value={form.templateId}
            onChange={(e) => setForm({ ...form, templateId: e.target.value })}
            disabled={templates.length === 0}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {formatJobTemplateLabel(template)}
              </option>
            ))}
          </select>
          {selectedTemplate?.description ? (
            <p className="mt-2 text-sm text-ink-secondary">{selectedTemplate.description}</p>
          ) : null}
        </div>
        <Button type="submit" disabled={loading || templates.length === 0} className="w-full">
          {loading ? "Creating…" : "Create Quote"}
        </Button>
      </form>
    </div>
  );
}
