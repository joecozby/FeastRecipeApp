import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface CookbookSummary {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  cover_photos: string[]   // up to 4 cover URLs from the first recipes in the cookbook
  recipe_count: number
  display_order: number
  created_at: string
}

export function useCookbooks() {
  return useQuery({
    queryKey: ['cookbooks'],
    queryFn: () => client.get('/cookbooks').then((r) => r.data),
  })
}

export function useCookbook(id: string) {
  return useQuery({
    queryKey: ['cookbooks', id],
    queryFn: () => client.get(`/cookbooks/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateCookbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title: string; description?: string }) =>
      client.post('/cookbooks', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cookbooks'] }),
  })
}

export function useUpdateCookbook(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { title?: string; description?: string }) =>
      client.patch(`/cookbooks/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cookbooks', id] })
      qc.invalidateQueries({ queryKey: ['cookbooks'] })
    },
  })
}

export function useDeleteCookbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.delete(`/cookbooks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cookbooks'] }),
  })
}

export function useAddRecipeToCookbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cookbookId, recipeId }: { cookbookId: string; recipeId: string }) =>
      client.post(`/cookbooks/${cookbookId}/recipes`, { recipe_id: recipeId }).then((r) => r.data),
    onSuccess: (_data, { cookbookId }) =>
      qc.invalidateQueries({ queryKey: ['cookbooks', cookbookId] }),
  })
}

export function useReorderCookbooks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order: string[]) =>
      client.patch('/cookbooks/reorder', { order }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cookbooks'] }),
  })
}

export function useReorderCookbookRecipes(cookbookId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (order: string[]) =>
      client.patch(`/cookbooks/${cookbookId}/recipes/reorder`, { order }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cookbooks', cookbookId] }),
  })
}

export function useRemoveRecipeFromCookbook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cookbookId, recipeId }: { cookbookId: string; recipeId: string }) =>
      client.delete(`/cookbooks/${cookbookId}/recipes/${recipeId}`),
    onSuccess: (_data, { cookbookId }) =>
      qc.invalidateQueries({ queryKey: ['cookbooks', cookbookId] }),
  })
}
