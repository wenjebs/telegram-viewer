import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Route } from '#/routes/index'

type SearchParams = ReturnType<typeof Route.useSearch>

export function useSearchParams() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

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
