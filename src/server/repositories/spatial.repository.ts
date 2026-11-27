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

  /**
   * Returns screening markers for Admin map — joins screenings with child and
   * region data, extracting GPS coordinates from the geometry column.
   *
   * Filters (all optional):
   * - resolvedRegionIds: pre-computed descendant region UUIDs from region_code filter
   * - from / to: screened_at range
   * - locationSource: "GPS" | "MANUAL" | undefined (all)
   *
   * GPS coordinates are only available for GPS screenings. MANUAL screenings
   * have NULL latitude/longitude.
   * Screenings not yet RESOLVED still appear but resolved_region_code is NULL.
   *
   * Returns one row per screening. Caller is responsible for pagination
   * (offset/limit passed directly).
   */
  static async getAdminMapMarkers(filters: {
    resolvedRegionIds?: string[];
    from?: Date;
    to?: Date;
    locationSource?: string;
    limit: number;
    offset: number;
  }): Promise<AdminMapMarker[]> {
    // Build WHERE fragments as parameterized conditions.
    // We collect fragments and params separately then compose the query.
    // All dynamic values are passed via tagged template interpolation.

    type RawRow = {
      screening_id: string;
      child_id: string;
      classification: string;
      screened_at: Date;
      location_source: string;
      region_resolution_status: string;
      latitude: number | null;
      longitude: number | null;
      resolved_region_code: string | null;
      resolved_region_name: string | null;
    };

    // Build the query conditionally.
    // We use a CTE-less approach: compose WHERE predicates using Prisma
    // tagged template to keep parameterization safe.
    // Because Prisma $queryRaw does not support dynamic IN lists via a single
    // placeholder, we fall back to two separate query paths: filtered and unfiltered.

    const dateFrom = filters.from ?? null;
    const dateTo = filters.to ?? null;
    const locSrc = filters.locationSource ?? null;
    const limit = filters.limit;
    const offset = filters.offset;

    let rows: RawRow[];

    if (filters.resolvedRegionIds && filters.resolvedRegionIds.length > 0) {
      // With region filter: use ANY($1::uuid[]) for the IN clause
      const regionArray = filters.resolvedRegionIds;
      rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          s.screening_id,
          s.child_id,
          s.classification::text,
          s.screened_at,
          s.location_source::text,
          s.region_resolution_status::text,
          CASE WHEN s.location_source = 'GPS'
            THEN ST_Y(s.location::geometry)
            ELSE NULL
          END AS latitude,
          CASE WHEN s.location_source = 'GPS'
            THEN ST_X(s.location::geometry)
            ELSE NULL
          END AS longitude,
          ar.region_code  AS resolved_region_code,
          ar.region_name  AS resolved_region_name
        FROM screenings s
        LEFT JOIN administrative_regions ar ON ar.id = s.resolved_region_id
        WHERE s.resolved_region_id = ANY(${regionArray}::uuid[])
          AND (${dateFrom}::timestamptz IS NULL OR s.screened_at >= ${dateFrom}::timestamptz)
          AND (${dateTo}::timestamptz IS NULL OR s.screened_at <= ${dateTo}::timestamptz)
          AND (${locSrc}::text IS NULL OR s.location_source::text = ${locSrc}::text)
        ORDER BY s.screened_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await prisma.$queryRaw<RawRow[]>`
        SELECT
          s.screening_id,
          s.child_id,
          s.classification::text,
          s.screened_at,
          s.location_source::text,
          s.region_resolution_status::text,
          CASE WHEN s.location_source = 'GPS'
            THEN ST_Y(s.location::geometry)
            ELSE NULL
          END AS latitude,
          CASE WHEN s.location_source = 'GPS'
            THEN ST_X(s.location::geometry)
            ELSE NULL
          END AS longitude,
          ar.region_code  AS resolved_region_code,
          ar.region_name  AS resolved_region_name
        FROM screenings s
        LEFT JOIN administrative_regions ar ON ar.id = s.resolved_region_id
        WHERE (${dateFrom}::timestamptz IS NULL OR s.screened_at >= ${dateFrom}::timestamptz)
          AND (${dateTo}::timestamptz IS NULL OR s.screened_at <= ${dateTo}::timestamptz)
          AND (${locSrc}::text IS NULL OR s.location_source::text = ${locSrc}::text)
        ORDER BY s.screened_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return rows.map((r) => ({
      screening_id: r.screening_id,
      child_id: r.child_id,
      classification: r.classification,
      screened_at: r.screened_at.toISOString(),
      location_source: r.location_source,
      region_resolution_status: r.region_resolution_status,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      resolved_region_code: r.resolved_region_code ?? null,
      resolved_region_name: r.resolved_region_name ?? null,
    }));
  }

  /**
   * Counts screenings matching the same filters as getAdminMapMarkers.
   * Used to compute pagination metadata.
   */
  static async countAdminMapMarkers(filters: {
    resolvedRegionIds?: string[];
    from?: Date;
    to?: Date;
    locationSource?: string;
  }): Promise<number> {
    const dateFrom = filters.from ?? null;
    const dateTo = filters.to ?? null;
    const locSrc = filters.locationSource ?? null;

    type CountRow = { count: bigint };

    let result: CountRow[];

    if (filters.resolvedRegionIds && filters.resolvedRegionIds.length > 0) {
      const regionArray = filters.resolvedRegionIds;
      result = await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM screenings s
        WHERE s.resolved_region_id = ANY(${regionArray}::uuid[])
          AND (${dateFrom}::timestamptz IS NULL OR s.screened_at >= ${dateFrom}::timestamptz)
          AND (${dateTo}::timestamptz IS NULL OR s.screened_at <= ${dateTo}::timestamptz)
          AND (${locSrc}::text IS NULL OR s.location_source::text = ${locSrc}::text)
      `;
    } else {
      result = await prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*)::bigint AS count
        FROM screenings s
        WHERE (${dateFrom}::timestamptz IS NULL OR s.screened_at >= ${dateFrom}::timestamptz)
          AND (${dateTo}::timestamptz IS NULL OR s.screened_at <= ${dateTo}::timestamptz)
          AND (${locSrc}::text IS NULL OR s.location_source::text = ${locSrc}::text)
      `;
    }

    return Number(result[0]?.count ?? 0);
  }
}

// Shape of one screening marker returned to Admin map frontend
export type AdminMapMarker = {
  screening_id: string;
  child_id: string;
  classification: string;
  screened_at: string;
  location_source: string;
  region_resolution_status: string;
  latitude: number | null;
  longitude: number | null;
  resolved_region_code: string | null;
  resolved_region_name: string | null;
};
