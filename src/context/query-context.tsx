"use client";

// Re-export React Query hooks for convenience.
// QueryClient is provided by src/components/providers.tsx.
export {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
