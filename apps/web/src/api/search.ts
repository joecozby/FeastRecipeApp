import { useInfiniteQuery } from '@tanstack/react-query'
import client from './client'

export interface SearchParams {
  q?: string
  cookbook?: string
}

export function useSearch(params: SearchParams) {
  const hasQuery = Object.values(params).some((v) => v && v.trim() !== '')
  return useInfiniteQuery({
    queryKey: ['search', params],
    queryFn: ({ pageParam }) =>
      client.get('/search', { params: { ...params, cursor: pageParam, limit: 24 } }).then((r) => r.data),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.cursor ?? undefined,
    enabled: hasQuery,
  })
}
