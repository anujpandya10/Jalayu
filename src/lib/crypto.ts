/**
 * Symmetric encryption for secrets stored at rest (user API keys).
 * AES-256-GCM. The key is derived (SHA-256 → 32 bytes) from
 * AI_KEY_ENCRYPTION_SECRET if set, else the service-role key (always present
 * server-side). Server-only — never import into client code.
 */
import crypto from 'node:crypto'

function getKey(): Buffer {
  const secret =
    process.env.AI_KEY_ENCRYPTION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'jalayu-insecure-dev-fallback'
  return crypto.createHash('sha256').update(secret).digest()
}

/** Returns "ivHex:tagHex:dataHex". */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  if (!ivHex || !tagHex || !dataHex) throw new Error('Malformed cipher payload')
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8')
}
