import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { paginatedResponse, errorResponse } from "@/src/lib/api-utils";
import { getAdminMapQuerySchema } from "@/src/server/validators";
import { SpatialRepository, RegionRepository } from "@/src/server/repositories";

const regionRepo = new RegionRepository();

// GET /api/v1/admin/map/screenings
// Returns paginated screening markers for Admin map (WEB-04a).
// Includes GPS coordinates (from geometry column), classification, and region info.
// Screenings not yet RESOLVED appear with resolved_region_code = null.
//
// Optional query params:
//   region_code     — filter to a region and all its descendants
//   from            — screened_at >= date (YYYY-MM-DD)
//   to              — screened_at <= date (YYYY-MM-DD)
//   location_source — GPS | MANUAL
//   page            — default 1
//   limit           — default 100, max 200
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  const url = req.nextUrl;

  const rawQuery = {
    region_code: url.searchParams.get("region_code") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    location_source: url.searchParams.get("location_source") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const parsed = getAdminMapQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  const { region_code, from, to, location_source, page, limit } = parsed.data;

  try {
    let resolvedRegionIds: string[] | undefined;
    if (region_code) {
      const ids = await regionRepo.getDescendantIds(region_code);
      if (ids.length === 0) {
        return paginatedResponse([], 0, page, limit);
      }
      resolvedRegionIds = ids;
    }

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined;

    const filters = {
      resolvedRegionIds,
      from: fromDate,
      to: toDate,
      locationSource: location_source,
    };

    const [data, total] = await Promise.all([
      SpatialRepository.getAdminMapMarkers({
        ...filters,
        limit,
        offset: (page - 1) * limit,
      }),
      SpatialRepository.countAdminMapMarkers(filters),
    ]);

    return paginatedResponse(data, total, page, limit);
  } catch (err) {
    console.error("[GET /api/v1/admin/map/screenings]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
