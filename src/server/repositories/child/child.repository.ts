import { BaseRepository } from "@/src/server/repositories/base.repository";
import { prisma } from "@/src/lib/prisma";
import { isUniqueViolation } from "@/src/lib/utils";
import type { Child, Gender } from "@/src/generated/prisma/client";

export type ChildForValidation = {
  childId: string;
  recordStatus: string;
};

export type ApplyChangeInput = {
  changeId: string;
  childId: string;
  submittedByUserId: string;
  assignedRegionId: string;
  payloadHash: string;
  data: {
    name: string;
    dateOfBirth: Date;
    gender: Gender;
    address: string;
  };
};

export type ApplyChangeResult =
  | { status: "ACCEPTED" }
  | { status: "ALREADY_RECEIVED" }
  | { status: "CONFLICT" };

// Shape returned to the mobile client on pull
export type ChildPullItem = {
  child_id: string;
  name: string;
  date_of_birth: string;
  gender: string;
  address: string;
  record_status: string;
  updated_at: string;
};

// Decoded cursor position used internally for keyset pagination
export type PullCursor = {
  updatedAt: string;
  childId: string;
};

// Shape returned to Admin — includes region info, excludes internal user IDs
export type AdminChildItem = {
  childId: string;
  name: string;
  dateOfBirth: Date;
  gender: string;
  address: string;
  recordStatus: string;
  assignedRegion: {
    id: string;
    regionCode: string;
    regionName: string;
    regionLevel: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

// Fields Admin is allowed to change
export type UpdateChildByAdminData = {
  name?: string;
  dateOfBirth?: Date;
  gender?: Gender;
  address?: string;
  updatedByUserId: string;
};

const ADMIN_CHILD_SELECT = {
  childId: true,
  name: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  recordStatus: true,
  assignedRegion: {
    select: { id: true, regionCode: true, regionName: true, regionLevel: true },
  },
  createdAt: true,
  updatedAt: true,
} as const;

export class ChildRepository extends BaseRepository<Child> {
  protected modelName = "child";

  /**
   * Finds a child by ID, returning only the fields needed for validation.
   * Returns null if not found.
   */
  async findChildForValidation(childId: string): Promise<ChildForValidation | null> {
    return this.model.findUnique({
      where: { childId },
      select: { childId: true, recordStatus: true },
    }) as Promise<ChildForValidation | null>;
  }

  /**
   * Lists children for Admin with optional filters. No pagination by design
   * (deferred per checkpoint scope).
   *
   * Filters:
   * - assignedRegionIds: pre-computed descendant UUIDs from region filter
   * - recordStatus: "ACTIVE" | "INACTIVE"
   * - search: case-insensitive match on name
   */
  async findManyAdmin(filters: {
    assignedRegionIds?: string[];
    recordStatus?: string;
    search?: string;
  }): Promise<AdminChildItem[]> {
    const where: Record<string, unknown> = {};

    if (filters.assignedRegionIds && filters.assignedRegionIds.length > 0) {
      where.assignedRegionId = { in: filters.assignedRegionIds };
    }
    if (filters.recordStatus) {
      where.recordStatus = filters.recordStatus;
    }
    if (filters.search) {
      where.name = { contains: filters.search, mode: "insensitive" };
    }

    return this.model.findMany({
      where,
      select: ADMIN_CHILD_SELECT,
      orderBy: { updatedAt: "desc" },
    }) as Promise<AdminChildItem[]>;
  }

  /** Finds a single child by ID for Admin view. Returns null if not found. */
  async findByIdAdmin(childId: string): Promise<AdminChildItem | null> {
    return this.model.findUnique({
      where: { childId },
      select: ADMIN_CHILD_SELECT,
    }) as Promise<AdminChildItem | null>;
  }

  /**
   * Updates mutable profile fields as Admin. Never touches assignedRegionId,
   * createdByUserId, or recordStatus. updatedAt is bumped automatically by
   * Prisma @updatedAt so sync pull picks up the change.
   */
  async updateByAdmin(childId: string, data: UpdateChildByAdminData): Promise<AdminChildItem | null> {
    try {
      return await this.model.update({
        where: { childId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth } : {}),
          ...(data.gender !== undefined ? { gender: data.gender } : {}),
          ...(data.address !== undefined ? { address: data.address } : {}),
          updatedByUserId: data.updatedByUserId,
        },
        select: ADMIN_CHILD_SELECT,
      }) as AdminChildItem;
    } catch (err) {
      // P2025 = record not found on update
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2025") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Soft-deactivates a child (recordStatus = INACTIVE). Idempotent:
   * deactivating an already-INACTIVE child is a no-op that returns the row.
   * Re-activation is not supported (consistent with Nakes account lifecycle).
   */
  async deactivateByAdmin(childId: string, updatedByUserId: string): Promise<AdminChildItem | null> {
    try {
      return await this.model.update({
        where: { childId },
        data: {
          recordStatus: "INACTIVE",
          updatedByUserId,
        },
        select: ADMIN_CHILD_SELECT,
      }) as AdminChildItem;
    } catch (err) {
      if (err instanceof Error && "code" in err && (err as { code: string }).code === "P2025") {
        return null;
      }
      throw err;
    }
  }

  /**
   * Fetches a page of children for a Nakes's work region using keyset pagination.
   *
   * When a cursor is provided, only records strictly after the cursor position
   * are returned. This prevents data loss when multiple records share the same
   * updatedAt timestamp.
   */
  async findForPull(
    assignedRegionId: string,
    cursor: PullCursor | null,
    limit: number
  ): Promise<ChildPullItem[]> {
    type RawRow = {
      child_id: string;
      name: string;
      date_of_birth: Date;
      gender: string;
      address: string;
      record_status: string;
      updated_at: Date;
    };

    let rows: RawRow[];

    if (cursor) {
      rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          child_id,
          name,
          date_of_birth,
          gender::text,
          address,
          record_status::text,
          updated_at
        FROM children
        WHERE assigned_region_id = ${assignedRegionId}::uuid
          AND (updated_at, child_id) > (${new Date(cursor.updatedAt)}, ${cursor.childId}::uuid)
        ORDER BY updated_at ASC, child_id ASC
        LIMIT ${limit}
      `;
    } else {
      rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          child_id,
          name,
          date_of_birth,
          gender::text,
          address,
          record_status::text,
          updated_at
        FROM children
        WHERE assigned_region_id = ${assignedRegionId}::uuid
        ORDER BY updated_at ASC, child_id ASC
        LIMIT ${limit}
      `;
    }

    return rows.map((r) => ({
      child_id: r.child_id,
      name: r.name,
      date_of_birth: r.date_of_birth.toISOString().slice(0, 10),
      gender: r.gender,
      address: r.address,
      record_status: r.record_status,
      updated_at: r.updated_at.toISOString(),
    }));
  }

  /**
   * Applies a profile change operation within a transaction:
   * 1. Inserts a ProfileChangeOperation record (idempotency via changeId PK).
   * 2. Upserts the Child record (create or update).
   *
   * Returns:
   * - "ACCEPTED" if the change was applied.
   * - "ALREADY_RECEIVED" if the same changeId with the same payloadHash already exists.
   * - "CONFLICT" if the same changeId with a different payloadHash exists.
   */
  async applyChange(input: ApplyChangeInput): Promise<ApplyChangeResult> {
    try {
      await prisma.$transaction(async (tx) => {

        // 1. Insert ProfileChangeOperation — changeId is PK, so duplicate throws P2002
        await tx.profileChangeOperation.create({
          data: {
            changeId: input.changeId,
            childId: input.childId,
            submittedByUserId: input.submittedByUserId,
            payloadHash: input.payloadHash,
          },
        });

        // 2. Upsert Child
        await tx.child.upsert({
          where: { childId: input.childId },
          create: {
            childId: input.childId,
            name: input.data.name,
            dateOfBirth: input.data.dateOfBirth,
            gender: input.data.gender,
            address: input.data.address,
            assignedRegionId: input.assignedRegionId,
            createdByUserId: input.submittedByUserId,
            recordStatus: "ACTIVE",
          },
          update: {
            name: input.data.name,
            dateOfBirth: input.data.dateOfBirth,
            gender: input.data.gender,
            address: input.data.address,
            updatedByUserId: input.submittedByUserId,
          },
        });
      });

      return { status: "ACCEPTED" };
    } catch (err) {
      if (isUniqueViolation(err)) {

        // changeId already exists — check if the payload is the same or different
        const existing = await prisma.profileChangeOperation.findUnique({
          where: { changeId: input.changeId },
          select: { payloadHash: true },
        });

        if (!existing) {
          throw err;
        }

        if (existing.payloadHash === input.payloadHash) {
          return { status: "ALREADY_RECEIVED" };
        } else {
          return { status: "CONFLICT" };
        }
      }

      throw err;
    }
  }
}
