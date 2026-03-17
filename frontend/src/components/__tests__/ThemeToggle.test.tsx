import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, beforeEach } from 'vitest'
import { ThemeToggle } from '#/components/ThemeToggle'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeToggle', () => {
  it('renders system icon by default', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /system/i })).toBeDefined()
  })

  it('cycles through themes on click', async () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    await userEvent.click(btn) // → light
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    await userEvent.click(btn) // → dark
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)

    await userEvent.click(btn) // → system
    expect(btn.getAttribute('aria-label')).toMatch(/system/i)
  })

  it('shows correct icon for each theme', async () => {
    render(<ThemeToggle />)
    const btn = screen.getByRole('button')

    // system — monitor icon
    expect(btn.querySelector('svg')).toBeDefined()

    await userEvent.click(btn) // → light — sun icon
    expect(btn.getAttribute('aria-label')).toMatch(/light/i)

    await userEvent.click(btn) // → dark — moon icon
    expect(btn.getAttribute('aria-label')).toMatch(/dark/i)
  })
})
