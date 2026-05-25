// Safe audit log writer. Uses the authenticated user's Supabase client so it
// works without SUPABASE_SERVICE_ROLE_KEY (RLS policy on audit_logs already
// allows auth.uid() = user_id inserts). Never throws — failures are logged
// to the server console but never bubble up to the user, so a logging hiccup
// can't break an action that already succeeded.
import type { SupabaseClient } from "@supabase/supabase-js";

interface AuditLogEntry {
  user_id: string;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function safeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_logs").insert(entry);
    if (error) {
      console.warn("[audit_log] insert failed:", error.message, entry.action);
    }
  } catch (e) {
    console.warn("[audit_log] insert threw:", e, entry.action);
  }
}
