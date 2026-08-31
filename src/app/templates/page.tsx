"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";

interface Template {
  id: string;
  name: string;
  kind: string;
  description?: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then(setTemplates);
  }, []);

  const jobTemplates = templates.filter((t) => t.kind === "job");
  const sectionTemplates = templates.filter((t) => t.kind === "section");

  return (
    <div className="space-y-10">
      <PageHeader
        title="Templates"
        subtitle="Flexible starting points for quotes and reusable sections."
      />

      <section className="space-y-4">
        <h2 className="section-title">Job templates</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {jobTemplates.map((t) => (
            <article key={t.id} className="surface-card p-6">
              <h3 className="font-semibold text-ink">{t.name}</h3>
              {t.description ? (
                <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{t.description}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {sectionTemplates.length > 0 && (
        <section className="space-y-4">
          <h2 className="section-title">Section templates</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sectionTemplates.map((t) => (
              <article key={t.id} className="surface-card p-5">
                <h3 className="font-medium text-ink">{t.name}</h3>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
