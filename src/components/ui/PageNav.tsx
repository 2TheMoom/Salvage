'use client'

interface PageNavProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  disabled?: boolean
}

// Fixed-size paged navigation, not an ever-growing "load more" list — caps
// how tall a sidebar card can ever get regardless of how much real data
// accumulates underneath it.
export default function PageNav({ page, totalPages, onChange, disabled }: PageNavProps) {
  if (totalPages <= 1) return null

  const btnStyle = (active: boolean) => ({
    padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-md)',
    background: 'transparent', color: active ? 'var(--text-2)' : 'var(--text-3)',
    cursor: active ? 'pointer' : 'default',
    fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 600,
  } as const)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 22px', borderTop: '1px solid var(--border)',
      opacity: disabled ? 0.6 : 1,
    }}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={disabled || page <= 1}
        style={btnStyle(page > 1)}
      >
        ◂ Prev
      </button>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.64rem', color: 'var(--text-3)' }}>
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={disabled || page >= totalPages}
        style={btnStyle(page < totalPages)}
      >
        Next ▸
      </button>
    </div>
  )
}
