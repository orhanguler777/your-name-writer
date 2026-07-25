import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const CreateMessageInput = z.object({
  title: z.string(),
  body: z.string(),
  priority: z.string(),
  createdBy: z.string().uuid(),
  target: z.string(), // "all" or department ID
});

export const createMayorMessageServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CreateMessageInput.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on server." };
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    try {
      // 1. Insert message using Service Role Key to bypass RLS policies
      const { data: msg, error: msgErr } = await adminSupabase
        .from("mayor_daily_messages")
        .insert({
          title: data.title,
          body: data.body,
          priority: data.priority,
          created_by: data.createdBy,
        })
        .select("id")
        .single();

      if (msgErr) throw msgErr;
      if (!msg) throw new Error("Mesaj oluşturulamadı.");

      // 2. Fetch departments to insert targets
      const { data: depts, error: deptErr } = await adminSupabase
        .from("departments")
        .select("id, name");

      if (deptErr) throw deptErr;

      const targets = data.target === "all"
        ? (depts ?? [])
        : (depts ?? []).filter((d) => d.id === data.target);

      if (targets.length > 0) {
        const { error: targetErr } = await adminSupabase
          .from("mayor_daily_message_targets")
          .insert(
            targets.map((d) => ({
              message_id: msg.id,
              department_id: d.id,
            }))
          );

        if (targetErr) throw targetErr;
      }

      return { success: true, messageId: msg.id };
    } catch (e: any) {
      console.error("Server message creation failed:", e);
      return { success: false, error: e.message || String(e) };
    }
  });
