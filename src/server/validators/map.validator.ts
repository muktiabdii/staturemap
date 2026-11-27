import { z } from "zod/v4";

// Levels exposed on the public API — VILLAGE is intentionally excluded
export const PUBLIC_LEVELS = ["PROVINCE", "REGENCY", "DISTRICT"] as const;

export const getPublicAggregationQuerySchema = z.object({
  level: z
    .enum(["PROVINCE", "REGENCY", "DISTRICT"], {
      error: "Level harus salah satu dari: PROVINCE, REGENCY, DISTRICT",
    })
    .default("DISTRICT"),
});

export type GetPublicAggregationQuery = z.infer<typeof getPublicAggregationQuerySchema>;

// Admin stats query — region_code and date range are optional filters
export const getAdminStatsQuerySchema = z.object({
  region_code: z.string().min(1).max(50).optional(),
  from: z.iso.date({ error: "Format from tidak valid (YYYY-MM-DD)" }).optional(),
  to: z.iso.date({ error: "Format to tidak valid (YYYY-MM-DD)" }).optional(),
});

export type GetAdminStatsQuery = z.infer<typeof getAdminStatsQuerySchema>;

// Admin map screenings query
export const getAdminMapQuerySchema = z.object({
  region_code: z.string().min(1).max(50).optional(),
  from: z.iso.date({ error: "Format from tidak valid (YYYY-MM-DD)" }).optional(),
  to: z.iso.date({ error: "Format to tidak valid (YYYY-MM-DD)" }).optional(),
  location_source: z.enum(["GPS", "MANUAL"], {
    error: "location_source harus GPS atau MANUAL",
  }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type GetAdminMapQuery = z.infer<typeof getAdminMapQuerySchema>;
