'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import { swrFetcher, type ApiMeta, type ApiResult } from './api';

/**
 * Data fetching for client components. Keeps the previous result on screen
 * while a new one loads (no flashing skeletons when filters change) and does
 * not refetch on every window focus, which matters on slow mobile networks.
 */
export function useApi<T>(path: string | null, options?: SWRConfiguration<ApiResult<T>>) {
  const { data, error, isLoading, isValidating, mutate } = useSWR<ApiResult<T>>(path, swrFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    shouldRetryOnError: false,
    ...options,
  });
  return {
    data: data?.data,
    meta: data?.meta as (ApiMeta & Record<string, unknown>) | undefined,
    error: error as Error | undefined,
    /** True only for the very first load (nothing to show yet). */
    isLoading,
    /** True while refreshing data that is already on screen. */
    isRefreshing: isValidating && !isLoading,
    mutate,
  };
}
