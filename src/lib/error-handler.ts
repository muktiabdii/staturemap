"use client";

import { toast } from "sonner";
import type { ApiValidationError } from "@/src/types/api";

export function handleApiError(err: unknown, defaultMessage: string) {
  const error = err as { data?: ApiValidationError | { message?: string } };
  const data = error.data;

  if (
    data &&
    "errors" in data &&
    Array.isArray((data as ApiValidationError).errors) &&
    (data as ApiValidationError).errors.length > 0
  ) {
    (data as ApiValidationError).errors.forEach((errDetail) => {
      toast.error(errDetail.message);
    });
    return;
  }

  const message = (data as { message?: string })?.message || defaultMessage;
  toast.error(message);
}
