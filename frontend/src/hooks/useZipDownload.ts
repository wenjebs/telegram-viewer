import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { prepareZip, getZipStatus, getZipDownloadUrl } from '#/api/client'
import type { ZipStatusResponse } from '#/api/schemas'

export function useZipDownload({
  onComplete,
}: {
  onComplete?: () => void
} = {}) {
  const [jobId, setJobId] = useState<string | null>(null)

  const prepareMutation = useMutation({
    mutationFn: prepareZip,
    onSuccess: (data) => setJobId(data.job_id),
    onError: () => toast.error('Failed to start download'),
  })

  const { data: zipStatus } = useQuery({
    queryKey: ['zipStatus', jobId],
    queryFn: () => getZipStatus(jobId!),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'error' ? false : 1000
    },
  })

  useEffect(() => {
    if (!jobId) return

    if (zipStatus?.status === 'done') {
      const a = document.createElement('a')
      a.href = getZipDownloadUrl(jobId)
      a.download = 'telegram_media.zip'
      a.click()
      if (zipStatus.error) {
        toast.warning(zipStatus.error)
      }
      setJobId(null)
      onComplete?.()
    }

    if (zipStatus?.status === 'error') {
      toast.error(zipStatus.error ?? 'Zip preparation failed')
      setJobId(null)
    }
  }, [zipStatus, jobId, onComplete])

  const startDownload = useCallback(
    (mediaIds: number[]) => prepareMutation.mutate(mediaIds),
    [prepareMutation],
  )

  return {
    preparing: jobId !== null,
    zipStatus: zipStatus as ZipStatusResponse | undefined,
    startDownload,
  }
}
