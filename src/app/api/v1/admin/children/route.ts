import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { listChildQuerySchema } from "@/src/server/validators";
import { ChildService } from "@/src/server/services";

// GET /api/v1/admin/children
// Lists children for Admin with optional filters.
// No pagination on this endpoint (deferred per checkpoint scope).
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  const url = req.nextUrl;
  const rawQuery = {
    region_code: url.searchParams.get("region_code") ?? undefined,
    record_status: url.searchParams.get("record_status") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  };

  const parsed = listChildQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  try {
    const children = await ChildService.listAdmin({
      regionCode: parsed.data.region_code,
      recordStatus: parsed.data.record_status,
      search: parsed.data.search,
    });
    return apiResponse(children);
  } catch (err) {
    console.error("[GET /api/v1/admin/children]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
