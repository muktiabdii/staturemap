import { prisma } from "@/src/lib/prisma";
import { ScreeningRepository } from "@/src/server/repositories";
import { CLASSIFICATION } from "@/src/constants/common";
import type { AggregationRow } from "@/src/server/repositories/screening/screening.repository";

const screeningRepo = new ScreeningRepository();

// Minimum number of screenings for a region to appear on the public map.
// Below this, the region is suppressed entirely.
export const MIN_AGGREGATION_THRESHOLD = 5;

// Region levels exposed on the public API (VILLAGE is intentionally excluded)
const PUBLIC_LEVELS = ["PROVINCE", "REGENCY", "DISTRICT"] as const;
export type PublicLevel = (typeof PUBLIC_LEVELS)[number];

// Full region row used to build the in-memory tree
type RegionRow = {
  id: string;
  regionCode: string;
  regionName: string;
  regionLevel: string;
  parentId: string | null;
};

// Per-classification counts for one target region
type ClassificationCounts = Record<string, number>;

// Response item — suppression is applied before this shape is produced
export type PublicAggregationItem = {
  region_code: string;
  region_name: string;
  region_level: string;
  parent_code: string | null;
  parent_name: string | null;
  total: number;
  classification: ClassificationCounts | null;
};

export class MapService {
  /**
   * Returns aggregated screening counts per administrative region at the
   * requested level (PROVINCE, REGENCY, or DISTRICT).
   *
   * Aggregation flow:
   * 1. Fetch all RESOLVED screening counts grouped by VILLAGE + classification.
   * 2. Load the full region tree once and build an in-memory hierarchy.
   * 3. For each region at the target level, sum counts of every VILLAGE
   *    underneath it (server-side rollup — granular data never leaves the server).
   * 4. Apply suppression rules:
   *    - Region total below MIN_AGGREGATION_THRESHOLD is omitted entirely.
   *    - Classification breakdown is only included when EVERY present
   *      (non-zero) category is itself >= threshold. If any category is below
   *      the threshold, the whole breakdown is dropped (classification: null)
   *      so no small category can be derived via total minus other categories.
   */
  static async getPublicAggregation(level: PublicLevel): Promise<PublicAggregationItem[]> {
    // 1. Village-level counts from screenings
    const rows: AggregationRow[] = await screeningRepo.getAggregationByVillage();

    // 2. Region tree
    const regions: RegionRow[] = await prisma.administrativeRegion.findMany({
      select: {
        id: true,
        regionCode: true,
        regionName: true,
        regionLevel: true,
        parentId: true,
      },
    });

    // Map for fast lookup + child lists
    const byId = new Map<string, RegionRow>(regions.map((r) => [r.id, r]));
    const childrenOf = new Map<string, string[]>();
    for (const r of regions) {
      if (r.parentId) {
        const list = childrenOf.get(r.parentId) ?? [];
        list.push(r.id);
        childrenOf.set(r.parentId, list);
      }
    }

    // 3. Collect village IDs under each target-level region
    const villagesUnder = (regionId: string): string[] => {
      const out: string[] = [];
      const walk = (id: string) => {
        const kids = childrenOf.get(id) ?? [];
        for (const kid of kids) {
          const row = byId.get(kid);
          if (row?.regionLevel === "VILLAGE") out.push(kid);
          else walk(kid);
        }
      };
      walk(regionId);
      return out;
    };

    // Aggregate village counts into a per-village-classification map
    const villageCounts = new Map<string, ClassificationCounts>();
    for (const row of rows) {
      const counts = villageCounts.get(row.resolvedRegionId) ?? {};
      counts[row.classification] = (counts[row.classification] ?? 0) + row.count;
      villageCounts.set(row.resolvedRegionId, counts);
    }

    // 4. Build result for each region at the target level
    const results: PublicAggregationItem[] = [];
    for (const region of regions) {
      if (region.regionLevel !== level) continue;

      const villageIds = villagesUnder(region.id);
      const totals: ClassificationCounts = {};
      let total = 0;
      for (const vid of villageIds) {
        const counts = villageCounts.get(vid);
        if (!counts) continue;
        for (const [cls, n] of Object.entries(counts)) {
          totals[cls] = (totals[cls] ?? 0) + n;
          total += n;
        }
      }

      // Total below threshold — suppress the whole region
      if (total < MIN_AGGREGATION_THRESHOLD) continue;

      // Breakdown suppression: all present categories must meet the threshold
      const presentCategories = Object.entries(totals).filter(([, n]) => n > 0);
      const allSafe = presentCategories.every(([, n]) => n >= MIN_AGGREGATION_THRESHOLD);
      const classification = allSafe ? totals : null;

      const parent = region.parentId ? byId.get(region.parentId) : undefined;

      results.push({
        region_code: region.regionCode,
        region_name: region.regionName,
        region_level: region.regionLevel,
        parent_code: parent?.regionCode ?? null,
        parent_name: parent?.regionName ?? null,
        total,
        classification,
      });
    }

    return results;
  }

  // ─── Helpers exposed for validators ──────────────────────────────────────

  static isPublicLevel(level: string): level is PublicLevel {
    return (PUBLIC_LEVELS as readonly string[]).includes(level);
  }

  static isValidClassification(cls: string): boolean {
    return Object.values(CLASSIFICATION).includes(
      cls as (typeof CLASSIFICATION)[keyof typeof CLASSIFICATION]
    );
  }
}
