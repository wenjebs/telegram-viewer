import { useState } from 'react'
import type { FormEvent } from 'react'
import { sendCode, verifyCode } from '#/api/client'

interface Props {
  onAuthenticated: () => void
}

type Step = 'phone' | 'code' | 'password'

export default function AuthFlow({ onAuthenticated }: Props) {
  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [phoneCodeHash, setPhoneCodeHash] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await sendCode(phone)
      setPhoneCodeHash(result.phone_code_hash)
      setStep('code')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyCode(phone, code, phoneCodeHash, password || undefined)
      onAuthenticated()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('password') || msg.includes('2FA')) {
        setStep('password')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await verifyCode(phone, code, phoneCodeHash, password)
      onAuthenticated()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const inputCls =
    'w-full rounded-md border border-border bg-input px-3 py-2 text-text placeholder:text-text-soft focus:border-accent focus:outline-none'
  const btnCls =
    'w-full rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-8 text-2xl font-bold">Telegram Media Viewer</h1>

      {step === 'phone' && (
        <form
          onSubmit={handleSendCode}
          className="flex w-full max-w-xs flex-col gap-4"
        >
          <input
            type="tel"
            placeholder="+1234567890"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className={inputCls}
          />
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'Sending...' : 'Send Code'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form
          onSubmit={handleVerifyCode}
          className="flex w-full max-w-xs flex-col gap-4"
        >
          <p className="text-sm text-text-soft">
            Enter the code sent to {phone}
          </p>
          <input
            type="text"
            placeholder="12345"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            autoFocus
            className={inputCls}
          />
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>
      )}

      {step === 'password' && (
        <form
          onSubmit={handlePassword}
          className="flex w-full max-w-xs flex-col gap-4"
        >
          <p className="text-sm text-text-soft">Enter your 2FA password</p>
          <input
            type="password"
            placeholder="2FA Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            className={inputCls}
          />
          <button type="submit" disabled={loading} className={btnCls}>
            {loading ? 'Verifying...' : 'Submit'}
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}
    </div>
  )
}
