import { BaseRepository } from "@/src/server/repositories/base.repository";
import { prisma } from "@/src/lib/prisma";
import type { SyncLog } from "@/src/generated/prisma/client";

export type CreateSyncLogInput = {
  syncLogId: string;
  submittedByUserId: string;
  entityType: "CHILD" | "SCREENING";
  requestEntityId: string;
  changeId?: string | null;
  payloadHash?: string | null;
  childId?: string | null;
  screeningId?: string | null;
  receiptStatus: string;
  processingStatus: string;
  errorCode?: string | null;
  errorMessage?: string | null;
};

// Filters for Admin SyncLog list
export type AdminSyncLogFilter = {
  entityType?: string;
  receiptStatus?: string;
  processingStatus?: string;
  submittedByUserId?: string;
  from?: Date;
  to?: Date;
};

// Safe shape for Admin monitoring — no payloadHash, no childId, no screeningId detail
export type AdminSyncLogItem = {
  syncLogId: string;
  submittedByUserId: string;
  entityType: string;
  requestEntityId: string;
  changeId: string | null;
  receiptStatus: string;
  processingStatus: string;
  receivedAt: Date;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
};

const ADMIN_SYNC_LOG_SELECT = {
  syncLogId: true,
  submittedByUserId: true,
  entityType: true,
  requestEntityId: true,
  changeId: true,
  receiptStatus: true,
  processingStatus: true,
  receivedAt: true,
  processingStartedAt: true,
  processingCompletedAt: true,
  errorCode: true,
  errorMessage: true,
  // payloadHash, childId, screeningId intentionally excluded — monitoring only
} as const;

export class SyncLogRepository extends BaseRepository<SyncLog> {
  protected modelName = "syncLog";

  /** Writes a single SyncLog row. syncLogId is caller-generated (UUID). */
  async createLog(input: CreateSyncLogInput): Promise<void> {
    await prisma.syncLog.create({
      data: {
        syncLogId: input.syncLogId,
        submittedByUserId: input.submittedByUserId,
        entityType: input.entityType,
        requestEntityId: input.requestEntityId,
        changeId: input.changeId ?? null,
        payloadHash: input.payloadHash ?? null,
        childId: input.childId ?? null,
        screeningId: input.screeningId ?? null,
        receiptStatus: input.receiptStatus as
          | "ACCEPTED"
          | "ALREADY_RECEIVED"
          | "REJECTED"
          | "CONFLICT",
        processingStatus: input.processingStatus as
          | "NOT_REQUIRED"
          | "PENDING"
          | "PROCESSING"
          | "COMPLETED"
          | "FAILED",
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      },
    });
  }

  /**
   * Updates processingStatus and optionally errorCode on an existing SyncLog.
   * Used to finalize GPS screening logs after enqueue.
   */
  async updateProcessingStatus(
    syncLogId: string,
    processingStatus: "PENDING" | "FAILED",
    errorCode?: string | null
  ): Promise<void> {
    await prisma.syncLog.update({
      where: { syncLogId },
      data: {
        processingStatus,
        ...(errorCode !== undefined ? { errorCode } : {}),
      },
    });
  }

  /**
   * Paginated SyncLog list for Admin monitoring.
   * Returns technical fields only — no payloadHash or raw entity data.
   */
  async findManyAdmin(
    filter: AdminSyncLogFilter,
    page: number,
    limit: number
  ): Promise<{ data: AdminSyncLogItem[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.receiptStatus) where.receiptStatus = filter.receiptStatus;
    if (filter.processingStatus) where.processingStatus = filter.processingStatus;
    if (filter.submittedByUserId) where.submittedByUserId = filter.submittedByUserId;

    if (filter.from || filter.to) {
      where.receivedAt = {
        ...(filter.from ? { gte: filter.from } : {}),
        ...(filter.to ? { lte: filter.to } : {}),
      };
    }

    const [data, total] = await Promise.all([
      prisma.syncLog.findMany({
        where,
        select: ADMIN_SYNC_LOG_SELECT,
        orderBy: { receivedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.syncLog.count({ where }),
    ]);

    return {
      data: data as AdminSyncLogItem[],
      total,
    };
  }
}
