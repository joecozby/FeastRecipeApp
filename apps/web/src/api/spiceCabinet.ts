import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface SpiceMasterItem {
  id: number
  name: string
  category: string
  sort_order: number
}

export function useSpiceCabinetMaster() {
  return useQuery<SpiceMasterItem[]>({
    queryKey: ['spice-cabinet', 'master'],
    queryFn: () => client.get('/spice-cabinet/master').then((r) => r.data),
    staleTime: 1000 * 60 * 60, // 1 hour — master list rarely changes
  })
}

export function useMySpiceCabinet() {
  return useQuery<{ owned: number[] }>({
    queryKey: ['spice-cabinet', 'mine'],
    queryFn: () => client.get('/spice-cabinet').then((r) => r.data),
  })
}

export function useAddToSpiceCabinet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (masterId: number) => client.post(`/spice-cabinet/${masterId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spice-cabinet', 'mine'] }),
  })
}

export function useRemoveFromSpiceCabinet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (masterId: number) => client.delete(`/spice-cabinet/${masterId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['spice-cabinet', 'mine'] }),
  })
}
