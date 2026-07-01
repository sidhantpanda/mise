import type { QueryClient } from "@tanstack/react-query";

export const invalidateAll = (qc: QueryClient) => qc.invalidateQueries();
