import { useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onCancel} width={400}>
      <div style={{ padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h2 style={{
          fontSize: '20px', fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: 'var(--color-text)',
          lineHeight: 1.2,
        }}>
          {title}
        </h2>
        <p style={{
          fontSize: '15px',
          color: 'var(--color-text-muted)',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.5,
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// useConfirm — drop-in async replacement for window.confirm()
//
// Usage:
//   const { confirm, modal } = useConfirm()
//   ...
//   const ok = await confirm({ title: '...', message: '...' })
//   if (!ok) return
//   ...
//   return <>{modal}</>
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
  resolve: ((val: boolean) => void) | null
}

const CLOSED: ConfirmState = {
  open: false, title: '', message: '', resolve: null,
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(CLOSED)

  function confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      setState({ ...opts, open: true, resolve })
    })
  }

  function handleClose(result: boolean) {
    state.resolve?.(result)
    setState(CLOSED)
  }

  const modal = (
    <ConfirmModal
      open={state.open}
      title={state.title}
      message={state.message}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      variant={state.variant}
      onConfirm={() => handleClose(true)}
      onCancel={() => handleClose(false)}
    />
  )

  return { confirm, modal }
}
