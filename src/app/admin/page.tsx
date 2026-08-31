import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" subtitle="Internal administration tools." />
      <ul className="grid gap-4 sm:grid-cols-2">
        <li>
          <Link href="/admin/catalogue-imports" className="surface-card block p-6 hover:bg-brand-soft/20">
            <h2 className="font-semibold text-ink">Catalogue Imports</h2>
            <p className="mt-2 text-sm text-ink-secondary">
              Versioned Tencia CSV uploads with per-category activation.
            </p>
          </Link>
        </li>
      </ul>
    </div>
  );
}
