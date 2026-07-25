-- ADIM 2/2 — Birim (müdürlük) modülleri
--
-- Rol kademeyi belirler, departman ise hangi ÖZEL MODÜLLERE erişileceğini belirler.
-- Böylece "personel" rolü genel kalır: Zabıta personeli denetim modülünü görür,
-- Fen İşleri personeli görmez — ikisi de aynı 'personel' rolündedir.
-- Bu dosya 20260725160000_add_personel_role.sql çalıştırıldıktan SONRA çalışmalıdır.

-- ── Departmana modül listesi ─────────────────────────────────────────────────
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS modules TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Zabıta Müdürlüğü'ne denetim modülünü tanımla
UPDATE public.departments
SET modules = ARRAY['zabita']
WHERE (name ILIKE '%zabıta%' OR name ILIKE '%zabita%')
  AND NOT ('zabita' = ANY (modules));

-- ── has_role: 'personel' de birim görevlisi sayılır ──────────────────────────
-- (mudurluk/zabita gibi eski adlarla yazılmış politikaların çalışmaya devam etmesi için)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND (
        ur.role = _role
        OR (_role = 'admin'    AND ur.role = 'superuser')
        OR (_role = 'mudurluk' AND ur.role = 'mudur')
        OR (_role = 'zabita'   AND ur.role = 'zabita_memuru')
      )
  )
$$;

-- ── Kullanıcının birimi bu modüle sahip mi? ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.user_has_module(_module TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Üst yönetim her modüle erişir
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'baskan')
    OR EXISTS (
      SELECT 1 FROM public.departments d
      WHERE _module = ANY (d.modules)
        AND (
          -- kendi müdürlüğü (müdür veya personel)
          d.id = public.current_user_department()
          -- ya da başkan yardımcısının bağlı müdürlüğü
          OR (
            public.has_role(auth.uid(), 'baskan_yardimcisi')
            AND d.deputy_mayor_id = public.current_user_deputy()
          )
        )
    )
$$;

-- ── Zabıta denetimleri artık MODÜL üzerinden yetkilendirilir ─────────────────
-- (rol adına değil; böylece 'personel' rolü genel kalabiliyor)
DROP POLICY IF EXISTS "workplace_inspections_select" ON public.workplace_inspections;
CREATE POLICY "workplace_inspections_select" ON public.workplace_inspections
  FOR SELECT TO authenticated
  USING (public.user_has_module('zabita') OR public.has_role(auth.uid(), 'zabita'));

DROP POLICY IF EXISTS "workplace_inspections_insert" ON public.workplace_inspections;
CREATE POLICY "workplace_inspections_insert" ON public.workplace_inspections
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_module('zabita') OR public.has_role(auth.uid(), 'zabita'));

DROP POLICY IF EXISTS "workplace_inspections_update" ON public.workplace_inspections;
CREATE POLICY "workplace_inspections_update" ON public.workplace_inspections
  FOR UPDATE TO authenticated
  USING (public.user_has_module('zabita') OR public.has_role(auth.uid(), 'zabita'));

-- ── Yeni rol için menü izinleri (varsayılan) ─────────────────────────────────
-- personel = saha/birim görevlisi: operasyonel sayfalar açık, yönetim analitiği kapalı.
-- Zabıta sayfalarının yalnız Zabıta biriminde görünmesini modül kontrolü sağlar.
INSERT INTO public.role_menu_permissions (role, menu_id, allowed)
SELECT 'personel'::public.app_role, m.menu_id, m.allowed
FROM (
  VALUES
    ('panel', TRUE), ('sikayetler', FALSE), ('bilgi-talepleri', FALSE),
    ('cozum-masasi', FALSE), ('zabita-denetim', TRUE), ('zabita-isyerleri', TRUE),
    ('zabita-harita', TRUE), ('tutanak-arsivi', TRUE), ('memnuniyet', FALSE),
    ('baskan-ai-bot', FALSE), ('gunluk-mesajlar', TRUE), ('arac-bakim', FALSE),
    ('personel-analizi', FALSE), ('duyurular', FALSE), ('anketler', FALSE),
    ('vatandaslar', FALSE), ('ayarlar', FALSE)
) AS m(menu_id, allowed)
ON CONFLICT (role, menu_id) DO NOTHING;
