import { z } from "zod/v4";

export const getRegionsQuerySchema = z.object({
  version: z.string().optional(),
});

export type GetRegionsQuery = z.infer<typeof getRegionsQuerySchema>;
