import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { ChildService, ChildError } from "@/src/server/services";
import type { AuthUser } from "@/src/lib/api-middleware";

// POST /api/v1/admin/children/[id]/deactivate
// Soft-deactivates a child (recordStatus = INACTIVE). Idempotent.
// Existing screenings are preserved; new screenings are blocked by sync push.
export const POST = role(ADMIN_ROLES, async (_req: NextRequest, ctx, authUser: AuthUser) => {
  const params = await ctx.params;
  const id = params?.id as string;

  try {
    const child = await ChildService.deactivateAdmin(id, authUser.id);
    return apiResponse(child, "Data anak berhasil dinonaktifkan");
  } catch (err) {
    if (err instanceof ChildError) return errorResponse(err.message, err.statusCode);
    console.error("[POST /api/v1/admin/children/[id]/deactivate]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
