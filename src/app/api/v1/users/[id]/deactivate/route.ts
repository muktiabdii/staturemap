import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { UserService, UserError } from "@/src/server/services";

// POST /api/v1/users/[id]/deactivate — deactivate a NAKES account (Admin only)
// Idempotent: safe to call on an already-inactive account.
export const POST = role(ADMIN_ROLES, async (_req: NextRequest, ctx) => {
  const params = await ctx.params;
  const id = params?.id as string;

  try {
    const account = await UserService.deactivateNakes(id);
    return apiResponse(account, "Akun berhasil dinonaktifkan");
  } catch (err) {
    if (err instanceof UserError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("[POST /api/v1/users/[id]/deactivate]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
