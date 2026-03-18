import { useCallback } from 'react'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import type { SearchParams } from '#/routes/searchSchema'

const routeApi = getRouteApi('/')

export function useSearchParams() {
  const search = routeApi.useSearch() as SearchParams
  const navigate = useNavigate({ from: '/' })

  const setSearch = useCallback(
    (updates: Partial<SearchParams>, opts?: { replace?: boolean }) => {
      navigate({
        search: (prev) => {
          const next = { ...prev, ...updates }
          return Object.fromEntries(
            Object.entries(next).filter(([, v]) => v !== undefined),
          )
        },
        replace: opts?.replace ?? false,
      })
    },
    [navigate],
  )

  return { search, setSearch }
}
