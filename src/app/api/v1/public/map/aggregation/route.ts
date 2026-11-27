import { NextRequest } from "next/server";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { getPublicAggregationQuerySchema } from "@/src/server/validators";
import { MapService } from "@/src/server/services";

// GET /api/v1/public/map/aggregation?level=DISTRICT
// Public endpoint — no authentication required.
// Returns aggregated screening counts per region at the specified level.
// VILLAGE is not a valid level on this endpoint.
// Only regions with total >= MIN_AGGREGATION_THRESHOLD are included.
export async function GET(req: NextRequest) {
  const rawLevel = req.nextUrl.searchParams.get("level") ?? undefined;

  const parsed = getPublicAggregationQuerySchema.safeParse({ level: rawLevel });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(issue?.message ?? "Query tidak valid", 400);
  }

  try {
    const data = await MapService.getPublicAggregation(parsed.data.level);
    return apiResponse(data, "OK", 200);
  } catch (err) {
    console.error("[GET /api/v1/public/map/aggregation]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
}
