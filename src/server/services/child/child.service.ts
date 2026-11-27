import { ChildRepository, RegionRepository } from "@/src/server/repositories";
import type { AdminChildItem } from "@/src/server/repositories/child/child.repository";
import type { Gender } from "@/src/generated/prisma/client";
import type { UpdateChildInput } from "@/src/server/validators/admin-child.validator";

const childRepo = new ChildRepository();
const regionRepo = new RegionRepository();

export class ChildError extends Error {
  constructor(
    public readonly statusCode: 404 | 422,
    message: string
  ) {
    super(message);
    this.name = "ChildError";
  }
}

export class ChildService {
  /**
   * Returns all children for Admin with optional filters. No pagination —
   * deferred per checkpoint scope.
   *
   * region_code is resolved to descendant UUIDs before passing to repository.
   */
  static async listAdmin(filters: {
    regionCode?: string;
    recordStatus?: string;
    search?: string;
  }): Promise<AdminChildItem[]> {
    let assignedRegionIds: string[] | undefined;
    if (filters.regionCode) {
      const ids = await regionRepo.getDescendantIds(filters.regionCode);
      // Unknown region_code → empty result (not an error for list)
      if (ids.length === 0) return [];
      assignedRegionIds = ids;
    }

    return childRepo.findManyAdmin({
      assignedRegionIds,
      recordStatus: filters.recordStatus,
      search: filters.search,
    });
  }

  /** Returns a single child for Admin view. Throws 404 if not found. */
  static async getAdmin(childId: string): Promise<AdminChildItem> {
    const child = await childRepo.findByIdAdmin(childId);
    if (!child) throw new ChildError(404, "Data anak tidak ditemukan");
    return child;
  }

  /**
   * Updates mutable profile fields of a child as Admin.
   * assignedRegionId, createdByUserId, and recordStatus are never changed here.
   * updatedAt is bumped automatically via Prisma @updatedAt so sync pull picks
   * up the change on the Nakes's next pull request.
   */
  static async updateAdmin(
    childId: string,
    input: UpdateChildInput,
    adminUserId: string
  ): Promise<AdminChildItem> {
    const existing = await childRepo.findByIdAdmin(childId);
    if (!existing) throw new ChildError(404, "Data anak tidak ditemukan");

    const data: {
      name?: string;
      dateOfBirth?: Date;
      gender?: Gender;
      address?: string;
      updatedByUserId: string;
    } = { updatedByUserId: adminUserId };

    if (input.name !== undefined) data.name = input.name;
    if (input.date_of_birth !== undefined) data.dateOfBirth = new Date(input.date_of_birth);
    if (input.gender !== undefined) data.gender = input.gender as Gender;
    if (input.address !== undefined) data.address = input.address;

    const updated = await childRepo.updateByAdmin(childId, data);
    // updateByAdmin returns null only on P2025 — we already confirmed it exists above
    if (!updated) throw new ChildError(404, "Data anak tidak ditemukan");
    return updated;
  }

  /**
   * Deactivates a child (soft delete via recordStatus = INACTIVE). Idempotent.
   * Does NOT remove existing screenings; Nakes push validation already blocks
   * new screenings for INACTIVE children (enforced in SyncService).
   */
  static async deactivateAdmin(childId: string, adminUserId: string): Promise<AdminChildItem> {
    const existing = await childRepo.findByIdAdmin(childId);
    if (!existing) throw new ChildError(404, "Data anak tidak ditemukan");

    // Already inactive — idempotent, return as-is without touching DB
    if (existing.recordStatus === "INACTIVE") return existing;

    const updated = await childRepo.deactivateByAdmin(childId, adminUserId);
    if (!updated) throw new ChildError(404, "Data anak tidak ditemukan");
    return updated;
  }
}
