import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { updateChildSchema } from "@/src/server/validators";
import { ChildService, ChildError } from "@/src/server/services";
import type { AuthUser } from "@/src/lib/api-middleware";

// GET /api/v1/admin/children/[id]
export const GET = role(ADMIN_ROLES, async (_req: NextRequest, ctx) => {
  const params = await ctx.params;
  const id = params?.id as string;

  try {
    const child = await ChildService.getAdmin(id);
    return apiResponse(child);
  } catch (err) {
    if (err instanceof ChildError) return errorResponse(err.message, err.statusCode);
    console.error("[GET /api/v1/admin/children/[id]]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});

// PATCH /api/v1/admin/children/[id]
export const PATCH = role(ADMIN_ROLES, async (req: NextRequest, ctx, authUser: AuthUser) => {
  const params = await ctx.params;
  const id = params?.id as string;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body permintaan tidak valid", 400);
  }

  const parsed = updateChildSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  try {
    const child = await ChildService.updateAdmin(id, parsed.data, authUser.id);
    return apiResponse(child, "Data anak berhasil diperbarui");
  } catch (err) {
    if (err instanceof ChildError) return errorResponse(err.message, err.statusCode);
    console.error("[PATCH /api/v1/admin/children/[id]]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
