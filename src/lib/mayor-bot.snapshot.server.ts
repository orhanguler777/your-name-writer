// Başkan AI Bot için belediye veri anlık görüntüsü.
// Tüm modüllerden (şikayet, memnuniyet, personel, araç, zabıta, anket, duyuru, etkinlik)
// derli toplu bir özet üretir ve 60 saniye boyunca bellekte tutar.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CACHE_TTL_MS = 60_000;
let cache: { at: number; value: Snapshot } | null = null;

export type Snapshot = {
  context: string;
  facts: {
    total: number;
    byNbr: Record<string, number>;
    byDept: Record<string, number>;
    deptAvg: Record<string, number>;
    inMaintenance: string[];
    avgSatisfactionScore: number;
    satisfactionRate: number;
    resolutionRate: number;
  };
};

export async function getMayorSnapshot(nowMs: number): Promise<Snapshot> {
  if (cache && nowMs - cache.at < CACHE_TTL_MS) return cache.value;
  const value = await buildSnapshot(nowMs);
  cache = { at: nowMs, value };
  return value;
}

// types.ts üretilmiş dosya ve şemanın gerisinde kaldığı için (events, mukhtar_*) gevşek tip kullanıyoruz.
const db = () => supabaseAdmin as any;

async function buildSnapshot(nowMs: number): Promise<Snapshot> {
  const now = new Date(nowMs);
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => new Date(nowMs - n * 864e5);

  const OPEN_STATUSES = [
    "yeni",
    "incelemede",
    "personele_atandi",
    "devam_ediyor",
    "vatandas_yaniti_bekleniyor",
  ];

  const [
    complaintsRes,
    deptsRes,
    nbrsRes,
    vehiclesRes,
    attendanceRes,
    openComplaintsRes,
    personnelRes,
    responsesRes,
    inspectionsRes,
    announcementsRes,
    eventsRes,
    pollsRes,
    dailyMsgRes,
  ] = await Promise.all([
    db()
      .from("complaints")
      .select(
        "id, category, ai_category, status, priority, source, satisfaction_score, complaint_text, created_at, resolved_at, updated_at, assigned_department_id, assigned_personnel_id, neighborhood_id, wants_human_representative, neighborhoods(name, population), departments!complaints_assigned_department_id_fkey(name)",
      )
      .order("created_at", { ascending: false })
      .limit(2000),
    db()
      .from("departments")
      .select(
        "id, name, responsible_person_name, responsible_person_phone, deputy_mayors(full_name, phone)",
      ),
    db()
      .from("neighborhoods")
      .select("id, name, district, population, mukhtar_name, mukhtar_phone"),
    db()
      .from("vehicles")
      .select(
        "plate_number, vehicle_type, status, maintenance_start_date, estimated_return_date, maintenance_reason, notes, departments(name)",
      ),
    db()
      .from("personnel_attendance")
      .select(
        "date, is_late, has_overtime, missing_checkout, check_in_time, check_out_time, personnel(full_name, department_id, departments(name))",
      )
      .gte("date", iso(daysAgo(30)).slice(0, 10))
      .limit(3000),
    db()
      .from("complaints")
      .select(
        "id, complaint_text, category, priority, status, created_at, neighborhoods(name), departments!complaints_assigned_department_id_fkey(name)",
      )
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: true })
      .limit(80),
    db().from("personnel").select("full_name, title, is_active, departments(name)"),
    db()
      .from("complaint_responses")
      .select("complaint_id, response_type, created_at")
      .order("created_at", { ascending: true })
      .limit(3000),
    db()
      .from("workplace_inspections")
      .select(
        "id, workplace_name, inspection_type, penalty_points, recommended_action, followup_date, followup_status, created_at, address",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    db()
      .from("announcements")
      .select("title, description, start_date, end_date, sent_at")
      .order("created_at", { ascending: false })
      .limit(30),
    db().from("events").select("title, start_date, end_date, description").limit(60),
    db()
      .from("polls")
      .select(
        "id, title, question, status, sent_to_whatsapp, created_at, poll_options(id, option_text)",
      )
      .order("created_at", { ascending: false })
      .limit(20),
    db()
      .from("mayor_daily_messages")
      .select("title, body, priority, send_date")
      .order("send_date", { ascending: false })
      .limit(15),
  ]);

  const complaints: any[] = complaintsRes.data ?? [];
  const depts: any[] = deptsRes.data ?? [];
  const nbrs: any[] = nbrsRes.data ?? [];
  const vehicles: any[] = vehiclesRes.data ?? [];
  const attendance: any[] = attendanceRes.data ?? [];
  const openComplaints: any[] = openComplaintsRes.data ?? [];
  const personnel: any[] = personnelRes.data ?? [];
  const responses: any[] = responsesRes.data ?? [];
  const inspections: any[] = inspectionsRes.data ?? [];
  const announcements: any[] = announcementsRes.data ?? [];
  const events: any[] = eventsRes.data ?? [];
  const polls: any[] = pollsRes.data ?? [];
  const dailyMsgs: any[] = dailyMsgRes.data ?? [];

  // Anket oyları (poll_votes ayrı sorgu — yalnızca mevcut anketler için)
  let voteRows: any[] = [];
  if (polls.length) {
    const vr = await db()
      .from("poll_votes")
      .select("poll_id, option_id")
      .in(
        "poll_id",
        polls.map((p) => p.id),
      )
      .limit(20000);
    voteRows = vr.data ?? [];
  }

  /* ---------------- ŞİKAYETLER ---------------- */
  const total = complaints.length;
  const byNbr = tally(complaints, (c) => c.neighborhoods?.name);
  const byDept = tally(complaints, (c) => c.departments?.name);
  const byStatus = tally(complaints, (c) => c.status);
  const byCategory = tally(complaints, (c) => c.category);
  const byPriority = tally(complaints, (c) => c.priority);
  const bySource = tally(complaints, (c) => c.source);

  const resolved = complaints.filter((c) => c.status === "cozuldu");
  const openList = complaints.filter((c) => OPEN_STATUSES.includes(c.status));
  const resolutionRate = total > 0 ? (resolved.length / total) * 100 : 0;

  // Zaman serisi: son 6 ay, aylık geliş/çözülme
  const monthly: Record<string, { geldi: number; cozuldu: number }> = {};
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthly[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = {
      geldi: 0,
      cozuldu: 0,
    };
  }
  const monthKey = (s: string) => s.slice(0, 7);
  complaints.forEach((c) => {
    const k = monthKey(c.created_at);
    if (monthly[k]) monthly[k].geldi++;
    if (c.resolved_at && monthly[monthKey(c.resolved_at)])
      monthly[monthKey(c.resolved_at)].cozuldu++;
  });

  const last7 = complaints.filter((c) => new Date(c.created_at) >= daysAgo(7)).length;
  const prev7 = complaints.filter(
    (c) => new Date(c.created_at) >= daysAgo(14) && new Date(c.created_at) < daysAgo(7),
  ).length;
  const last30 = complaints.filter((c) => new Date(c.created_at) >= daysAgo(30)).length;

  // Çözüm süresi (müdürlük ve kategori bazında, saat)
  const deptAvg = avgBy(resolved, (c) => c.departments?.name, resolutionHours);
  const catAvg = avgBy(resolved, (c) => c.category, resolutionHours);

  // İlk yanıt süresi (saat) — complaint_responses üzerinden
  const firstResponseAt: Record<string, string> = {};
  responses.forEach((r) => {
    if (!firstResponseAt[r.complaint_id]) firstResponseAt[r.complaint_id] = r.created_at;
  });
  const responseCount = tally(responses, (r) => r.complaint_id);
  const firstRespHours = avgBy(
    complaints.filter((c) => firstResponseAt[c.id]),
    (c) => c.departments?.name,
    (c) => (new Date(firstResponseAt[c.id]).getTime() - new Date(c.created_at).getTime()) / 36e5,
  );
  const noResponseOpen = openList.filter((c) => !responseCount[c.id]);

  // Yaşlanma / SLA riski
  const ageDays = (c: any) => (nowMs - new Date(c.created_at).getTime()) / 864e5;
  const aging = {
    "0-3 gün": openList.filter((c) => ageDays(c) < 3).length,
    "3-7 gün": openList.filter((c) => ageDays(c) >= 3 && ageDays(c) < 7).length,
    "7-15 gün": openList.filter((c) => ageDays(c) >= 7 && ageDays(c) < 15).length,
    "15-30 gün": openList.filter((c) => ageDays(c) >= 15 && ageDays(c) < 30).length,
    "30+ gün": openList.filter((c) => ageDays(c) >= 30).length,
  };
  const overdue = openList
    .filter((c) => ageDays(c) >= 7)
    .sort((a, b) => ageDays(b) - ageDays(a))
    .slice(0, 25);
  const criticalOpen = openList.filter((c) => c.priority === "acil" || c.priority === "yuksek");
  const overdueByDept = tally(
    openList.filter((c) => ageDays(c) >= 7),
    (c) => c.departments?.name,
  );

  const unassigned = openList.filter((c) => !c.assigned_department_id).length;
  const noPersonnel = openList.filter(
    (c) => c.assigned_department_id && !c.assigned_personnel_id,
  ).length;
  const wantsHuman = complaints.filter((c) => c.wants_human_representative).length;
  const aiMismatch = complaints.filter(
    (c) => c.ai_category && c.category && c.ai_category !== c.category,
  ).length;

  /* ---------------- MEMNUNİYET ---------------- */
  const rated = complaints.filter(
    (c) => c.satisfaction_score !== null && c.satisfaction_score !== undefined,
  );
  const totalRated = rated.length;
  const avgSatisfactionScore =
    totalRated > 0 ? rated.reduce((a, c) => a + (c.satisfaction_score || 0), 0) / totalRated : 0;
  const happyCount = rated.filter((c) => (c.satisfaction_score || 0) >= 4).length;
  const unhappyCount = rated.filter((c) => (c.satisfaction_score || 0) <= 2).length;
  const satisfactionRate = totalRated > 0 ? (happyCount / totalRated) * 100 : 0;
  const surveyResponseRate = resolved.length > 0 ? (totalRated / resolved.length) * 100 : 0;
  const starDist = tally(rated, (c) => `${c.satisfaction_score} yıldız`);

  const deptSatAvg = avgBy(
    rated,
    (c) => c.departments?.name,
    (c) => c.satisfaction_score || 0,
  );
  const deptSatCount = tally(rated, (c) => c.departments?.name);
  const nbrSatAvg = avgBy(
    rated,
    (c) => c.neighborhoods?.name,
    (c) => c.satisfaction_score || 0,
  );
  const nbrSatCount = tally(rated, (c) => c.neighborhoods?.name);
  const catSatAvg = avgBy(
    rated,
    (c) => c.category,
    (c) => c.satisfaction_score || 0,
  );

  /* ---------------- MAHALLE / NÜFUS ---------------- */
  const popByName: Record<string, number> = {};
  nbrs.forEach((n) => {
    if (n.population) popByName[n.name] = n.population;
  });
  const per1000: Record<string, number> = {};
  Object.entries(byNbr).forEach(([name, cnt]) => {
    const pop = popByName[name];
    if (pop && pop > 0) per1000[name] = round(((cnt as number) / pop) * 1000, 2);
  });
  const mukhtarsList = nbrs
    .filter((n) => n.mukhtar_name)
    .map((n) => `${n.name}: ${n.mukhtar_name} (${n.mukhtar_phone || "—"})`)
    .join(", ");

  // Risk sinyali: şikayet çok + memnuniyet düşük mahalleler
  const riskNbrs = Object.entries(byNbr)
    .filter(([name, cnt]) => (cnt as number) >= 3 && nbrSatAvg[name] !== undefined)
    .map(([name, cnt]) => ({ name, sikayet: cnt as number, puan: nbrSatAvg[name] }))
    .sort((a, b) => a.puan - b.puan || b.sikayet - a.sikayet)
    .slice(0, 10);

  /* ---------------- ARAÇLAR ---------------- */
  const vehicleByStatus = tally(vehicles, (v) => v.status);
  const inMaintenance = vehicles
    .filter((v) => v.status === "bakimda")
    .map((v) => {
      const since = v.maintenance_start_date
        ? Math.round((nowMs - new Date(v.maintenance_start_date).getTime()) / 864e5)
        : null;
      return `${v.plate_number} (${v.departments?.name ?? "—"}, ${v.vehicle_type ?? "araç"}, sebep: ${
        v.maintenance_reason ?? "—"
      }${since !== null ? `, ${since} gündür bakımda` : ""}${
        v.estimated_return_date ? `, tahmini dönüş: ${v.estimated_return_date}` : ""
      })`;
    });
  const overdueVehicles = vehicles
    .filter(
      (v) =>
        v.status === "bakimda" &&
        v.estimated_return_date &&
        new Date(v.estimated_return_date) < now,
    )
    .map((v) => `${v.plate_number} (tahmini dönüş ${v.estimated_return_date} geçti)`);
  const vehiclesByDept = tally(vehicles, (v) => v.departments?.name);

  /* ---------------- PERSONEL / DEVAMSIZLIK ---------------- */
  const personnelByDept = tally(
    personnel.filter((p) => p.is_active !== false),
    (p) => p.departments?.name,
  );
  const activePersonnel = personnel.filter((p) => p.is_active !== false).length;
  const attDays = new Set(attendance.map((a) => a.date)).size;
  const lateByDept = tally(
    attendance.filter((a) => a.is_late),
    (a) => a.personnel?.departments?.name,
  );
  const overtimeByDept = tally(
    attendance.filter((a) => a.has_overtime),
    (a) => a.personnel?.departments?.name,
  );
  const missingCheckoutByDept = tally(
    attendance.filter((a) => a.missing_checkout),
    (a) => a.personnel?.departments?.name,
  );
  const lateByPerson = topN(
    tally(
      attendance.filter((a) => a.is_late),
      (a) => a.personnel?.full_name,
    ),
    10,
  );
  const overtimeByPerson = topN(
    tally(
      attendance.filter((a) => a.has_overtime),
      (a) => a.personnel?.full_name,
    ),
    10,
  );

  /* ---------------- ZABITA DENETİMLERİ ---------------- */
  const inspByType = tally(inspections, (i) => i.inspection_type);
  const inspLast30 = inspections.filter((i) => new Date(i.created_at) >= daysAgo(30)).length;
  const inspByAction = tally(inspections, (i) => i.recommended_action);
  const penaltyTotal = inspections.reduce((a, i) => a + (i.penalty_points || 0), 0);
  const highRiskWorkplaces = inspections
    .filter((i) => (i.penalty_points || 0) > 0)
    .sort((a, b) => (b.penalty_points || 0) - (a.penalty_points || 0))
    .slice(0, 12)
    .map(
      (i) =>
        `${i.workplace_name} (${i.inspection_type}, ${i.penalty_points} ceza puanı, ${String(
          i.created_at,
        ).slice(0, 10)})`,
    );
  const followupPending = inspections.filter(
    (i) => i.followup_date && i.followup_status !== "tamamlandi",
  );
  const followupOverdue = followupPending
    .filter((i) => new Date(i.followup_date) < now)
    .map((i) => `${i.workplace_name} (takip tarihi ${i.followup_date} geçti)`);

  /* ---------------- DUYURU / ETKİNLİK / ANKET ---------------- */
  const activeAnnouncements = announcements
    .filter((a) => !a.end_date || new Date(a.end_date) >= now)
    .slice(0, 12)
    .map(
      (a) =>
        `${a.title}${a.start_date ? ` (${a.start_date}${a.end_date ? ` → ${a.end_date}` : ""})` : ""}${
          a.sent_at ? " [WhatsApp gönderildi]" : " [gönderilmedi]"
        }`,
    );
  const upcomingEvents = events
    .filter((e) => new Date(e.end_date) >= now)
    .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
    .slice(0, 15)
    .map((e) => `${e.title} (${e.start_date} → ${e.end_date})`);
  const ongoingEvents = events
    .filter((e) => new Date(e.start_date) <= now && new Date(e.end_date) >= now)
    .map((e) => `${e.title} (${e.start_date} → ${e.end_date})`);

  const votesByOption = tally(voteRows, (v) => v.option_id);
  const votesByPoll = tally(voteRows, (v) => v.poll_id);
  const pollSummaries = polls.slice(0, 8).map((p) => {
    const totalVotes = votesByPoll[p.id] ?? 0;
    const opts = (p.poll_options ?? []).map((o: any) => {
      const v = votesByOption[o.id] ?? 0;
      const pct = totalVotes > 0 ? round((v / totalVotes) * 100, 1) : 0;
      return `${o.option_text}: ${v} oy (%${pct})`;
    });
    return `"${p.title}" — ${p.question} | durum: ${p.status}, toplam ${totalVotes} oy | ${
      opts.join(" ; ") || "seçenek yok"
    }`;
  });

  const recentDailyMsgs = dailyMsgs
    .slice(0, 8)
    .map((m) => `${m.send_date ?? "—"} [${m.priority ?? "normal"}] ${m.title}`);

  /* ---------------- AÇIK ŞİKAYET LİSTESİ ---------------- */
  const openIssues = openComplaints
    .map(
      (c) =>
        `[ID: ${c.id}] ${Math.round(
          (nowMs - new Date(c.created_at).getTime()) / 864e5,
        )} gün önce | Mahalle: ${c.neighborhoods?.name ?? "Bilinmiyor"} | Müdürlük: ${
          c.departments?.name ?? "atanmadı"
        } | Kategori: ${c.category ?? "—"} | Öncelik: ${c.priority ?? "—"} | Durum: ${
          c.status
        } | Metin: ${String(c.complaint_text).slice(0, 220)}`,
    )
    .join("\n");

  const overdueIssues = overdue
    .map(
      (c) =>
        `[ID: ${c.id}] ${Math.round(ageDays(c))} gündür açık | ${
          c.neighborhoods?.name ?? "—"
        } | ${c.departments?.name ?? "atanmadı"} | ${c.category ?? "—"} | ${String(
          c.complaint_text,
        ).slice(0, 160)}`,
    )
    .join("\n");

  const deptDirectory = depts
    .map(
      (d) =>
        `${d.name} — sorumlu: ${d.responsible_person_name ?? "—"} (${
          d.responsible_person_phone ?? "—"
        }), bağlı başkan yardımcısı: ${d.deputy_mayors?.full_name ?? "—"}`,
    )
    .join("\n");

  const context = `
=== GENEL DURUM (rapor tarihi: ${iso(now).slice(0, 10)}) ===
- Toplam şikayet kaydı: ${total}
- Çözülen: ${resolved.length} | Açık: ${openList.length} | Çözüm oranı: %${round(resolutionRate, 1)}
- Son 7 gün: ${last7} yeni şikayet (önceki 7 gün: ${prev7}, değişim: ${
    prev7 > 0 ? (last7 >= prev7 ? "+" : "") + round(((last7 - prev7) / prev7) * 100, 1) + "%" : "—"
  })
- Son 30 gün: ${last30} yeni şikayet
- Aylık trend (geldi/çözüldü): ${JSON.stringify(monthly)}
- Durum dağılımı: ${JSON.stringify(byStatus)}
- Öncelik dağılımı: ${JSON.stringify(byPriority)}
- Kategori dağılımı: ${JSON.stringify(byCategory)}
- Geliş kanalı dağılımı: ${JSON.stringify(bySource)}
- Temsilci talep eden vatandaş sayısı: ${wantsHuman}
- AI kategorisi ile nihai kategorinin uyuşmadığı kayıt: ${aiMismatch}

=== MÜDÜRLÜK PERFORMANSI ===
- Müdürlük bazında şikayet: ${JSON.stringify(byDept)}
- Müdürlük ortalama çözüm süresi (saat): ${JSON.stringify(deptAvg)}
- Müdürlük ortalama İLK YANIT süresi (saat): ${JSON.stringify(firstRespHours)}
- Kategori ortalama çözüm süresi (saat): ${JSON.stringify(catAvg)}
- 7 günden uzun süredir açık şikayetlerin müdürlük dağılımı: ${JSON.stringify(overdueByDept)}
- Müdürlük rehberi:
${deptDirectory}

=== SLA / GECİKME RİSKİ ===
- Açık şikayetlerin yaşlanma dağılımı: ${JSON.stringify(aging)}
- Acil/yüksek öncelikli açık şikayet: ${criticalOpen.length}
- Hiç yanıt yazılmamış açık şikayet: ${noResponseOpen.length}
- Müdürlüğe atanmamış açık şikayet: ${unassigned}
- Müdürlüğe atanmış ama personele atanmamış: ${noPersonnel}

=== MEMNUNİYET ANKETİ (çözülen şikayet sonrası WhatsApp'tan 1-5 yıldız) ===
- Puanlanan şikayet sayısı: ${totalRated} (çözülenlerin %${round(surveyResponseRate, 1)}'i yanıt verdi)
- Ortalama puan: ${round(avgSatisfactionScore, 2)} / 5.0
- Mutlu vatandaş oranı (4-5 yıldız): %${round(satisfactionRate, 1)} | Mutsuz (1-2 yıldız): ${unhappyCount} kişi
- Yıldız dağılımı: ${JSON.stringify(starDist)}
- Müdürlüklere göre ortalama puan: ${JSON.stringify(deptSatAvg)} (oy sayıları: ${JSON.stringify(
    deptSatCount,
  )})
- Mahallelere göre ortalama puan: ${JSON.stringify(nbrSatAvg)} (oy sayıları: ${JSON.stringify(
    nbrSatCount,
  )})
- Kategorilere göre ortalama puan: ${JSON.stringify(catSatAvg)}

=== MAHALLELER ===
- Mahalle bazında şikayet: ${JSON.stringify(byNbr)}
- Nüfusa göre 1000 kişi başına şikayet: ${JSON.stringify(per1000)}
- Şikayeti yoğun + memnuniyeti düşük riskli mahalleler: ${JSON.stringify(riskNbrs)}
- Muhtarlar: ${mukhtarsList || "kayıt yok"}

=== ARAÇ FİLOSU ===
- Durum dağılımı: ${JSON.stringify(vehicleByStatus)}
- Müdürlüklere göre araç sayısı: ${JSON.stringify(vehiclesByDept)}
- Bakımdaki araçlar: ${inMaintenance.join(" ; ") || "yok"}
- Tahmini dönüş tarihi geçmiş araçlar: ${overdueVehicles.join(" ; ") || "yok"}

=== PERSONEL (son ${attDays} günün puantajı) ===
- Aktif personel: ${activePersonnel} | Müdürlüklere göre: ${JSON.stringify(personnelByDept)}
- Geç giriş (müdürlük): ${JSON.stringify(lateByDept)}
- Fazla mesai (müdürlük): ${JSON.stringify(overtimeByDept)}
- Çıkış kaydı eksik (müdürlük): ${JSON.stringify(missingCheckoutByDept)}
- En çok geç kalan personel: ${JSON.stringify(lateByPerson)}
- En çok fazla mesai yapan personel: ${JSON.stringify(overtimeByPerson)}

=== ZABITA / İŞYERİ DENETİMLERİ ===
- Toplam denetim kaydı: ${inspections.length} (son 30 gün: ${inspLast30})
- Denetim türü dağılımı: ${JSON.stringify(inspByType)}
- Önerilen işlem dağılımı: ${JSON.stringify(inspByAction)}
- Toplam ceza puanı: ${penaltyTotal}
- En yüksek ceza puanlı işyerleri: ${highRiskWorkplaces.join(" ; ") || "yok"}
- Bekleyen takip denetimi: ${followupPending.length} | Tarihi geçmiş takipler: ${
    followupOverdue.join(" ; ") || "yok"
  }

=== DUYURULAR / ETKİNLİKLER / ANKETLER ===
- Aktif ve yaklaşan duyurular: ${activeAnnouncements.join(" ; ") || "yok"}
- Şu an devam eden etkinlikler: ${ongoingEvents.join(" ; ") || "yok"}
- Yaklaşan etkinlikler: ${upcomingEvents.join(" ; ") || "yok"}
- Vatandaş anketleri ve sonuçları:
${pollSummaries.join("\n") || "anket yok"}
- Son günlük başkan mesajları: ${recentDailyMsgs.join(" ; ") || "yok"}

=== 7 GÜNDEN UZUN SÜREDİR AÇIK OLAN ŞİKAYETLER (gecikme sorularında bunu kullan) ===
${overdueIssues || "yok"}

=== AÇIK (ÇÖZÜLMEMİŞ) ŞİKAYETLER — EN ESKİDEN YENİYE ===
${openIssues || "yok"}
`.trim();

  return {
    context,
    facts: {
      total,
      byNbr: byNbr as Record<string, number>,
      byDept: byDept as Record<string, number>,
      deptAvg,
      inMaintenance,
      avgSatisfactionScore,
      satisfactionRate,
      resolutionRate,
    },
  };
}

function resolutionHours(c: any): number {
  return (new Date(c.resolved_at).getTime() - new Date(c.created_at).getTime()) / 36e5;
}

function tally<T>(arr: T[], key: (x: T) => string | undefined | null): Record<string, number> {
  return arr.reduce(
    (acc, x) => {
      const k = key(x);
      if (!k) return acc;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

function avgBy<T>(
  arr: T[],
  key: (x: T) => string | undefined | null,
  value: (x: T) => number,
): Record<string, number> {
  const sum: Record<string, number> = {};
  const cnt: Record<string, number> = {};
  arr.forEach((x) => {
    const k = key(x);
    const v = value(x);
    if (!k || !Number.isFinite(v)) return;
    sum[k] = (sum[k] ?? 0) + v;
    cnt[k] = (cnt[k] ?? 0) + 1;
  });
  const out: Record<string, number> = {};
  Object.keys(cnt).forEach((k) => {
    out[k] = round(sum[k] / cnt[k], 2);
  });
  return out;
}

function topN(rec: Record<string, number>, n: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(rec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n),
  );
}

function round(n: number, d: number): number {
  return parseFloat(n.toFixed(d));
}
