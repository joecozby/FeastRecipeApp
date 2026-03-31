import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center',
      padding: '64px 24px', gap: '12px',
    }}>
      {icon && <span style={{ fontSize: '48px', lineHeight: 1 }}>{icon}</span>}
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>{title}</h3>
      {description && (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', maxWidth: '360px' }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  )
}
