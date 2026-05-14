'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

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

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) setReady(true)
  }, [])

  const subscribe = async () => {
    if (!ready) return
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

  if (!ready) return null

  return (
    <div style={{ padding: '0 14px 10px' }}>
      <button
        type="button"
        onClick={subscribe}
        disabled={subscribing}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '0.5px solid #E5E3FF',
          background: '#fff',
          fontSize: 12,
          fontWeight: 500,
          color: '#534AB7',
          cursor: subscribing ? 'wait' : 'pointer',
        }}
      >
        {subscribing ? 'Enabling…' : 'Enable reminder notifications (this device)'}
      </button>
      <p style={{ fontSize: 10, color: '#9CA3AF', margin: '6px 0 0', textAlign: 'center' }}>
        Install the app (Add to Home Screen) for the best experience.
      </p>
    </div>
  )
}
