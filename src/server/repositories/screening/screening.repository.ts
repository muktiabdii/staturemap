import { BaseRepository } from "@/src/server/repositories/base.repository";
import { prisma } from "@/src/lib/prisma";
import { isUniqueViolation } from "@/src/lib/utils";
import type { Screening } from "@/src/generated/prisma/client";

// Result row of the RESOLVED screening count grouped by village + classification
export type AggregationRow = {
  resolvedRegionId: string;
  classification: string;
  count: number;
};

// Admin stats filters
export type AdminStatsFilter = {
  resolvedRegionIds?: string[];  // pre-computed descendant IDs from region filter
  from?: Date;
  to?: Date;
};

// Admin stats result
export type AdminStatsResult = {
  total_screenings: number;
  resolved_screenings: number;
  classification: Record<string, number>;
  total_children: number;
  active_children: number;
  inactive_children: number;
};

// Idempotency check result — based on the first ACCEPTED/ALREADY_RECEIVED SyncLog
export type ScreeningIdempotencyRecord = {
  payloadHash: string;
  receiptStatus: string;
  processingStatus: string;
  syncLogId: string;
};

// Data needed to retry a failed GPS enqueue
export type GpsRetryData = {
  syncLogId: string;
  latitude: number;
  longitude: number;
};

export type InsertScreeningInput = {
  screeningId: string;
  childId: string;
  createdByUserId: string;
  ageMonths: number;
  gender: string;
  heightCm: number;
  classification: string;
  screenedAt: Date;
} & (
  | { locationSource: "MANUAL"; manualRegionId: string; resolvedRegionId: string }
  | { locationSource: "GPS"; latitude: number; longitude: number }
);

// Inline SyncLog data written atomically with the Screening row
export type ScreeningSyncLogData = {
  syncLogId: string;
  submittedByUserId: string;
  payloadHash: string;
  processingStatus: "NOT_REQUIRED" | "PENDING";
};

export type InsertScreeningResult =
  | { status: "INSERTED" }
  | { status: "ALREADY_RECEIVED"; processingStatus: string }
  | { status: "CONFLICT" };

export class ScreeningRepository extends BaseRepository<Screening> {
  protected modelName = "screening";

  /**
   * Returns RESOLVED screening counts grouped by resolved_region_id and
   * classification. Only VILLAGE-level regions are used as the grouping key
   * because resolvedRegionId always points to a VILLAGE (GPS resolution and
   * MANUAL both resolve to VILLAGE level per domain-rules §5).
   *
   * Server-side rollup to higher levels is done by MapService using the
   * region tree; this method only reads raw VILLAGE-level counts.
   */
  async getAggregationByVillage(): Promise<AggregationRow[]> {
    const groups = await prisma.screening.groupBy({
      by: ["resolvedRegionId", "classification"],
      where: {
        regionResolutionStatus: "RESOLVED",
        resolvedRegionId: { not: null },
      },
      _count: { screeningId: true },
    });

    return groups
      .filter((g) => g.resolvedRegionId !== null)
      .map((g) => ({
        resolvedRegionId: g.resolvedRegionId!,
        classification: g.classification,
        count: g._count.screeningId,
      }));
  }

  /**
   * Returns aggregate statistics for Admin dashboard.
   *
   * - total_screenings: all screenings regardless of resolution status.
   * - resolved_screenings: only RESOLVED (the ones that count for maps).
   * - classification: distribution over RESOLVED screenings only.
   * - total/active/inactive children: counts from the children table.
   *
   * Filters (all optional):
   * - resolvedRegionIds: pre-computed set of region UUIDs; filters by
   *   resolvedRegionId IN (...) for resolved stats, and assignedRegionId IN (...)
   *   for child stats.
   * - from / to: screened_at range filter, applied to all screening counts.
   *
   * Child counts use assignedRegionId which is set to the Nakes's work region
   * at the time of creation — this is the best available regional association
   * for children (there is no "region filter" on the child itself).
   */
  async getAdminStats(filter: AdminStatsFilter): Promise<AdminStatsResult> {
    const dateWhere = {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    };
    const hasDateFilter = Object.keys(dateWhere).length > 0;
    const hasRegionFilter = filter.resolvedRegionIds && filter.resolvedRegionIds.length > 0;

    // Screening where clause — base (for total_screenings)
    const baseScreeningWhere: Record<string, unknown> = {};
    if (hasDateFilter) baseScreeningWhere.screenedAt = dateWhere;

    // Resolved screening where clause — adds RESOLVED + region filter
    const resolvedScreeningWhere: Record<string, unknown> = {
      ...baseScreeningWhere,
      regionResolutionStatus: "RESOLVED",
    };
    if (hasRegionFilter) {
      resolvedScreeningWhere.resolvedRegionId = { in: filter.resolvedRegionIds };
    }

    // For total_screenings with region filter: filter by resolvedRegionId too
    // (unresolved screenings in that region are still counted in total)
    // — but region-unresolved screenings have no region to filter on.
    // Decision: total_screenings with region filter only counts screenings that
    // have been resolved to that region (consistent with resolved_screenings).
    const totalScreeningWhere = hasRegionFilter ? resolvedScreeningWhere : baseScreeningWhere;

    // Child where clause
    const childWhere: Record<string, unknown> = {};
    if (hasRegionFilter) {
      childWhere.assignedRegionId = { in: filter.resolvedRegionIds };
    }

    // Run all queries in parallel
    const [
      totalScreenings,
      classificationGroups,
      totalChildren,
      activeChildren,
    ] = await Promise.all([
      prisma.screening.count({ where: totalScreeningWhere }),
      prisma.screening.groupBy({
        by: ["classification"],
        where: resolvedScreeningWhere,
        _count: { screeningId: true },
      }),
      prisma.child.count({ where: childWhere }),
      prisma.child.count({ where: { ...childWhere, recordStatus: "ACTIVE" } }),
    ]);

    // resolved_screenings is the sum of groupBy counts (same where)
    const resolvedScreenings = classificationGroups.reduce(
      (sum, g) => sum + g._count.screeningId,
      0
    );

    const classification: Record<string, number> = {};
    for (const g of classificationGroups) {
      classification[g.classification] = g._count.screeningId;
    }

    return {
      total_screenings: totalScreenings,
      resolved_screenings: resolvedScreenings,
      classification,
      total_children: totalChildren,
      active_children: activeChildren,
      inactive_children: totalChildren - activeChildren,
    };
  }

  /**
   * Looks up idempotency data for a screeningId by finding the first SyncLog
   * that was accepted for this entity (receiptStatus ACCEPTED or ALREADY_RECEIVED).
   * Returns null when no prior accepted submission exists.
   */
  async findIdempotencyRecord(
    screeningId: string
  ): Promise<ScreeningIdempotencyRecord | null> {
    const log = await prisma.syncLog.findFirst({
      where: {
        entityType: "SCREENING",
        requestEntityId: screeningId,
        receiptStatus: { in: ["ACCEPTED", "ALREADY_RECEIVED"] },
      },
      select: { payloadHash: true, receiptStatus: true, processingStatus: true, syncLogId: true },
      orderBy: { receivedAt: "asc" },
    });

    if (!log || log.payloadHash === null) return null;
    return {
      payloadHash: log.payloadHash,
      receiptStatus: log.receiptStatus,
      processingStatus: log.processingStatus,
      syncLogId: log.syncLogId,
    };
  }

  /**
   * Checks whether an existing screening is GPS-sourced and had a failed enqueue,
   * returning the syncLogId of the FAILED SyncLog so the caller can retry enqueue.
   * Returns null if the screening is not GPS, or if no FAILED SyncLog exists.
   *
   * The GPS coordinates are NOT re-read from the DB here — the caller supplies them
   * from the validated payload (same hash confirmed before this call).
   */
  async findGpsForRetry(screeningId: string): Promise<{ syncLogId: string } | null> {

    // Confirm the screening row exists and is GPS-sourced
    const screening = await this.model.findUnique({
      where: { screeningId },
      select: { locationSource: true },
    }) as { locationSource: string } | null;

    if (!screening || screening.locationSource !== "GPS") return null;

    // Find the most recent FAILED SyncLog for this screening
    const failedLog = await prisma.syncLog.findFirst({
      where: {
        entityType: "SCREENING",
        requestEntityId: screeningId,
        processingStatus: "FAILED",
        errorCode: "QUEUE_ENQUEUE_FAILED",
      },
      select: { syncLogId: true },
      orderBy: { receivedAt: "desc" },
    });

    if (!failedLog) return null;
    return { syncLogId: failedLog.syncLogId };
  }

  /**
   * Inserts a Screening row and its initial SyncLog atomically in one transaction.
   *
   * - MANUAL: uses Prisma client create; sets resolvedRegionId and RESOLVED status.
   * - GPS: uses $executeRaw to write the geometry(Point) column; sets PENDING status.
   *
   * On P2002 (duplicate PK), looks up the existing SyncLog to determine
   * ALREADY_RECEIVED vs CONFLICT — lookup runs outside the failed transaction.
   */
  async insertScreening(
    input: InsertScreeningInput,
    logData: ScreeningSyncLogData
  ): Promise<InsertScreeningResult> {
    const { syncLogId, submittedByUserId, payloadHash, processingStatus } = logData;

    try {
      if (input.locationSource === "MANUAL") {
        await prisma.$transaction(async (tx) => {
          await tx.screening.create({
            data: {
              screeningId: input.screeningId,
              childId: input.childId,
              createdByUserId: input.createdByUserId,
              ageMonths: input.ageMonths,
              gender: input.gender as "MALE" | "FEMALE",
              heightCm: input.heightCm,
              classification: input.classification as
                | "SEVERELY_STUNTED"
                | "STUNTED"
                | "NORMAL"
                | "TALL",
              screenedAt: input.screenedAt,
              locationSource: "MANUAL",
              manualRegionId: input.manualRegionId,
              resolvedRegionId: input.resolvedRegionId,
              regionResolutionStatus: "RESOLVED",
            },
          });

          await tx.syncLog.create({
            data: {
              syncLogId,
              submittedByUserId,
              entityType: "SCREENING",
              requestEntityId: input.screeningId,
              payloadHash,
              screeningId: input.screeningId,
              childId: input.childId,
              receiptStatus: "ACCEPTED",
              processingStatus,
            },
          });
        });
      } else {

        // GPS: $executeRaw for Unsupported geometry column, then insert SyncLog
        // in the same interactive transaction.
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO screenings (
              screening_id,
              child_id,
              created_by_user_id,
              age_months,
              gender,
              height_cm,
              classification,
              screened_at,
              location_source,
              location,
              manual_region_id,
              resolved_region_id,
              region_resolution_status
            ) VALUES (
              ${input.screeningId}::uuid,
              ${input.childId}::uuid,
              ${input.createdByUserId}::uuid,
              ${input.ageMonths},
              ${input.gender}::"gender",
              ${input.heightCm},
              ${input.classification}::"classification",
              ${input.screenedAt},
              'GPS'::"location_source",
              ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326),
              NULL,
              NULL,
              'PENDING'::"region_resolution_status"
            )
          `;

          await tx.syncLog.create({
            data: {
              syncLogId,
              submittedByUserId,
              entityType: "SCREENING",
              requestEntityId: input.screeningId,
              payloadHash,
              screeningId: input.screeningId,
              childId: input.childId,
              receiptStatus: "ACCEPTED",
              processingStatus,
            },
          });
        });
      }

      return { status: "INSERTED" };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.findIdempotencyRecord(input.screeningId);

        if (!existing) {
          
          // Race condition: PK exists but SyncLog not yet committed — treat as duplicate
          return { status: "ALREADY_RECEIVED", processingStatus: "NOT_REQUIRED" };
        }

        return existing.payloadHash === payloadHash
          ? { status: "ALREADY_RECEIVED", processingStatus: existing.processingStatus }
          : { status: "CONFLICT" };
      }

      throw err;
    }
  }
}
