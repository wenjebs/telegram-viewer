export default function DateHeader({ date }: { date: string }) {
  const formatted = new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return (
    <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
      {formatted}
    </h3>
  )
}
