import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface UserProfile {
  id: string
  email: string
  role: string
  created_at: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => client.get('/auth/me').then((r) => r.data as UserProfile),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { display_name?: string; bio?: string }) =>
      client.patch('/auth/profile', data).then((r) => r.data as UserProfile),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  })
}
