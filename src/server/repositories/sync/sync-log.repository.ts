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
   * Updates processingStatus and optionally errorCode/errorMessage on an
   * existing SyncLog row. Used to finalize GPS screening logs after enqueue.
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
}
