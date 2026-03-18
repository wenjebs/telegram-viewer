import { useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
// eslint-disable-next-line import/no-unassigned-import
import 'react-day-picker/style.css'

interface Props {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
}

export default function DateRangeFilter({
  dateRange,
  onDateRangeChange,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-xs font-semibold text-text-soft hover:text-text"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span
            className="inline-block transition-transform"
            style={{
              transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
          >
            ▾
          </span>
          Date Range
        </button>
        {dateRange && (
          <button
            className="text-xs text-accent hover:text-accent-hover"
            onClick={() => onDateRangeChange(undefined)}
          >
            Clear
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="mt-2">
          <DayPicker
            mode="range"
            selected={dateRange}
            onSelect={onDateRangeChange}
            style={
              {
                '--rdp-accent-color': 'var(--th-accent)',
                '--rdp-accent-background-color':
                  'var(--color-surface-alt, #0c4a6e)',
                '--rdp-range_middle-background-color':
                  'var(--color-surface-strong, #172554)',
                '--rdp-range_middle-color': 'var(--color-text, #bae6fd)',
                '--rdp-day-height': '34px',
                '--rdp-day-width': '34px',
                '--rdp-day_button-height': '34px',
                '--rdp-day_button-width': '34px',
                '--rdp-today-color': 'var(--th-accent)',
                '--rdp-chevron-disabled-opacity': '0.3',
                '--rdp-selected-font': 'bold 12px sans-serif',
                '--rdp-outside-opacity': '0.3',
                width: '100%',
                fontSize: '13px',
                color: 'var(--color-text-soft, #d4d4d4)',
              } as React.CSSProperties
            }
          />
        </div>
      )}
    </div>
  )
}
