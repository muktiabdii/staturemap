import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { getAdminStatsQuerySchema } from "@/src/server/validators";
import { ScreeningRepository, RegionRepository } from "@/src/server/repositories";

const screeningRepo = new ScreeningRepository();
const regionRepo = new RegionRepository();

// GET /api/v1/admin/stats/summary
// Returns aggregate dashboard statistics for Admin Dinkes.
// Admin has cross-region access — no workRegionCode restriction is applied.
//
// Optional query params:
//   region_code  — filter to a region and all its descendants
//   from         — screened_at >= date (YYYY-MM-DD, inclusive)
//   to           — screened_at <= date (YYYY-MM-DD, inclusive)
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  const url = req.nextUrl;

  const rawQuery = {
    region_code: url.searchParams.get("region_code") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const parsed = getAdminStatsQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  const { region_code, from, to } = parsed.data;

  try {
    // Resolve region filter: collect all descendant region UUIDs
    let resolvedRegionIds: string[] | undefined;
    if (region_code) {
      const ids = await regionRepo.getDescendantIds(region_code);
      if (ids.length === 0) {
        // region_code provided but not found — return empty stats
        return apiResponse(
          {
            total_screenings: 0,
            resolved_screenings: 0,
            classification: {},
            total_children: 0,
            active_children: 0,
            inactive_children: 0,
          },
          "OK",
          200
        );
      }
      resolvedRegionIds = ids;
    }

    // Convert YYYY-MM-DD to start/end of day in UTC
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined;

    const stats = await screeningRepo.getAdminStats({
      resolvedRegionIds,
      from: fromDate,
      to: toDate,
    });

    return apiResponse(stats, "OK", 200);
  } catch (err) {
    console.error("[GET /api/v1/admin/stats/summary]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
