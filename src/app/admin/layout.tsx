import { AdminToolbar } from "@/components/admin/AdminToolbar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <AdminToolbar />
      {children}
    </div>
  );
}
