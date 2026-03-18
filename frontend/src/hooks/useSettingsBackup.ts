import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { exportSettings, importSettings } from '#/api/client'
import type { ImportResult } from '#/api/schemas'

function buildSummary(result: ImportResult): string {
  const parts: string[] = []
  const { applied, skipped } = result
  if (applied.hidden_groups)
    parts.push(`${applied.hidden_groups} hidden groups`)
  if (applied.inactive_groups)
    parts.push(`${applied.inactive_groups} inactive groups`)
  if (applied.hidden_media) parts.push(`${applied.hidden_media} hidden media`)
  if (applied.favorited_media)
    parts.push(`${applied.favorited_media} favorites`)
  if (applied.person_names) parts.push(`${applied.person_names} person names`)

  let msg = parts.length
    ? `Restored ${parts.join(', ')}`
    : 'No new settings to apply'
  if (skipped.unknown_ids) msg += `. ${skipped.unknown_ids} items skipped`
  return msg
}

export function useSettingsBackup() {
  const queryClient = useQueryClient()
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await exportSettings()
      toast.success('Settings exported')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
      throw err
    } finally {
      setExporting(false)
    }
  }, [])

  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.addEventListener('change', async () => {
      const file = input.files?.[0]
      if (!file) return
      setImporting(true)
      try {
        const result = await importSettings(file)
        toast.success(buildSummary(result))
        queryClient.invalidateQueries()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Import failed')
      } finally {
        setImporting(false)
      }
    })
    input.click()
  }, [queryClient])

  return { exporting, importing, handleExport, handleImport }
}
