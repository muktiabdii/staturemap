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

  /**
   * Returns all descendant region IDs under the given region ID (inclusive).
   * Used by admin stats to resolve a filter region_code to the full set of
   * region UUIDs to filter screenings by resolvedRegionId.
   *
   * Loads the full region tree once and walks it in memory — same approach
   * as MapService.getPublicAggregation().
   */
  async getDescendantIds(rootRegionCode: string): Promise<string[]> {
    const root = await this.findByCode(rootRegionCode);
    if (!root) return [];

    const allRegions = await prisma.administrativeRegion.findMany({
      select: { id: true, parentId: true },
    });

    // Build parent → children map
    const childrenOf = new Map<string, string[]>();
    for (const r of allRegions) {
      if (r.parentId) {
        const list = childrenOf.get(r.parentId) ?? [];
        list.push(r.id);
        childrenOf.set(r.parentId, list);
      }
    }

    // BFS from root to collect all descendant IDs (inclusive of root)
    const result: string[] = [];
    const queue: string[] = [root.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      result.push(id);
      const kids = childrenOf.get(id) ?? [];
      queue.push(...kids);
    }

    return result;
  }
}
