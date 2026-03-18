interface Props {
  columns: number
  rows: number
}

export default function SkeletonGroup({ columns, rows }: Props) {
  const count = columns * rows
  return (
    <div className="rounded-lg border border-border bg-surface/60 p-3">
      {/* Fake date header */}
      <div
        data-testid="skeleton-header"
        className="mb-2 h-5 w-24 rounded bg-surface-strong"
        style={{
          backgroundImage:
            'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.8s ease-in-out infinite',
        }}
      />
      {/* Fake thumbnail grid — mirror the real grid's column layout */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            data-testid="skeleton-cell"
            className="aspect-square rounded bg-surface-strong"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent 0%, var(--color-surface-alt) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: `shimmer 1.8s ease-in-out ${i * 0.05}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
