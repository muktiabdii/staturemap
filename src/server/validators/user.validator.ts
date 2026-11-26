import { z } from "zod/v4";

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

export type CreateNakesInput = z.infer<typeof createNakesSchema>;
export type UpdateNakesInput = z.infer<typeof updateNakesSchema>;
