import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface GroceryItem {
  id: string
  ingredient_id: string | null
  display_name: string
  quantity: number | null
  unit: string | null
  is_checked: boolean
  notes: string | null
  display_order: number
  source_recipe_ids: string[]
}

export interface GroceryRecipe {
  recipe_id: string
  title: string
  servings: number | null
  base_servings: number | null
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
