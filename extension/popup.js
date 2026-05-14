/* global chrome */

document.getElementById('send')?.addEventListener('click', async () => {
  const base = document.getElementById('base').value.trim().replace(/\/$/, '')
  const token = document.getElementById('token').value.trim()
  const consent = document.getElementById('consent').checked
  const out = document.getElementById('out')
  out.textContent = ''

  if (!base || !token) {
    out.textContent = 'Base URL and token required.'
    return
  }
  if (!consent) {
    out.textContent = 'Consent required.'
    return
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const url = tab?.url || ''
  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    out.textContent = 'Cannot read this tab URL.'
    return
  }

  await chrome.storage.local.set({ jalayu_base: base, jalayu_token: token })

  const res = await fetch(`${base}/api/extension/activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ domain: hostname, consent: true, durationMinutes: null }),
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    out.textContent = j.error || `Error ${res.status}`
    return
  }
  out.style.color = '#15803d'
  out.textContent = 'Logged ✦'
})

chrome.storage.local.get(['jalayu_base', 'jalayu_token'], (v) => {
  if (v.jalayu_base) document.getElementById('base').value = v.jalayu_base
  if (v.jalayu_token) document.getElementById('token').value = v.jalayu_token
})
