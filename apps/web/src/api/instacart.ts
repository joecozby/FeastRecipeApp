import { useMutation } from '@tanstack/react-query'
import client from './client'
import { GroceryItem } from './grocery'

interface InstacartItem {
  display_name: string
  quantity: number | null
  unit: string | null
}

interface ShoppingLinkResponse {
  url: string | null
  stub?: boolean
}

export function useInstacartShoppingLink() {
  return useMutation({
    mutationFn: ({ items, title }: { items: InstacartItem[]; title?: string }) =>
      client
        .post('/instacart/shopping-link', { items, title })
        .then((r) => r.data as ShoppingLinkResponse),
  })
}

// Deduplicate and flatten GroceryItems into a simple list for Instacart
export function flattenForInstacart(items: GroceryItem[]): InstacartItem[] {
  // Use ingredient_key to deduplicate, summing quantities
  const map = new Map<string, InstacartItem>()
  for (const item of items) {
    const key = item.ingredient_key
    if (map.has(key)) {
      const existing = map.get(key)!
      if (existing.quantity !== null && item.quantity !== null) {
        existing.quantity = Math.round((existing.quantity + item.quantity) * 100) / 100
      } else {
        existing.quantity = null
      }
    } else {
      map.set(key, {
        display_name: item.display_name,
        quantity: item.quantity,
        unit: item.unit,
      })
    }
  }
  return Array.from(map.values())
}
