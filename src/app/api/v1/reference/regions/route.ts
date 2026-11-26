import { NextRequest } from "next/server";
import { ssoAuth } from "@/src/lib/api-middleware";
import { apiResponse, errorResponse } from "@/src/lib/api-utils";
import { RegionService } from "@/src/server/services";
import type { AuthUser } from "@/src/lib/api-middleware";

// GET /api/v1/reference/regions?version={version}
// Returns reference region data (work region + ancestors) for the authenticated Nakes.
// If the client version matches the server version, returns upToDate: true with no region list.
export const GET = ssoAuth(async (req: NextRequest, _ctx, authUser: AuthUser) => {
  if (!authUser.workRegionCode) {
    return errorResponse("Akun tidak memiliki wilayah kerja", 403);
  }

  const clientVersion = req.nextUrl.searchParams.get("version");

  try {
    const result = await RegionService.getReference(
      authUser.workRegionCode,
      clientVersion
    );

    if (result.upToDate) {
      return apiResponse({ upToDate: true }, "Data wilayah sudah terkini", 200);
    }

    return apiResponse(
      {
        upToDate: false,
        version: result.version,
        regions: result.regions,
      },
      "OK",
      200
    );
  } catch (err) {
    console.error("[GET /api/v1/reference/regions]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
