"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      const from = searchParams.get("from") || "/admin";
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title="Admin sign in" subtitle="Enter the admin password to access internal tools." />
      <form onSubmit={handleSubmit} className="surface-card space-y-4 p-6 sm:p-7">
        <div>
          <label className="field-label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className="input-field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" disabled={submitting || !password}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-secondary">Loading…</p>}>
      <AdminLoginForm />
    </Suspense>
  );
}
