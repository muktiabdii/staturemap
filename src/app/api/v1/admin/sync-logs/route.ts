import { NextRequest } from "next/server";
import { role, ADMIN_ROLES } from "@/src/lib/api-middleware";
import { paginatedResponse, errorResponse } from "@/src/lib/api-utils";
import { getAdminSyncLogQuerySchema } from "@/src/server/validators";
import { SyncLogRepository } from "@/src/server/repositories";

const syncLogRepo = new SyncLogRepository();

// GET /api/v1/admin/sync-logs
// Returns paginated SyncLog entries for Admin monitoring (WEB-07).
// Only technical fields — no payloadHash or raw child/screening data.
//
// Optional query params:
//   entity_type          — CHILD | SCREENING
//   receipt_status       — ACCEPTED | ALREADY_RECEIVED | REJECTED | CONFLICT
//   processing_status    — NOT_REQUIRED | PENDING | PROCESSING | COMPLETED | FAILED
//   submitted_by_user_id — UUID of Nakes who submitted
//   from                 — receivedAt >= date (YYYY-MM-DD)
//   to                   — receivedAt <= date (YYYY-MM-DD)
//   page                 — default 1
//   limit                — default 20, max 100
export const GET = role(ADMIN_ROLES, async (req: NextRequest) => {
  const url = req.nextUrl;

  const rawQuery = {
    entity_type: url.searchParams.get("entity_type") ?? undefined,
    receipt_status: url.searchParams.get("receipt_status") ?? undefined,
    processing_status: url.searchParams.get("processing_status") ?? undefined,
    submitted_by_user_id: url.searchParams.get("submitted_by_user_id") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };

  const parsed = getAdminSyncLogQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      rule: issue.code,
      field: issue.path.join("."),
      message: issue.message,
    }));
    return errorResponse("Validasi gagal", 422, errors);
  }

  const {
    entity_type,
    receipt_status,
    processing_status,
    submitted_by_user_id,
    from,
    to,
    page,
    limit,
  } = parsed.data;

  try {
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : undefined;

    const { data, total } = await syncLogRepo.findManyAdmin(
      {
        entityType: entity_type,
        receiptStatus: receipt_status,
        processingStatus: processing_status,
        submittedByUserId: submitted_by_user_id,
        from: fromDate,
        to: toDate,
      },
      page,
      limit
    );

    return paginatedResponse(data, total, page, limit);
  } catch (err) {
    console.error("[GET /api/v1/admin/sync-logs]", err);
    return errorResponse("Terjadi kesalahan pada server", 500);
  }
});
