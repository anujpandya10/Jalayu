'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PwaRegister() {
  const [ready, setReady] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    setReady(true)

    // Detect if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Capture the install prompt (only fires on mobile/desktop when app is installable)
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const subscribe = async () => {
    if (!ready) return
    // iOS only allows push inside an installed PWA — inside a plain Safari tab,
    // Notification/Push don't exist at all and the attempt fails with no useful
    // error. Catch this case up front with an actual instruction instead of a
    // generic "could not enable push."
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
    if (isIOS && !isStandalone) {
      toast.error('On iPhone: tap Share → "Add to Home Screen" first, then open Jalayu from that icon and try again.', { duration: 6000 })
      return
    }
    setSubscribing(true)
    try {
      const res = await fetch('/api/push/subscribe')
      const j = await res.json()
      if (!j.configured || !j.publicKey) {
        toast.error('Push is not configured yet (add VAPID keys in env).')
        setSubscribing(false)
        return
      }

      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      await navigator.serviceWorker.ready

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notifications blocked — enable them in browser settings.')
        setSubscribing(false)
        return
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(j.publicKey),
      })

      const save = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!save.ok) {
        const err = await save.json().catch(() => ({}))
        toast.error(err.error || 'Could not save subscription')
      } else {
        toast.success('Reminders can reach you on this device ✦')
      }
    } catch (e) {
      console.error(e)
      toast.error('Could not enable push')
    } finally {
      setSubscribing(false)
    }
  }

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') {
      setInstallPrompt(null)
      setIsInstalled(true)
      toast.success('Jalayu installed ✦')
    }
  }

  if (!ready) return null

  return (
    <div style={{ padding: '0 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Notification toggle */}
      <button
        type="button"
        onClick={subscribe}
        disabled={subscribing}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '0.5px solid var(--border-2)',
          background: 'var(--surface)',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--accent)',
          cursor: subscribing ? 'wait' : 'pointer',
        }}
      >
        {subscribing ? 'Enabling…' : '🔔 Enable reminder notifications'}
      </button>

      {/* Install prompt — only shown when browser has an installable PWA ready */}
      {installPrompt && !isInstalled && (
        <button
          type="button"
          onClick={handleInstall}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '0.5px solid var(--border-2)',
            background: 'var(--morning)',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-2)',
            cursor: 'pointer',
          }}
        >
          📲 Add Jalayu to your home screen
        </button>
      )}

      {/* Already installed — show confirmation */}
      {isInstalled && (
        <p style={{ fontSize: 11, color: 'var(--text-3)', margin: 0, textAlign: 'center' }}>
          ✓ Running as installed app
        </p>
      )}
    </div>
  )
}
