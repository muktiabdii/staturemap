import crypto from "crypto";
import {
  ChildRepository,
  RegionRepository,
  ScreeningRepository,
  SyncLogRepository,
} from "@/src/server/repositories";
import { hashPayload } from "@/src/lib/utils";
import { pushChildSchema, pushScreeningSchema } from "@/src/server/validators";
import { regionResolutionQueue } from "@/src/server/queues/region-resolution.queue";
import type { AuthUser } from "@/src/lib/api-middleware";
import type { Gender } from "@/src/generated/prisma/client";

const childRepo = new ChildRepository();
const regionRepo = new RegionRepository();
const screeningRepo = new ScreeningRepository();
const syncLogRepo = new SyncLogRepository();

// ─── Result shapes ────────────────────────────────────────────────────────────

export type ChildItemResult = {
  entity_id: string;
  change_id: string;
  receipt_status: "ACCEPTED" | "ALREADY_RECEIVED" | "CONFLICT" | "REJECTED";
  processing_status: "NOT_REQUIRED";
  error_code: string | null;
  error_message: string | null;
};

export type ScreeningItemResult = {
  entity_id: string;
  receipt_status: "ACCEPTED" | "ALREADY_RECEIVED" | "CONFLICT" | "REJECTED";
  processing_status: "NOT_REQUIRED" | "PENDING" | "FAILED";
  error_code: string | null;
  error_message: string | null;
};

// ─── SyncService ─────────────────────────────────────────────────────────────

export class SyncService {
  /**
   * Processes a batch of child profiles. Items are independent — one failure
   * does not block others. Returns one result per item, in submission order.
   * Writes a SyncLog for every item regardless of outcome.
   */
  static async processChildren(
    authUser: AuthUser,
    rawItems: unknown[]
  ): Promise<ChildItemResult[]> {
    const workRegion = authUser.workRegionCode
      ? await regionRepo.findByCode(authUser.workRegionCode)
      : null;

    return Promise.all(
      rawItems.map((raw) => SyncService.processOneChild(authUser, workRegion, raw))
    );
  }

  /**
   * Processes a batch of screenings. Items are independent. Children rejected
   * in this same push batch (tracked via rejectedChildIds) cause their screenings
   * to be rejected immediately. Writes a SyncLog for every item.
   * GPS screenings are enqueued after the DB transaction commits.
   *
   * @param rejectedChildIds  child_ids rejected during child processing in this batch
   */
  static async processScreenings(
    authUser: AuthUser,
    rawItems: unknown[],
    rejectedChildIds: Set<string>
  ): Promise<ScreeningItemResult[]> {
    const workRegion = authUser.workRegionCode
      ? await regionRepo.findByCode(authUser.workRegionCode)
      : null;

    return Promise.all(
      rawItems.map((raw) =>
        SyncService.processOneScreening(authUser, workRegion, rejectedChildIds, raw)
      )
    );
  }

  // ─── Child ────────────────────────────────────────────────────────────────

  private static async processOneChild(
    authUser: AuthUser,
    workRegion: { id: string; regionCode: string } | null,
    raw: unknown
  ): Promise<ChildItemResult> {
    // 1. Shape validation
    const parsed = pushChildSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const result = SyncService.childResult(
        typeof (raw as Record<string, unknown>)?.child_id === "string"
          ? ((raw as Record<string, unknown>).child_id as string)
          : "",
        typeof (raw as Record<string, unknown>)?.change_id === "string"
          ? ((raw as Record<string, unknown>).change_id as string)
          : "",
        "REJECTED",
        "VALIDATION_ERROR",
        issue?.message ?? "Validasi gagal"
      );
      await SyncService.writeChildLog(authUser.id, result, null);
      return result;
    }

    const item = parsed.data;

    // 2. Work region guard
    if (!workRegion) {
      const result = SyncService.childResult(
        item.child_id,
        item.change_id,
        "REJECTED",
        "WORK_REGION_NOT_FOUND",
        "Wilayah kerja Nakes tidak ditemukan"
      );
      await SyncService.writeChildLog(authUser.id, result, null);
      return result;
    }

    // 3. Canonical payload hash (excludes change_id)
    const canonicalPayload: Record<string, unknown> = {
      child_id: item.child_id,
      name: item.name,
      date_of_birth: item.date_of_birth,
      gender: item.gender,
      address: item.address,
    };
    const payloadHash = hashPayload(canonicalPayload);

    // 4. Apply change (idempotency + upsert in one transaction)
    let result: ChildItemResult;
    try {
      const applyResult = await childRepo.applyChange({
        changeId: item.change_id,
        childId: item.child_id,
        submittedByUserId: authUser.id,
        assignedRegionId: workRegion.id,
        payloadHash,
        data: {
          name: item.name,
          dateOfBirth: new Date(item.date_of_birth),
          gender: item.gender as Gender,
          address: item.address,
        },
      });
      result = SyncService.childResult(item.child_id, item.change_id, applyResult.status, null, null);
    } catch {
      result = SyncService.childResult(
        item.child_id,
        item.change_id,
        "REJECTED",
        "SERVER_ERROR",
        "Terjadi kesalahan saat memproses profil"
      );
    }

    // 5. Write SyncLog after apply completes
    await SyncService.writeChildLog(authUser.id, result, payloadHash);
    return result;
  }

  // ─── Screening ────────────────────────────────────────────────────────────

  private static async processOneScreening(
    authUser: AuthUser,
    workRegion: { id: string; regionCode: string } | null,
    rejectedChildIds: Set<string>,
    raw: unknown
  ): Promise<ScreeningItemResult> {
    // 1. Shape validation
    const parsed = pushScreeningSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const result = SyncService.screeningResult(
        typeof (raw as Record<string, unknown>)?.screening_id === "string"
          ? ((raw as Record<string, unknown>).screening_id as string)
          : "",
        "REJECTED",
        "NOT_REQUIRED",
        "VALIDATION_ERROR",
        issue?.message ?? "Validasi gagal"
      );
      await SyncService.writeScreeningLog(authUser.id, result, null, null);
      return result;
    }

    const item = parsed.data;

    // 2. Canonical payload hash (excludes screening_id)
    const canonicalPayload: Record<string, unknown> = {
      child_id: item.child_id,
      age_months: item.age_months,
      gender: item.gender,
      height_cm: item.height_cm,
      classification: item.classification,
      screened_at: item.screened_at,
      location_source: item.location_source,
      ...(item.location_source === "GPS" && item.location
        ? { latitude: item.location.latitude, longitude: item.location.longitude }
        : {}),
      ...(item.location_source === "MANUAL"
        ? { manual_region_code: item.manual_region_code }
        : {}),
    };
    const payloadHash = hashPayload(canonicalPayload);

    // 3. Idempotency check before any DB write
    const idempotencyRecord = await screeningRepo.findIdempotencyRecord(item.screening_id);
    if (idempotencyRecord) {
      const hashMatches = idempotencyRecord.payloadHash === payloadHash;

      // GPS retry path: same hash, previous enqueue failed — attempt re-enqueue
      if (
        hashMatches &&
        idempotencyRecord.processingStatus === "FAILED" &&
        item.location_source === "GPS"
      ) {
        const retryData = await screeningRepo.findGpsForRetry(item.screening_id);
        if (retryData) {
          return SyncService.retryEnqueueGps(
            item.screening_id,
            retryData.syncLogId,
            item.location!.latitude,
            item.location!.longitude
          );
        }
      }

      // Standard duplicate handling
      const receiptStatus = hashMatches ? "ALREADY_RECEIVED" as const : "CONFLICT" as const;
      const result = SyncService.screeningResult(
        item.screening_id,
        receiptStatus,
        hashMatches
          ? (idempotencyRecord.processingStatus as ScreeningItemResult["processing_status"])
          : "NOT_REQUIRED",
        null,
        null
      );
      await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
      return result;
    }

    // 4. Reject if child was rejected in this batch
    if (rejectedChildIds.has(item.child_id)) {
      const result = SyncService.screeningResult(
        item.screening_id,
        "REJECTED",
        "NOT_REQUIRED",
        "CHILD_NOT_FOUND",
        "Child profile ditolak dalam batch ini"
      );
      await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
      return result;
    }

    // 5. Child existence and status check
    const child = await childRepo.findChildForValidation(item.child_id);
    if (!child) {
      const result = SyncService.screeningResult(
        item.screening_id,
        "REJECTED",
        "NOT_REQUIRED",
        "CHILD_NOT_FOUND",
        "Child tidak ditemukan"
      );
      await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
      return result;
    }
    if (child.recordStatus === "INACTIVE") {
      const result = SyncService.screeningResult(
        item.screening_id,
        "REJECTED",
        "NOT_REQUIRED",
        "CHILD_INACTIVE",
        "Child tidak aktif"
      );
      await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
      return result;
    }

    // 6. MANUAL: validate region
    let manualRegionId: string | undefined;
    if (item.location_source === "MANUAL") {
      if (!workRegion) {
        const result = SyncService.screeningResult(
          item.screening_id,
          "REJECTED",
          "NOT_REQUIRED",
          "WORK_REGION_NOT_FOUND",
          "Wilayah kerja Nakes tidak ditemukan"
        );
        await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
        return result;
      }

      const region = await regionRepo.findByCode(item.manual_region_code!);
      if (!region || region.regionLevel !== "VILLAGE" || region.regionCode !== workRegion.regionCode) {
        const result = SyncService.screeningResult(
          item.screening_id,
          "REJECTED",
          "NOT_REQUIRED",
          "MANUAL_REGION_MISMATCH",
          !region
            ? "Kode wilayah manual tidak ditemukan"
            : region.regionLevel !== "VILLAGE"
              ? "Wilayah manual harus berlevel VILLAGE"
              : "Wilayah manual tidak sesuai wilayah kerja Nakes"
        );
        await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
        return result;
      }

      manualRegionId = region.id;
    }

    // 7. Insert screening + SyncLog atomically
    const syncLogId = crypto.randomUUID();
    const initialProcessingStatus: "NOT_REQUIRED" | "PENDING" =
      item.location_source === "GPS" ? "PENDING" : "NOT_REQUIRED";

    let insertResult;
    try {
      const insertInput = item.location_source === "MANUAL"
        ? {
            screeningId: item.screening_id,
            childId: item.child_id,
            createdByUserId: authUser.id,
            ageMonths: item.age_months,
            gender: item.gender,
            heightCm: item.height_cm,
            classification: item.classification,
            screenedAt: new Date(item.screened_at),
            locationSource: "MANUAL" as const,
            manualRegionId: manualRegionId!,
            resolvedRegionId: manualRegionId!,
          }
        : {
            screeningId: item.screening_id,
            childId: item.child_id,
            createdByUserId: authUser.id,
            ageMonths: item.age_months,
            gender: item.gender,
            heightCm: item.height_cm,
            classification: item.classification,
            screenedAt: new Date(item.screened_at),
            locationSource: "GPS" as const,
            latitude: item.location!.latitude,
            longitude: item.location!.longitude,
          };

      insertResult = await screeningRepo.insertScreening(insertInput, {
        syncLogId,
        submittedByUserId: authUser.id,
        payloadHash,
        processingStatus: initialProcessingStatus,
      });
    } catch {
      const result = SyncService.screeningResult(
        item.screening_id,
        "REJECTED",
        "NOT_REQUIRED",
        "SERVER_ERROR",
        "Terjadi kesalahan saat menyimpan screening"
      );
      await SyncService.writeScreeningLog(authUser.id, result, payloadHash, item.child_id);
      return result;
    }

    // Handle race-condition duplicate from insertScreening
    if (insertResult.status === "ALREADY_RECEIVED") {
      return SyncService.screeningResult(
        item.screening_id,
        "ALREADY_RECEIVED",
        insertResult.processingStatus as ScreeningItemResult["processing_status"],
        null,
        null
      );
    }
    if (insertResult.status === "CONFLICT") {
      return SyncService.screeningResult(
        item.screening_id,
        "CONFLICT",
        "NOT_REQUIRED",
        null,
        null
      );
    }

    // 8. GPS: enqueue after commit — SyncLog already written atomically above
    if (item.location_source === "GPS") {
      return SyncService.enqueueGps(
        item.screening_id,
        syncLogId,
        item.location!.latitude,
        item.location!.longitude
      );
    }

    // MANUAL: fully resolved, no enqueue needed
    return SyncService.screeningResult(
      item.screening_id,
      "ACCEPTED",
      "NOT_REQUIRED",
      null,
      null
    );
  }

  // ─── GPS enqueue ─────────────────────────────────────────────────────────

  private static async enqueueGps(
    screeningId: string,
    syncLogId: string,
    latitude: number,
    longitude: number
  ): Promise<ScreeningItemResult> {
    try {
      // Deterministic jobId prevents duplicate queue entries if two requests
      // race to enqueue the same screening — BullMQ silently drops the second.
      await regionResolutionQueue.add(
        "resolve",
        { screeningId, syncLogId, latitude, longitude },
        { jobId: `gps-${screeningId}` }
      );
      return SyncService.screeningResult(screeningId, "ACCEPTED", "PENDING", null, null);
    } catch {
      await SyncService.handleEnqueueFailure(screeningId, syncLogId);
      return SyncService.screeningResult(
        screeningId, "ACCEPTED", "FAILED", "QUEUE_ENQUEUE_FAILED", null
      );
    }
  }

  /**
   * Re-enqueues a GPS screening that previously had a failed enqueue.
   * Uses the original syncLogId so the worker updates the correct SyncLog row.
   *
   * Before adding, checks whether a job with the same deterministic jobId still
   * exists in Redis in a completed or failed state — if so, removes it first.
   * This is necessary because BullMQ treats an existing jobIdKey (even for
   * finished jobs) as a duplicate and silently skips the add, meaning the retry
   * would never actually be processed.
   *
   * Jobs in waiting or active state are left untouched — they will be processed
   * by the worker without needing a re-add.
   *
   * Does NOT insert a new Screening row.
   */
  private static async retryEnqueueGps(
    screeningId: string,
    syncLogId: string,
    latitude: number,
    longitude: number
  ): Promise<ScreeningItemResult> {
    const deterministicJobId = `gps-${screeningId}`;

    try {
      // If a finished (completed or failed) job still occupies this jobId in
      // Redis, remove it so the new add is not silently dropped as a duplicate.
      const existingJob = await regionResolutionQueue.getJob(deterministicJobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === "completed" || state === "failed") {
          await existingJob.remove();
        } else if (state === "active" || state === "waiting" || state === "delayed") {
          // A live job already exists — it will be processed, treat as PENDING
          return SyncService.screeningResult(screeningId, "ACCEPTED", "PENDING", null, null);
        }
        // "unknown" state means the key is gone — safe to proceed
      }

      await regionResolutionQueue.add(
        "resolve",
        { screeningId, syncLogId, latitude, longitude },
        { jobId: deterministicJobId }
      );

      // Reset SyncLog from FAILED to PENDING
      await syncLogRepo.updateProcessingStatus(syncLogId, "PENDING", null);

      // Reset region_resolution_status on the screening row (best-effort)
      try {
        const { prisma } = await import("@/src/lib/prisma");
        await prisma.$executeRaw`
          UPDATE screenings
          SET region_resolution_status = 'PENDING'::"region_resolution_status"
          WHERE screening_id = ${screeningId}::uuid
        `;
      } catch {
        // Best-effort: SyncLog already updated, worker will handle resolution
      }

      return SyncService.screeningResult(screeningId, "ACCEPTED", "PENDING", null, null);
    } catch {
      // Retry failed — keep existing FAILED status, do not create a new SyncLog
      return SyncService.screeningResult(
        screeningId, "ACCEPTED", "FAILED", "QUEUE_ENQUEUE_FAILED", null
      );
    }
  }

  private static async handleEnqueueFailure(
    screeningId: string,
    syncLogId: string
  ): Promise<void> {
    // Update regionResolutionStatus on the screening row to FAILED
    try {
      const { prisma } = await import("@/src/lib/prisma");
      await prisma.$executeRaw`
        UPDATE screenings
        SET region_resolution_status = 'FAILED'::"region_resolution_status"
        WHERE screening_id = ${screeningId}::uuid
      `;
    } catch {
      // Best-effort — log update below is more important for idempotency
    }

    // Update the SyncLog row to reflect FAILED processing
    try {
      await syncLogRepo.updateProcessingStatus(syncLogId, "FAILED", "QUEUE_ENQUEUE_FAILED");
    } catch {
      // Best-effort
    }
  }

  // ─── SyncLog writers ─────────────────────────────────────────────────────

  /** Writes a SyncLog row for a child profile result. Fire-and-forget on failure. */
  private static async writeChildLog(
    submittedByUserId: string,
    result: ChildItemResult,
    payloadHash: string | null
  ): Promise<void> {
    try {
      await syncLogRepo.createLog({
        syncLogId: crypto.randomUUID(),
        submittedByUserId,
        entityType: "CHILD",
        requestEntityId: result.entity_id || result.change_id,
        changeId: result.change_id || null,
        payloadHash,
        childId: result.entity_id || null,
        receiptStatus: result.receipt_status,
        processingStatus: result.processing_status,
        errorCode: result.error_code,
        errorMessage: result.error_message,
      });
    } catch {
      // SyncLog write failure must not alter the already-applied child change
    }
  }

  /**
   * Writes a SyncLog row for a screening result.
   * Not called for INSERTED screenings — their log is written atomically in
   * the repository transaction. Called only for non-insert outcomes (REJECTED,
   * CONFLICT, ALREADY_RECEIVED from pre-insert idempotency check).
   */
  private static async writeScreeningLog(
    submittedByUserId: string,
    result: ScreeningItemResult,
    payloadHash: string | null,
    childId: string | null
  ): Promise<void> {
    try {
      await syncLogRepo.createLog({
        syncLogId: crypto.randomUUID(),
        submittedByUserId,
        entityType: "SCREENING",
        requestEntityId: result.entity_id,
        payloadHash,
        screeningId: result.receipt_status !== "REJECTED" ? result.entity_id : null,
        childId,
        receiptStatus: result.receipt_status,
        processingStatus: result.processing_status,
        errorCode: result.error_code,
        errorMessage: result.error_message,
      });
    } catch {
      // SyncLog write failure must not change the screening result
    }
  }

  // ─── Result builders ─────────────────────────────────────────────────────

  private static childResult(
    entityId: string,
    changeId: string,
    receiptStatus: ChildItemResult["receipt_status"],
    errorCode: string | null,
    errorMessage: string | null
  ): ChildItemResult {
    return {
      entity_id: entityId,
      change_id: changeId,
      receipt_status: receiptStatus,
      processing_status: "NOT_REQUIRED",
      error_code: errorCode,
      error_message: errorMessage,
    };
  }

  private static screeningResult(
    entityId: string,
    receiptStatus: ScreeningItemResult["receipt_status"],
    processingStatus: ScreeningItemResult["processing_status"],
    errorCode: string | null,
    errorMessage: string | null
  ): ScreeningItemResult {
    return {
      entity_id: entityId,
      receipt_status: receiptStatus,
      processing_status: processingStatus,
      error_code: errorCode,
      error_message: errorMessage,
    };
  }
}
