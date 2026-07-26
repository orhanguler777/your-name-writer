import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const AssignRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.string(),
  /** Birim (müdürlük) ataması — verilmezse kullanıcının mevcut birimi korunur. */
  departmentId: z.string().uuid().nullable().optional(),
});

export const updateUserRoleServer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssignRoleInput.parse(input))
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "SUPABASE_SERVICE_ROLE_KEY missing on server." };
    }

    const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

    try {
      // Tek kademe = tek rol: önce mevcut rolleri temizle
      const { error: delErr } = await adminSupabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId);
      if (delErr) throw delErr;

      // Rol adı olduğu gibi yazılır. (Eskiden mudur→mudurluk, superuser→admin,
      // zabita_memuru→zabita'ya düşürülüyordu; yeni roller artık enum'da mevcut
      // olduğu için bu dönüşüm sessizce yetki kaybına yol açıyordu.)
      const { error: insErr } = await adminSupabase
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role as any });
      if (insErr) throw insErr;

      // Birim yalnızca AÇIKÇA belirtildiğinde değiştirilir.
      // (Eskiden mudur/zabita_memuru atanınca kullanıcı otomatik Zabıta
      // Müdürlüğü'ne taşınıyordu — diğer müdürlüklerin ataması bozuluyordu.)
      if (data.departmentId !== undefined) {
        const { error: dErr } = await adminSupabase
          .from("profiles")
          .update({ department_id: data.departmentId })
          .eq("id", data.userId);
        if (dErr) throw dErr;
      }

      return { success: true };
    } catch (e: any) {
      console.error("Admin update role failed", e);
      return { success: false, error: e.message || String(e) };
    }
  });
