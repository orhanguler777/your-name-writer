import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const AssignRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.string(),
});

export const updateUserRoleServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssignRoleInput.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      // Fallback: try updating using standard client if service role key is missing
      return { success: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on server." };
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    try {
      // 1. Delete existing roles
      const { error: delErr } = await adminSupabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId);

      if (delErr) throw delErr;

      // 2. Map role name to DB expected value
      const dbRole = data.role === "superuser" ? "admin" : data.role === "zabita_memuru" ? "zabita" : data.role === "mudur" ? "mudurluk" : data.role;

      // 3. Insert new role via Service Role (bypassing RLS)
      const { error: insErr } = await adminSupabase
        .from("user_roles")
        .insert({
          user_id: data.userId,
          role: dbRole as any,
        });

      if (insErr) throw insErr;

      // 4. If assigning Zabıta or Müdür, automatically assign department_id if needed
      if (data.role === "zabita_memuru" || data.role === "mudur") {
        const { data: depts } = await adminSupabase.from("departments").select("id, name");
        const zabitaDept = depts?.find((d) => d.name.toLowerCase().includes("zabıta"));
        if (zabitaDept) {
          await adminSupabase.from("profiles").update({ department_id: zabitaDept.id }).eq("id", data.userId);
        }
      }

      return { success: true };
    } catch (e: any) {
      console.error("Admin update role failed", e);
      return { success: false, error: e.message || String(e) };
    }
  });
