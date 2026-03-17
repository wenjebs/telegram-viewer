import {
  extractDateKey,
  formatDateLong,
  formatDateShort,
  formatDateParam,
  formatDuration,
  formatFileSize,
} from '#/utils/format'

describe('extractDateKey', () => {
  it('extracts YYYY-MM-DD from ISO string', () => {
    expect(extractDateKey('2026-01-15T12:00:00Z')).toBe('2026-01-15')
  })

  it('handles date-only string', () => {
    expect(extractDateKey('2026-03-01T00:00:00')).toBe('2026-03-01')
  })
})

describe('formatDateLong', () => {
  it('formats to long US date', () => {
    const result = formatDateLong('2026-01-15')
    expect(result).toContain('January')
    expect(result).toContain('15')
    expect(result).toContain('2026')
  })
})

describe('formatDateShort', () => {
  it('formats to abbreviated date', () => {
    const result = formatDateShort('2026-01-15T12:00:00Z')
    expect(result).toContain('2026')
    expect(result).toContain('15')
  })
})

describe('formatDateParam', () => {
  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(formatDateParam(d)).toBe('2026-01-05')
  })

  it('does not pad double-digit month and day', () => {
    const d = new Date(2026, 11, 25) // Dec 25
    expect(formatDateParam(d)).toBe('2026-12-25')
  })
})

describe('formatDuration', () => {
  it('formats 90 seconds as 1:30', () => {
    expect(formatDuration(90)).toBe('1:30')
  })

  it('formats 5 seconds as 0:05', () => {
    expect(formatDuration(5)).toBe('0:05')
  })

  it('formats 0 seconds as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00')
  })
})

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB')
  })

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB')
  })
})
