import Link from "next/link";
import { Plus } from "lucide-react";
import { listQuotes } from "@/lib/db/repository";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/DashboardCard";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default function QuotesPage() {
  const quotes = listQuotes(50);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Quotes"
        subtitle="Drafts and recent customer quotations."
        action={
          <ButtonLink href="/quotes/new" className="w-full sm:w-auto">
            <Plus className="h-5 w-5" />
            New Quote
          </ButtonLink>
        }
      />

      <section className="surface-card overflow-hidden">
        {quotes.length === 0 ? (
          <EmptyState
            title="No quotes yet"
            description="Create a new quote to get started."
            action={
              <ButtonLink href="/quotes/new">
                <Plus className="h-5 w-5" />
                New Quote
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
                  <div>
                    <p className="font-medium text-ink">{quote.customer.name || "Untitled customer"}</p>
                    <p className="meta-text mt-1">
                      #{quote.quoteNumber} · {quote.status} · {quote.templateName ?? "Custom"}
                    </p>
                  </div>
                  <p className="meta-text">
                    {new Date(quote.updatedAt).toLocaleDateString("en-AU")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
