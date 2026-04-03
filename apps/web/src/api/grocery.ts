import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

// One row per (recipe × ingredient) — quantities are NOT pre-merged in the DB.
// The frontend merges them for display depending on the active view mode.
export interface GroceryItem {
  id: string
  recipe_id: string | null
  ingredient_id: string | null
  ingredient_key: string
  display_name: string
  quantity: number | null
  unit: string | null
  is_checked: boolean
  is_manual: boolean
  notes: string | null
  display_order: number
  spice_cabinet_master_id: number | null
  in_spice_cabinet: boolean
}

export interface GroceryRecipe {
  recipe_id: string
  title: string
  servings: number | null
  base_servings: number | null
  cover_image_url: string | null
}

export interface GroceryList {
  id: string
  updated_at: string
  recipes: GroceryRecipe[]
  items: GroceryItem[]
}

export function useGroceryList() {
  return useQuery({
    queryKey: ['grocery'],
    queryFn: () => client.get('/grocery-lists').then((r) => r.data as GroceryList),
  })
}

export function useAddRecipeToGrocery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { recipe_id: string; servings?: number }) =>
      client.post('/grocery-lists/recipes', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}

export function useRemoveRecipeFromGrocery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (recipeId: string) =>
      client.delete(`/grocery-lists/recipes/${recipeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}

// Toggle a single item — used in By Recipe view
export function useToggleGroceryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_checked, notes }: { id: string; is_checked?: boolean; notes?: string }) =>
      client.patch(`/grocery-lists/items/${id}`, { is_checked, notes }).then((r) => r.data),
    onMutate: async ({ id, is_checked }) => {
      await qc.cancelQueries({ queryKey: ['grocery'] })
      const prev = qc.getQueryData<GroceryList>(['grocery'])
      if (prev && is_checked !== undefined) {
        qc.setQueryData(['grocery'], {
          ...prev,
          items: prev.items.map((item) =>
            item.id === id ? { ...item, is_checked } : item
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['grocery'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}

export function useAddManualGroceryItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lines: string[]) =>
      client.post('/grocery-lists/items/manual', { lines }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}

export function useRemoveManualGroceryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => client.delete(`/grocery-lists/items/manual/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}

// Toggle all items that share the same ingredient_key — used in Combined and By Category views
export function useToggleIngredientGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ingredient_key, is_checked }: { ingredient_key: string; is_checked: boolean }) =>
      client.patch('/grocery-lists/ingredient', { ingredient_key, is_checked }).then((r) => r.data),
    onMutate: async ({ ingredient_key, is_checked }) => {
      await qc.cancelQueries({ queryKey: ['grocery'] })
      const prev = qc.getQueryData<GroceryList>(['grocery'])
      if (prev) {
        qc.setQueryData(['grocery'], {
          ...prev,
          items: prev.items.map((item) =>
            item.ingredient_key === ingredient_key ? { ...item, is_checked } : item
          ),
        })
      }
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['grocery'], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['grocery'] }),
  })
}
