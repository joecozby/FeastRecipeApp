import { useMutation } from '@tanstack/react-query'
import client from './client'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  reply: string
  created_recipe_id: string | null
  updated_recipe_id: string | null
}

export function useAiChat() {
  return useMutation({
    mutationFn: (data: { message: string; history: ChatMessage[] }) =>
      client.post('/ai/chat', data).then((r) => r.data as ChatResponse),
  })
}
