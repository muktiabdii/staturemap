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
