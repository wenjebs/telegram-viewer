export default function DateHeader({ date }: { date: string }) {
  const formatted = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  return (
    <h3 className="mt-4 border-b border-neutral-800 pb-2 text-sm text-neutral-500 first:mt-0">
      {formatted}
    </h3>
  )
}
