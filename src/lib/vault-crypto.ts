/**
 * Client-side encryption for the Vault feature.
 *
 * Security model:
 *  • PIN never leaves the browser.
 *  • Server stores only ciphertext + IV + salt + iteration count.
 *  • Even a full DB breach exposes only ciphertext — useless without the PIN.
 *  • Brute-forcing a 6-digit PIN: 1,000,000 combinations × 250,000 PBKDF2
 *    iterations = 250 billion hash ops. Slow on consumer GPUs, infeasible
 *    on CPU. Encourage 6+ digit PINs (the UI hints at this).
 *
 * Implementation:
 *  • PBKDF2-HMAC-SHA-256, 250,000 iterations (OWASP 2023+ recommendation)
 *  • AES-GCM-256 for encryption (authenticated cipher — tampering detected)
 *  • Random 96-bit IV per encryption (NEVER reused)
 *  • Verification token: encrypt a known string at setup; on unlock, decrypt
 *    and check it matches. If it does, PIN is correct.
 */

// Known-plaintext used for PIN verification. Decrypting the verification_blob
// must produce this exact string for the PIN to be considered correct.
const VERIFICATION_PLAINTEXT = 'JALAYU_VAULT_v1_OK'
const PBKDF2_ITERATIONS = 250000
const SALT_BYTES = 16
const IV_BYTES = 12 // 96 bits — recommended for AES-GCM

// ── base64 helpers ──────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ── Key derivation ──────────────────────────────────────────────────────────

/**
 * Derive an AES-GCM key from a PIN using PBKDF2.
 */
export async function deriveKey(
  pin: string,
  saltB64: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltB64) as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ── Encrypt / decrypt ───────────────────────────────────────────────────────

export interface EncryptedBlob {
  ciphertext: string  // base64
  iv: string          // base64
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedBlob> {
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(plaintext) as BufferSource,
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(ctBuf)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptString(key: CryptoKey, blob: EncryptedBlob): Promise<string> {
  const ct = base64ToBytes(blob.ciphertext)
  const iv = base64ToBytes(blob.iv)
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  )
  return new TextDecoder().decode(ptBuf)
}

// ── Vault setup / verification ──────────────────────────────────────────────

export interface VaultInitMaterial {
  salt: string
  iterations: number
  verification_blob: string
  verification_iv: string
}

/**
 * Generate setup material for a new vault. Returns everything the server
 * needs to store, plus the derived key for immediate use.
 */
export async function initVaultMaterial(pin: string): Promise<{
  material: VaultInitMaterial
  key: CryptoKey
}> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const salt = bytesToBase64(saltBytes)
  const key = await deriveKey(pin, salt, PBKDF2_ITERATIONS)
  const verified = await encryptString(key, VERIFICATION_PLAINTEXT)
  return {
    material: {
      salt,
      iterations: PBKDF2_ITERATIONS,
      verification_blob: verified.ciphertext,
      verification_iv: verified.iv,
    },
    key,
  }
}

/**
 * Try to unlock the vault with a candidate PIN.
 * Returns the derived key if PIN is correct, null if wrong.
 *
 * Wrong-PIN behavior: AES-GCM decrypt with a wrong key THROWS (auth tag fails),
 * so we catch and return null. We could compare the plaintext to be paranoid,
 * but the GCM auth tag check is cryptographically sound.
 */
export async function unlockVault(
  pin: string,
  settings: VaultInitMaterial,
): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(pin, settings.salt, settings.iterations)
    const plaintext = await decryptString(key, {
      ciphertext: settings.verification_blob,
      iv: settings.verification_iv,
    })
    if (plaintext === VERIFICATION_PLAINTEXT) return key
    return null
  } catch {
    return null
  }
}
