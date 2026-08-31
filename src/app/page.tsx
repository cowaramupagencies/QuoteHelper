import Link from "next/link";
import { BookOpen, ClipboardList, Package, Plus, Tags } from "lucide-react";
import { listQuotes, countProducts } from "@/lib/db/repository";
import { ButtonLink } from "@/components/ui/Button";
import { DashboardCard, EmptyState } from "@/components/ui/DashboardCard";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const quotes = listQuotes(10);
  const productCount = countProducts();
  const draftCount = quotes.filter((q) => q.status === "draft").length;

  return (
    <div className="space-y-10 lg:space-y-12">
      <PageHeader
        title="CowAg Quote Helper"
        subtitle="Create quotes faster, without fighting Excel."
        action={
          <ButtonLink href="/quotes/new" className="w-full sm:w-auto">
            <Plus className="h-5 w-5" strokeWidth={2} />
            New Quote
          </ButtonLink>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <DashboardCard
          href="/quotes"
          icon={ClipboardList}
          title="Recent Quotes"
          description="Continue drafts and recent customer quotes."
          meta={quotes.length > 0 ? `${quotes.length} quote${quotes.length === 1 ? "" : "s"}` : "None yet"}
        />
        <DashboardCard
          href="/templates"
          icon={BookOpen}
          title="Templates"
          description="Start from Steel Tank Install or a saved template."
        />
        <DashboardCard
          href="/catalogue"
          icon={Package}
          title="Product Catalogue"
          description="Search CowAg products and saved supplier items."
          meta={productCount > 0 ? `${productCount.toLocaleString()} items` : undefined}
        />
        <DashboardCard
          href="/price-lists"
          icon={Tags}
          title="Price Lists"
          description="Import and update product pricing."
        />
      </section>

      <section id="recent-quotes" className="surface-card overflow-hidden">
        <div className="border-b border-border px-6 py-5 sm:px-7">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="section-title">Recent quotes & drafts</h2>
            {draftCount > 0 ? (
              <span className="meta-text">{draftCount} draft{draftCount === 1 ? "" : "s"}</span>
            ) : null}
          </div>
        </div>

        {quotes.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Start with a Steel Tank Install template or a blank quote — your first one takes just a minute."
            action={
              <ButtonLink href="/quotes/new">
                <Plus className="h-5 w-5" />
                Create your first quote
              </ButtonLink>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Link
                  href={`/quotes/${quote.id}`}
                  className="flex flex-col gap-2 px-6 py-5 transition-colors hover:bg-brand-soft/40 sm:flex-row sm:items-center sm:justify-between sm:px-7"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {quote.customer.name || "Untitled customer"}
                    </p>
                    <p className="meta-text mt-1">
                      #{quote.quoteNumber} · {quote.templateName ?? "Custom"} ·{" "}
                      {quote.options.length} option{quote.options.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="meta-text shrink-0">
                    {new Date(quote.updatedAt).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
