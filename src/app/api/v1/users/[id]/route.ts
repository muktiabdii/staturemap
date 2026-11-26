import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { updateNakesSchema } from "@/src/server/validators";
import { UserService, UserError } from "@/src/server/services";

// GET /api/v1/users/[id] — single NAKES account detail (Admin only)
export const GET = role(ADMIN_ROLES, async (_req: NextRequest, ctx) => {
  const params = await ctx.params;
  const id = params?.id as string;

  try {
    const account = await UserService.getNakes(id);
    return apiResponse(account);
  } catch (err) {
    if (err instanceof UserError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("[GET /api/v1/users/[id]]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});

// PATCH /api/v1/users/[id] — update mutable fields (Admin only)
export const PATCH = role(ADMIN_ROLES, async (req: NextRequest, ctx) => {
  const params = await ctx.params;
  const id = params?.id as string;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body permintaan tidak valid", 400);
  }

  const parsed = updateNakesSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  try {
    const account = await UserService.updateNakes(id, parsed.data);
    return apiResponse(account, "Akun berhasil diperbarui");
  } catch (err) {
    if (err instanceof UserError) {
      return errorResponse(err.message, err.statusCode);
    }
    console.error("[PATCH /api/v1/users/[id]]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
