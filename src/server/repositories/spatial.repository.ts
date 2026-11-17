import { prisma } from "@/src/lib/prisma";

/**
 * SpatialRepository — the ONLY place for raw PostGIS queries ($queryRaw).
 * All queries MUST use tagged-template parameterization, never string concatenation.
 */
export class SpatialRepository {
  /**
   * Returns the region_code of the VILLAGE-level region that contains the point,
   * or null if no region matches.
   */
  static async resolveRegion(
    latitude: number,
    longitude: number
  ): Promise<string | null> {
    // TODO: implement once administrative_regions table and PostGIS are set up
    // Example query (do not concatenate — use tagged template):
    // const result = await prisma.$queryRaw<{ region_code: string }[]>`
    //   SELECT region_code
    //   FROM administrative_regions
    //   WHERE level = 'VILLAGE'
    //     AND ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326))
    //   LIMIT 1
    // `;
    // return result[0]?.region_code ?? null;
    void prisma; // keep import used until implementation
    void latitude;
    void longitude;
    return null;
  }
}
