import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { PermissionCode } from "@prisma/client";
import { PORTAL_COOKIE, portalContext, requirePermission } from "@/lib/portal-session";

export async function adminPageContext(permission?: PermissionCode, entityId?: string) {
  const token = (await cookies()).get(PORTAL_COOKIE)?.value; if (!token) redirect("/api/auth/login?returnTo=/admin");
  try { const context = await portalContext(token); if (permission) requirePermission(context, permission, entityId); return context; }
  catch { redirect("/api/auth/login?returnTo=/admin"); }
}
