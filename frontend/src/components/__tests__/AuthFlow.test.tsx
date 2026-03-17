import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuthFlow from '#/components/AuthFlow'

// Mock the API client
vi.mock('#/api/client', () => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}))

import { sendCode, verifyCode } from '#/api/client'

const mockSendCode = vi.mocked(sendCode)
const mockVerifyCode = vi.mocked(verifyCode)

describe('AuthFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders phone input initially', () => {
    render(<AuthFlow onAuthenticated={vi.fn()} />)
    expect(screen.getByPlaceholderText('+1234567890')).toBeTruthy()
    expect(screen.getByText('Send Code')).toBeTruthy()
  })

  it('calls sendCode on submit', async () => {
    mockSendCode.mockResolvedValueOnce({ phone_code_hash: 'hash123' })
    render(<AuthFlow onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => {
      expect(mockSendCode).toHaveBeenCalledWith('+1234567890')
    })
  })

  it('transitions to code step after sendCode', async () => {
    mockSendCode.mockResolvedValueOnce({ phone_code_hash: 'hash123' })
    render(<AuthFlow onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('12345')).toBeTruthy()
    })
  })

  it('calls verifyCode on code submit', async () => {
    mockSendCode.mockResolvedValueOnce({ phone_code_hash: 'hash123' })
    mockVerifyCode.mockResolvedValueOnce({ success: true })

    render(<AuthFlow onAuthenticated={vi.fn()} />)

    // Step 1: phone
    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    // Step 2: code
    await waitFor(() => screen.getByPlaceholderText('12345'))
    fireEvent.change(screen.getByPlaceholderText('12345'), {
      target: { value: '99999' },
    })
    fireEvent.submit(screen.getByText('Verify'))

    await waitFor(() => {
      expect(mockVerifyCode).toHaveBeenCalledWith(
        '+1234567890',
        '99999',
        'hash123',
        undefined,
      )
    })
  })

  it('calls onAuthenticated on success', async () => {
    mockSendCode.mockResolvedValueOnce({ phone_code_hash: 'hash123' })
    mockVerifyCode.mockResolvedValueOnce({ success: true })
    const onAuthenticated = vi.fn()

    render(<AuthFlow onAuthenticated={onAuthenticated} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => screen.getByPlaceholderText('12345'))
    fireEvent.change(screen.getByPlaceholderText('12345'), {
      target: { value: '99999' },
    })
    fireEvent.submit(screen.getByText('Verify'))

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalled()
    })
  })

  it('transitions to password step on 2FA', async () => {
    mockSendCode.mockResolvedValueOnce({ phone_code_hash: 'hash123' })
    mockVerifyCode.mockRejectedValueOnce(new Error('2FA password required'))

    render(<AuthFlow onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => screen.getByPlaceholderText('12345'))
    fireEvent.change(screen.getByPlaceholderText('12345'), {
      target: { value: '99999' },
    })
    fireEvent.submit(screen.getByText('Verify'))

    await waitFor(() => {
      expect(screen.getByPlaceholderText('2FA Password')).toBeTruthy()
    })
  })

  it('displays error message', async () => {
    mockSendCode.mockRejectedValueOnce(new Error('Network error'))

    render(<AuthFlow onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => {
      expect(screen.getByText(/Network error/)).toBeTruthy()
    })
  })

  it('disables button while loading', async () => {
    // Never resolve to keep loading state
    mockSendCode.mockReturnValueOnce(new Promise(() => {}))

    render(<AuthFlow onAuthenticated={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText('+1234567890'), {
      target: { value: '+1234567890' },
    })
    fireEvent.submit(screen.getByText('Send Code'))

    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeTruthy()
      const btn = screen.getByText('Sending...').closest('button')
      expect(btn?.disabled).toBe(true)
    })
  })
})
