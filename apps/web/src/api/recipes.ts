import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import client from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecipeSummary {
  id: string
  title: string
  status: 'draft' | 'published'
  cuisine: string | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  prep_time_mins: number | null
  cook_time_mins: number | null
  base_servings: number | null
  cover_url: string | null
  created_at: string
  updated_at: string
}

export interface RecipeDetail extends RecipeSummary {
  description: string | null
  source_url: string | null
  owner_name: string | null
  ingredients: RecipeIngredient[]
  instructions: Instruction[]
  tags: Tag[]
}

export interface RecipeIngredient {
  id: string
  raw_text: string
  quantity: number | null
  unit: string | null
  preparation: string | null
  notes: string | null
  is_optional: boolean
  display_order: number
  group_label: string | null
  canonical_name: string | null
}

export interface Instruction {
  id: string
  step_number: number
  body: string
  group_label: string | null
}

export interface Tag {
  id: string
  name: string
  type: 'user' | 'system'
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useRecipes(params?: { status?: string }) {
  return useInfiniteQuery({
    queryKey: ['recipes', params],
    queryFn: ({ pageParam }) =>
      client.get('/recipes', { params: { ...params, cursor: pageParam, limit: 24 } }).then((r) => r.data),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.cursor ?? undefined,
  })
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipes', id],
    queryFn: () => client.get(`/recipes/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<RecipeSummary> & { title: string }) =>
      client.post('/recipes', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })
}

export function useUpdateRecipe(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<RecipeDetail>) =>
      client.patch(`/recipes/${id}`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes', id] })
      qc.invalidateQueries({ queryKey: ['recipes'] })
      qc.invalidateQueries({ queryKey: ['nutrition', id] })
    },
  })
}

export function useSaveRecipeContent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { ingredients: unknown[]; instructions: unknown[]; tags?: unknown[] }) =>
      client.put(`/recipes/${id}/content`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes', id] })
      qc.invalidateQueries({ queryKey: ['nutrition', id] })
    },
  })
}

export function usePublishRecipe(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => client.patch(`/recipes/${id}/publish`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes', id] })
      qc.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useDeleteRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.delete(`/recipes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export function useImportRecipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { source_type: string; source_input: string }) =>
      client.post('/import', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recipes'] }),
  })
}

export interface NutritionSnapshot {
  per_serving: {
    calories: number
    protein: number
    fat: number
    carbs: number
    fiber: number
    sodium: number
  }
  computed_at: string
  is_estimated: boolean
}

export function useRecipeNutrition(id: string, recipeUpdatedAt?: string) {
  return useQuery({
    queryKey: ['nutrition', id],
    queryFn: () => client.get(`/recipes/${id}/nutrition`).then((r) => r.data as NutritionSnapshot | null),
    enabled: !!id,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data as NutritionSnapshot | null | undefined
      // No snapshot yet — poll until one appears
      if (!data) return 5000
      // Snapshot is older than the last recipe edit — poll until worker catches up
      if (recipeUpdatedAt && data.computed_at < recipeUpdatedAt) return 5000
      return false
    },
  })
}

export function useImportJobStatus(jobId: string | null) {
  return useQuery({
    queryKey: ['import-job', jobId],
    queryFn: () => client.get(`/import/${jobId}`).then((r) => r.data),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'done' || status === 'failed' ? false : 2000
    },
  })
}
