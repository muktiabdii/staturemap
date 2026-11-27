import { NextRequest, NextResponse } from "next/server";
import { role, NAKES_ROLES } from "@/src/lib/api-middleware";
import { errorResponse } from "@/src/lib/api-utils";
import { PullService } from "@/src/server/services";
import type { AuthUser } from "@/src/lib/api-middleware";

// GET /api/v1/sync/pull?cursor={cursor}
// Returns incremental child profile changes for the authenticated Nakes's work region.
// Cursor is opaque base64url; omit entirely for initial sync.
//
// 400 if cursor is provided but cannot be decoded.
// 401/403 from role() middleware.
// Response is not wrapped in apiResponse() (sync contract exception).
export const GET = role(NAKES_ROLES, async (req: NextRequest, _ctx, authUser: AuthUser) => {
  const rawCursor = req.nextUrl.searchParams.get("cursor");

  // Distinguish "no cursor" (initial sync) from "cursor present but invalid" (400)
  if (rawCursor !== null) {
    const decoded = PullService.decodeCursor(rawCursor);
    if (decoded === null) {
      return errorResponse("Cursor tidak valid", 400);
    }
  }

  try {
    const result = await PullService.pull(authUser, rawCursor ?? null);

    return NextResponse.json(
      {
        data: result.data,
        next_cursor: result.next_cursor,
        has_more: result.has_more,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[GET /api/v1/sync/pull]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
