import { prisma } from "@/src/lib/prisma";
import { BaseRepository } from "@/src/server/repositories/base.repository";

export type RegionForValidation = {
  id: string;
  regionCode: string;
  regionName: string;
  regionLevel: string;
};

export type RegionItem = {
  regionCode: string;
  regionName: string;
  regionLevel: string;
  parentId: string | null;
};

const REGION_SELECT = {
  regionCode: true,
  regionName: true,
  regionLevel: true,
  parentId: true,
} as const;

export class RegionRepository extends BaseRepository {
  protected modelName = "administrativeRegion";

  /** Find a region by its code. Returns null if not found. */
  async findByCode(regionCode: string): Promise<RegionForValidation | null> {
    return this.model.findUnique({
      where: { regionCode },
      select: { id: true, regionCode: true, regionName: true, regionLevel: true },
    }) as Promise<RegionForValidation | null>;
  }

  /**
   * Returns the most recent updatedAt across all regions as an ISO string,
   * or null if the table is empty.
   */
  async getDataVersion(): Promise<string | null> {
    const result = await prisma.administrativeRegion.aggregate({
      _max: { updatedAt: true },
    });
    return result._max.updatedAt?.toISOString() ?? null;
  }

  /**
   * Fetches the VILLAGE-level region for the given code plus all its ancestors
   * (DISTRICT, REGENCY, PROVINCE) up the hierarchy. Returns the flat list
   * ordered from root (PROVINCE) down to VILLAGE.
   */
  async findRegionWithAncestors(regionCode: string): Promise<RegionItem[]> {

    // Walk up the hierarchy: start from the village region, follow parentId links.
    const collected: RegionItem[] = [];
    let current: (RegionItem & { id: string; parentId: string | null }) | null =
      await this.model.findUnique({
        where: { regionCode },
        select: { ...REGION_SELECT, id: true },
      }) as typeof current;

    while (current) {
      collected.push({
        regionCode: current.regionCode,
        regionName: current.regionName,
        regionLevel: current.regionLevel,
        parentId: current.parentId,
      });
      if (!current.parentId) break;
      current = await this.model.findUnique({
        where: { id: current.parentId },
        select: { ...REGION_SELECT, id: true },
      }) as typeof current;
    }

    return collected.reverse();
  }
}
