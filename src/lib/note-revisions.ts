/**
 * Helper for snapshotting note state into note_revisions before an update.
 *
 * Usage:
 *   await snapshotNote(supabase, { noteId, userId, updatedBy: 'ai', source: userPrompt })
 *   // ...then perform the actual UPDATE on the note
 *
 * The helper:
 *   • Reads the current note state
 *   • Inserts a row into note_revisions
 *   • Prunes older revisions beyond MAX_REVISIONS_PER_NOTE
 *   • Silently no-ops if the note doesn't exist or has no content yet
 */
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_REVISIONS_PER_NOTE = 30

export interface SnapshotOptions {
  noteId: string
  userId: string
  updatedBy?: 'user' | 'ai' | 'compose' | 'restore'
  /** Free-form note — e.g., the user prompt that triggered an AI edit */
  source?: string | null
}

export async function snapshotNote(
  supabase: SupabaseClient,
  opts: SnapshotOptions,
): Promise<void> {
  const { data: current, error } = await supabase
    .from('notes')
    .select('content, body_md, attachments')
    .eq('id', opts.noteId)
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (error || !current) return
  // Skip snapshotting empty initial state — no point keeping "nothing"
  if (!current.body_md && !current.content) return

  const { error: insertErr } = await supabase
    .from('note_revisions')
    .insert({
      user_id: opts.userId,
      note_id: opts.noteId,
      content: current.content as string,
      body_md: (current.body_md as string | null) ?? null,
      attachments: current.attachments,
      updated_by: opts.updatedBy ?? 'user',
      source: opts.source ?? null,
    })

  if (insertErr) {
    // Don't fail the calling operation just because history insert failed.
    // Worst case: this update doesn't get history; data is still safe.
    console.warn('[note-revisions] snapshot failed', insertErr)
    return
  }

  // Prune: keep only the most recent MAX_REVISIONS_PER_NOTE rows
  const { data: stale } = await supabase
    .from('note_revisions')
    .select('id')
    .eq('user_id', opts.userId)
    .eq('note_id', opts.noteId)
    .order('created_at', { ascending: false })
    .range(MAX_REVISIONS_PER_NOTE, 999)

  if (stale && stale.length > 0) {
    await supabase
      .from('note_revisions')
      .delete()
      .in('id', stale.map((r) => r.id as string))
  }
}
