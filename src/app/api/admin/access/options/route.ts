import type { NextRequest } from "next/server";
import { requirePortalSession, requirePermission } from "@/lib/portal-session";
import { errorResponse } from "@/lib/security";
import { wbAuthApi } from "@/lib/wb-auth";

export async function GET(request: NextRequest) { try { const context = await requirePortalSession(request); requirePermission(context, "ACCESS_MANAGE"); const response = await wbAuthApi(`/api/v1/tenants/${context.session.tenantId}/management-options`, context.accessToken); return Response.json(await response.json()); } catch (error) { return errorResponse(error); } }
