import { z } from "zod/v4";

export const getRegionsQuerySchema = z.object({
  version: z.string().optional(),
});

export const getPullQuerySchema = z.object({
  cursor: z.string().optional(),
});

export type GetRegionsQuery = z.infer<typeof getRegionsQuerySchema>;
export type GetPullQuery = z.infer<typeof getPullQuerySchema>;
