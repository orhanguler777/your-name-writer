import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

/**
 * Karekodla açılan HALKA AÇIK sayfaların veri kaynağı.
 * Denetim tablosu RLS ile zabıtaya kapalı olduğu için sorgu sunucuda
 * service role ile yapılır; dışarı yalnızca aşağıdaki güvenli alanlar döner.
 * Sahip adı, telefon, vergi bilgisi, notlar ve fotoğraflar ASLA dönmez.
 */

function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const PUBLIC_COLS = "id, workplace_name, address, inspection_type, created_at, penalty_points, recommended_action, signed_at, followup_date, followup_status";

/** Belge numarası mantığı tutanak.ts ile aynı: id'nin ilk 8 hanesi. */
function belgeNo(id: string, createdAt: string) {
  const y = new Date(createdAt).getFullYear();
  return `ZBT-${y}-${id.substring(0, 8).toUpperCase()}`;
}

export const getPublicInspection = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const admin = adminClient();
    if (!admin) return { found: false as const, error: "Servis yapılandırması eksik." };

    const { data: row, error } = await admin
      .from("workplace_inspections")
      .select(PUBLIC_COLS)
      .eq("id", data.id)
      .maybeSingle();

    if (error || !row) return { found: false as const };

    return {
      found: true as const,
      inspection: {
        belgeNo: belgeNo(row.id, row.created_at),
        workplaceName: row.workplace_name,
        address: row.address,
        inspectionType: row.inspection_type,
        createdAt: row.created_at,
        penaltyPoints: row.penalty_points ?? 0,
        recommendedAction: row.recommended_action,
        signedAt: row.signed_at,
      },
    };
  });

export const getPublicWorkplace = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ name: z.string().min(2).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const admin = adminClient();
    if (!admin) return { found: false as const, error: "Servis yapılandırması eksik." };

    const { data: rows, error } = await admin
      .from("workplace_inspections")
      .select(PUBLIC_COLS)
      .ilike("workplace_name", data.name.trim())
      .order("created_at", { ascending: false });

    if (error || !rows || rows.length === 0) return { found: false as const };

    const latest = rows[0];
    return {
      found: true as const,
      workplace: {
        name: latest.workplace_name,
        address: latest.address,
        totalInspections: rows.length,
        lastInspectionAt: latest.created_at,
        lastInspectionType: latest.inspection_type,
        // Vatandaşa puan/yaptırım detayı değil, sade uyum durumu gösterilir
        compliant: (latest.penalty_points ?? 0) === 0,
        followupPending: latest.followup_status === "pending",
        followupDate: latest.followup_date,
      },
    };
  });
