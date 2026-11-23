import { AdminShell } from "@/components/admin/admin-shell";
import { adminPageContext } from "@/lib/admin-page";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await adminPageContext();
  return <AdminShell email={context.membership.email} displayName={context.membership.displayName}>{children}</AdminShell>;
}
