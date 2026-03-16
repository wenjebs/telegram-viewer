import { formatDateLong } from '#/utils/format'

export default function DateHeader({ date }: { date: string }) {
  const formatted = formatDateLong(date)
  return (
    <h3 className="pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
      {formatted}
    </h3>
  )
}
