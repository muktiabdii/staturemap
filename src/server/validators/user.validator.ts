import { z } from "zod/v4";

// work_region_code is validated for VILLAGE level in the service (DB lookup),
// here we only check shape.
export const createNakesSchema = z.object({
  name: z.string().min(1, { error: "Nama wajib diisi" }).max(255),
  email: z.email({ error: "Format email tidak valid" }),
  password: z
    .string()
    .min(8, { error: "Password minimal 8 karakter" })
    .max(128),
  work_region_code: z
    .string()
    .min(1, { error: "Kode wilayah kerja wajib diisi" })
    .max(50),
});

export const updateNakesSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    email: z.email().optional(),
    password: z.string().min(8).max(128).optional(),
    work_region_code: z.string().min(1).max(50).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.email !== undefined ||
      data.password !== undefined ||
      data.work_region_code !== undefined,
    { error: "Minimal satu field harus diisi" }
  );

// Explicit status transitions — only deactivate is a valid action for now.
// Re-activation is deliberately not exposed (account lifecycle is one-way;
// a deactivated account stays deactivated per domain rules).
export const deactivateNakesSchema = z.object({
  // Intentionally empty — action is derived from the URL, not the body.
});

export type CreateNakesInput = z.infer<typeof createNakesSchema>;
export type UpdateNakesInput = z.infer<typeof updateNakesSchema>;
