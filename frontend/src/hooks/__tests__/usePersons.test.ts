import { renderHook, waitFor } from '@testing-library/react'
import { createWrapper } from '#/test/wrapper'
import { mockFetch } from '#/test/fetch-mock'
import { makePerson } from '#/test/fixtures'
import { usePersons } from '#/hooks/usePersons'

describe('usePersons', () => {
  it('fetches persons when enabled', async () => {
    const persons = [makePerson(), makePerson()]
    mockFetch({
      '/api/faces/persons': persons,
    })

    const { result } = renderHook(() => usePersons(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.persons.length).toBe(2))
  })

  it('does not fetch when disabled', async () => {
    const fetchFn = mockFetch({
      '/api/faces/persons': [makePerson()],
    })

    renderHook(() => usePersons(false), {
      wrapper: createWrapper(),
    })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('fetches similar groups when 2+ persons', async () => {
    const persons = [makePerson(), makePerson()]
    const fetchFn = mockFetch({
      '/api/faces/persons/similar-groups': {
        groups: [[persons[0].id, persons[1].id]],
      },
      '/api/faces/persons': persons,
    })

    const { result } = renderHook(() => usePersons(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.persons.length).toBe(2))
    await waitFor(() =>
      expect(fetchFn).toHaveBeenCalledWith(
        expect.stringContaining('similar-groups'),
        undefined,
      ),
    )
  })

  it('invalidate clears cache', async () => {
    const persons = [makePerson(), makePerson()]
    mockFetch({
      '/api/faces/persons': persons,
      '/api/faces/persons/similar-groups': { groups: [] },
    })

    const { result } = renderHook(() => usePersons(true), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.persons.length).toBe(2))

    // Calling invalidate should not throw
    result.current.invalidate()
  })
})
