import { NextRequest, NextResponse } from "next/server";
import { role, NAKES_ROLES } from "@/src/lib/api-middleware";
import { errorResponse } from "@/src/lib/api-utils";
import { pushSyncSchema } from "@/src/server/validators";
import { SyncService } from "@/src/server/services";
import type { AuthUser } from "@/src/lib/api-middleware";

// POST /api/v1/sync/push
// Accepts a batch of child profile changes and screenings from a Nakes device.
// Children are processed first; screenings whose child was rejected in this
// batch are rejected immediately without further DB access.
export const POST = role(NAKES_ROLES, async (req: NextRequest, _ctx, authUser: AuthUser) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body permintaan tidak valid", 400);
  }

  const parsed = pushSyncSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return errorResponse(issue?.message ?? "Struktur permintaan tidak valid", 400);
  }

  const { children, screenings } = parsed.data;

  // 1. Process children first
  const childResults = await SyncService.processChildren(authUser, children);

  // 2. Build the set of child_ids that were rejected in this batch so that
  //    screenings referencing them can be rejected without hitting the DB.
  //    Only include non-empty entity_ids (shape failures produce "").
  const rejectedChildIds = new Set<string>(
    childResults
      .filter((r) => r.receipt_status === "REJECTED" && r.entity_id !== "")
      .map((r) => r.entity_id)
  );

  // 3. Process screenings
  const screeningResults = await SyncService.processScreenings(
    authUser,
    screenings,
    rejectedChildIds
  );

  return NextResponse.json(
    {
      results: {
        children: childResults,
        screenings: screeningResults,
      },
    },
    { status: 200 }
  );
});
