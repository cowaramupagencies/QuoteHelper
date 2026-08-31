"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function AdminToolbar() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") return null;

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="flex justify-end">
      <Button type="button" variant="secondary" onClick={handleLogout}>
        Sign out
      </Button>
    </div>
  );
}
