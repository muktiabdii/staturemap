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
