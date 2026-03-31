import { useState, useRef, useEffect, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAiChat, ChatMessage } from '../api/ai'

interface DisplayMessage {
  role: 'user' | 'assistant'
  content: string
  created_recipe_id?: string | null
  updated_recipe_id?: string | null
}

const SUGGESTIONS = [
  'Create a quick weeknight pasta recipe',
  'What can I substitute for buttermilk?',
  'Suggest 3 recipes I can make with chicken and lemon',
  'Add a spicy version of my pasta recipe',
]

export default function AiPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const chat = useAiChat()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chat.isPending])

  async function send(text: string) {
    if (!text.trim() || chat.isPending) return
    const userMsg: DisplayMessage = { role: 'user', content: text.trim() }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')

    // Build history for API — only role + content, no display extras
    const history: ChatMessage[] = messages.map(m => ({ role: m.role, content: m.content }))

    try {
      const result = await chat.mutateAsync({ message: text.trim(), history })
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.reply,
        created_recipe_id: result.created_recipe_id,
        updated_recipe_id: result.updated_recipe_id,
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

  return (
    <div style={{ maxWidth: '720px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>AI Chef</h1>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
        Ask cooking questions, get recipe ideas, or say "create a recipe for X" to add it directly to your collection.
      </p>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px',
        paddingBottom: '16px', minHeight: 0,
      }}>
        {messages.length === 0 && (
          <div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Try asking:</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    padding: '8px 14px', borderRadius: '999px',
                    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                    fontSize: '13px', color: 'var(--color-text)', cursor: 'pointer',
                    fontFamily: 'var(--font-sans)', transition: 'border-color 0.15s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%',
              padding: '12px 16px',
              borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-surface)',
              color: msg.role === 'user' ? '#fff' : 'var(--color-text)',
              border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)',
              fontSize: '14px',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}

              {/* Link to created recipe */}
              {msg.created_recipe_id && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                  <Link
                    to={`/recipes/${msg.created_recipe_id}`}
                    style={{
                      fontSize: '13px', fontWeight: 600,
                      color: msg.role === 'user' ? '#fff' : 'var(--color-primary)',
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    View created recipe →
                  </Link>
                </div>
              )}

              {/* Link to updated recipe */}
              {msg.updated_recipe_id && !msg.created_recipe_id && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--color-border)' }}>
                  <Link
                    to={`/recipes/${msg.updated_recipe_id}`}
                    style={{
                      fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)',
                      textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    View updated recipe →
                  </Link>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Thinking indicator */}
        {chat.isPending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '12px 16px', borderRadius: '18px 18px 18px 4px',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              fontSize: '14px', color: 'var(--color-text-muted)',
            }}>
              Thinking...
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} style={{
        display: 'flex', gap: '10px', paddingTop: '16px',
        borderTop: '1px solid var(--color-border)',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
          }}
          placeholder="Ask anything about cooking, or say 'create a recipe for...' "
          rows={2}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            fontSize: '14px', color: 'var(--color-text)', fontFamily: 'var(--font-sans)',
            resize: 'none', outline: 'none', lineHeight: 1.5,
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || chat.isPending}
          style={{
            padding: '0 20px', borderRadius: 'var(--radius-lg)',
            background: input.trim() && !chat.isPending ? 'var(--color-primary)' : 'var(--color-border)',
            color: input.trim() && !chat.isPending ? '#fff' : 'var(--color-text-muted)',
            border: 'none', cursor: input.trim() && !chat.isPending ? 'pointer' : 'default',
            fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s',
          }}
        >
          Send
        </button>
      </form>
      <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
        Press Enter to send · Shift+Enter for new line
      </p>
    </div>
  )
}
