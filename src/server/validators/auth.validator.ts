import { z } from "zod/v4";

export const loginSchema = z.object({
  email: z.email({ error: "Format email tidak valid" }),
  password: z.string().min(1, { error: "Password wajib diisi" }),
});

export type LoginInput = z.infer<typeof loginSchema>;
