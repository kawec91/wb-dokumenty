import type { NextRequest } from "next/server";
import { errorResponse } from "@/lib/security";
import { quickSession } from "@/lib/quick-session";

export async function GET(request: NextRequest) {
  try {
    const session = await quickSession(request);
    return Response.json({ employee: { firstName: session.employee.firstName }, entities: session.employee.entities.filter(({ entity }) => entity.isActive).map(({ entity }) => ({ id: entity.id, displayName: entity.displayName })) });
  } catch (error) { return errorResponse(error); }
}
