import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Vatandaş–mahalle segmentasyonu.
 *
 * Kaynak, complaints tablosundan trigger ile beslenen citizens ve
 * citizen_neighborhoods tablolarıdır. Bir vatandaş birden çok mahalleye bağlı
 * olabilir; mahalle duyurusu bağlı olduğu her mahalleden gider.
 */

// types.ts üretilmiş dosya olup yeni tabloları henüz tanımıyor.
type Db = {
  from: (t: string) => any;
};

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

export type NeighborhoodSegment = {
  id: string;
  name: string;
  district: string | null;
  citizenCount: number;
};

/** Duyuru hedeflemesi için mahalle listesi ve her mahalledeki vatandaş sayısı. */
export const fetchNeighborhoodSegments = createServerFn({ method: "GET" }).handler(
  async (): Promise<NeighborhoodSegment[]> => {
    const db = await admin();

    const [{ data: hoods }, { data: links }] = await Promise.all([
      db.from("neighborhoods").select("id, name, district").order("name"),
      db.from("citizen_neighborhoods").select("citizen_phone, neighborhood_id").limit(50000),
    ]);

    // Aynı vatandaş bir mahalleye birden çok kez bağlı olmamalı ama yine de tekilleştir.
    const phonesByHood = new Map<string, Set<string>>();
    for (const l of links ?? []) {
      if (!l.neighborhood_id) continue;
      let set = phonesByHood.get(l.neighborhood_id);
      if (!set) {
        set = new Set<string>();
        phonesByHood.set(l.neighborhood_id, set);
      }
      set.add(l.citizen_phone);
    }

    return (hoods ?? []).map((h: any) => ({
      id: h.id,
      name: h.name,
      district: h.district ?? null,
      citizenCount: phonesByHood.get(h.id)?.size ?? 0,
    }));
  },
);

const PhonesInput = z.object({
  neighborhoodIds: z.array(z.string().uuid()).min(1),
});

/** Seçilen mahallelere bağlı vatandaşların tekilleştirilmiş telefon listesi. */
export const fetchPhonesByNeighborhoods = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => PhonesInput.parse(i))
  .handler(async ({ data }): Promise<{ phones: string[] }> => {
    const db = await admin();
    const { data: links } = await db
      .from("citizen_neighborhoods")
      .select("citizen_phone")
      .in("neighborhood_id", data.neighborhoodIds)
      .limit(50000);

    const phones = Array.from(
      new Set((links ?? []).map((l: any) => l.citizen_phone).filter(Boolean)),
    ) as string[];
    return { phones };
  });

/** Vatandaş listesi için telefon → bağlı olduğu mahalleler eşlemesi. */
export const fetchCitizenNeighborhoodMap = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, { id: string; name: string }[]>> => {
    const db = await admin();
    const { data: links } = await db
      .from("citizen_neighborhoods")
      .select("citizen_phone, neighborhood_id, neighborhoods(name)")
      .limit(50000);

    const map: Record<string, { id: string; name: string }[]> = {};
    for (const l of links ?? []) {
      if (!l.citizen_phone || !l.neighborhood_id) continue;
      (map[l.citizen_phone] ||= []).push({
        id: l.neighborhood_id,
        name: l.neighborhoods?.name ?? "—",
      });
    }
    for (const phone of Object.keys(map)) {
      map[phone].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    }
    return map;
  },
);

export type NeighborhoodOverview = {
  id: string;
  name: string;
  district: string | null;
  population: number | null;
  mukhtarName: string | null;
  mukhtarPhone: string | null;
  citizenCount: number;
  complaintCount: number;
  openComplaintCount: number;
  resolvedComplaintCount: number;
  avgSatisfaction: number | null;
};

const OPEN_STATUSES = [
  "yeni",
  "incelemede",
  "personele_atandi",
  "devam_ediyor",
  "vatandas_yaniti_bekleniyor",
];

/** Mahalle kırılımı: her mahallenin vatandaş, şikayet ve memnuniyet özeti. */
export const fetchNeighborhoodOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<NeighborhoodOverview[]> => {
    const db = await admin();

    const [{ data: hoods }, { data: links }, { data: complaints }] = await Promise.all([
      db
        .from("neighborhoods")
        .select("id, name, district, population, mukhtar_name, mukhtar_phone")
        .order("name"),
      db.from("citizen_neighborhoods").select("citizen_phone, neighborhood_id").limit(50000),
      db.from("complaints").select("neighborhood_id, status, satisfaction_score").limit(20000),
    ]);

    const phonesByHood = new Map<string, Set<string>>();
    for (const l of links ?? []) {
      if (!l.neighborhood_id) continue;
      let set = phonesByHood.get(l.neighborhood_id);
      if (!set) {
        set = new Set<string>();
        phonesByHood.set(l.neighborhood_id, set);
      }
      set.add(l.citizen_phone);
    }

    const stats = new Map<
      string,
      { total: number; open: number; resolved: number; satSum: number; satCount: number }
    >();
    for (const c of complaints ?? []) {
      if (!c.neighborhood_id) continue;
      let s = stats.get(c.neighborhood_id);
      if (!s) {
        s = { total: 0, open: 0, resolved: 0, satSum: 0, satCount: 0 };
        stats.set(c.neighborhood_id, s);
      }
      s.total++;
      if (OPEN_STATUSES.includes(c.status)) s.open++;
      if (c.status === "cozuldu") s.resolved++;
      if (c.satisfaction_score !== null && c.satisfaction_score !== undefined) {
        s.satSum += c.satisfaction_score;
        s.satCount++;
      }
    }

    return (hoods ?? []).map((h: any) => {
      const s = stats.get(h.id);
      return {
        id: h.id,
        name: h.name,
        district: h.district ?? null,
        population: h.population ?? null,
        mukhtarName: h.mukhtar_name ?? null,
        mukhtarPhone: h.mukhtar_phone ?? null,
        citizenCount: phonesByHood.get(h.id)?.size ?? 0,
        complaintCount: s?.total ?? 0,
        openComplaintCount: s?.open ?? 0,
        resolvedComplaintCount: s?.resolved ?? 0,
        avgSatisfaction:
          s && s.satCount > 0 ? parseFloat((s.satSum / s.satCount).toFixed(2)) : null,
      };
    });
  },
);

const HoodCitizensInput = z.object({ neighborhoodId: z.string().uuid() });

export type NeighborhoodCitizen = {
  phone: string;
  name: string | null;
  language: string;
  kvkkAccepted: boolean;
  complaintCount: number;
  complaintsHere: number;
  lastSeenAt: string | null;
  isManual: boolean;
};

/** Belirli bir mahalleye bağlı vatandaşların listesi. */
export const fetchNeighborhoodCitizens = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => HoodCitizensInput.parse(i))
  .handler(async ({ data }): Promise<NeighborhoodCitizen[]> => {
    const db = await admin();

    const { data: links } = await db
      .from("citizen_neighborhoods")
      .select("citizen_phone, complaint_count, last_seen_at, is_manual")
      .eq("neighborhood_id", data.neighborhoodId)
      .limit(5000);

    const phones = (links ?? []).map((l: any) => l.citizen_phone);
    if (!phones.length) return [];

    const { data: people } = await db
      .from("citizens")
      .select("phone, name, language, kvkk_accepted, complaint_count")
      .in("phone", phones);

    const byPhone = new Map((people ?? []).map((p: any) => [p.phone, p]));

    return (links ?? [])
      .map((l: any) => {
        const p: any = byPhone.get(l.citizen_phone);
        return {
          phone: l.citizen_phone,
          name: p?.name ?? null,
          language: p?.language ?? "tr",
          kvkkAccepted: !!p?.kvkk_accepted,
          complaintCount: p?.complaint_count ?? 0,
          complaintsHere: l.complaint_count ?? 0,
          lastSeenAt: l.last_seen_at ?? null,
          isManual: !!l.is_manual,
        };
      })
      .sort(
        (a: NeighborhoodCitizen, b: NeighborhoodCitizen) => b.complaintsHere - a.complaintsHere,
      );
  });

const SetInput = z.object({
  phone: z.string().min(3),
  neighborhoodIds: z.array(z.string().uuid()),
});

/**
 * Bir vatandaşın mahallelerini elle düzeltir.
 *
 * Şikayetlerden gelen yanlış/fazla bağları temizlemek için kullanılır: verilen
 * liste nihai hâldir, eksikler eklenir, listede olmayanlar silinir. Elle
 * eklenenler is_manual ile işaretlenir.
 */
export const setCitizenNeighborhoods = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SetInput.parse(i))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();

    // Vatandaş kaydı yoksa (henüz şikayeti işlenmemişse) önce oluştur.
    const { error: upsertErr } = await db
      .from("citizens")
      .upsert({ phone: data.phone }, { onConflict: "phone" });
    if (upsertErr) return { ok: false, error: upsertErr.message };

    const { data: existing } = await db
      .from("citizen_neighborhoods")
      .select("id, neighborhood_id")
      .eq("citizen_phone", data.phone);

    const current = new Set<string>((existing ?? []).map((r: any) => r.neighborhood_id));
    const wanted = new Set(data.neighborhoodIds);

    const toAdd = data.neighborhoodIds.filter((id) => !current.has(id));
    const toRemove = (existing ?? []).filter((r: any) => !wanted.has(r.neighborhood_id));

    if (toAdd.length) {
      const { error } = await db.from("citizen_neighborhoods").insert(
        toAdd.map((neighborhood_id) => ({
          citizen_phone: data.phone,
          neighborhood_id,
          is_manual: true,
        })),
      );
      if (error) return { ok: false, error: error.message };
    }

    if (toRemove.length) {
      const { error } = await db
        .from("citizen_neighborhoods")
        .delete()
        .in(
          "id",
          toRemove.map((r: any) => r.id),
        );
      if (error) return { ok: false, error: error.message };
    }

    return { ok: true };
  });
