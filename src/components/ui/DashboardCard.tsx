import clsx from "clsx";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface DashboardCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  meta?: string;
  className?: string;
}

export function DashboardCard({
  href,
  icon: Icon,
  title,
  description,
  meta,
  className,
}: DashboardCardProps) {
  return (
    <Link href={href} className={clsx("surface-card-interactive block p-6 sm:p-7", className)}>
      <div className="mb-5 inline-flex rounded-2xl bg-brand-light p-3 text-brand">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
      </div>
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          {meta ? (
            <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand-dark">
              {meta}
            </span>
          ) : null}
        </div>
        <p className="text-sm leading-relaxed text-ink-secondary">{description}</p>
      </div>
    </Link>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-secondary">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
