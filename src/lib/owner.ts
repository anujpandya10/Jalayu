/**
 * Owner identity. The owner sees admin-only surfaces (sign-up requests) and is
 * the only one allowed to approve/decline. Defaults to the project owner; can be
 * overridden with NEXT_PUBLIC_OWNER_EMAIL (readable on both client and server).
 */
export const OWNER_EMAIL = (process.env.NEXT_PUBLIC_OWNER_EMAIL || 'anuj.pandya10@gmail.com').toLowerCase()

export function isOwnerEmail(email?: string | null): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL
}
