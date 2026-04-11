import { createAdminClient } from "@/lib/supabase/admin";
import type { AuthedAdmin } from "./verify-admin";

/**
 * Log an admin action to the audit trail.
 *
 * Every destructive admin mutation should call this. Non-blocking:
 * if the log insert fails we console.error and continue so the main
 * action isn't blocked.
 */
export async function logAdminAction(params: {
  admin: AuthedAdmin;
  actionType: string;
  targetType?: string;
  targetId?: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string | null;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("admin_actions").insert({
      admin_id: params.admin.dbUserId,
      admin_username: params.admin.username,
      action_type: params.actionType,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      before_value: params.beforeValue === undefined ? null : params.beforeValue,
      after_value: params.afterValue === undefined ? null : params.afterValue,
      reason: params.reason || null,
    });
    if (error) {
      console.error("[admin-actions] log failed:", error);
    }
  } catch (err) {
    console.error("[admin-actions] log fatal:", err);
  }
}
