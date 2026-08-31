"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg" | "xl";
}

const sizes = {
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "lg",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "relative flex max-h-[92vh] w-full flex-col bg-surface shadow-card-hover",
          "rounded-t-3xl sm:rounded-3xl",
          sizes[size]
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <h2 id="modal-title" className="truncate text-xl font-semibold text-ink">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost !min-h-0 shrink-0 rounded-xl !p-2.5"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          {children}
        </div>

        {footer ? (
          <footer className="shrink-0 border-t border-border bg-brand-soft/20 px-5 py-4 sm:px-7">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
