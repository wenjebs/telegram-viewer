const steps = [
  {
    label: 'Pick chats',
    description:
      'Open the sidebar and select the chats you want to pull media from.',
  },
  {
    label: 'Sync',
    description: 'Hit the Sync button to download your media.',
    accent: true,
  },
  {
    label: 'Browse',
    description: 'Your photos and videos will appear right here.',
  },
]

export function EmptyState() {
  return (
    <section
      aria-label="Getting started"
      className="flex flex-1 flex-col items-center justify-center gap-4 p-8"
    >
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-base font-semibold text-text">No media yet</h2>
        <p className="text-sm text-text-soft">Get started in three steps.</p>
      </div>
      <ol className="flex w-full max-w-sm flex-col gap-2">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className="flex items-start gap-3 rounded-lg bg-surface-alt p-3"
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.accent
                  ? 'bg-accent text-white'
                  : 'bg-surface-strong text-text-soft ring-1 ring-border'
              }`}
            >
              {i + 1}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-text">
                {step.label}
              </span>
              <span className="text-xs text-text-soft">{step.description}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
