-- ADIM 2/2 — 4 seviyeli hiyerarşinin RLS'e tanıtılması
-- Seviye 1: baskan / superuser / admin  → her şey
-- Seviye 2: baskan_yardimcisi           → kendine bağlı müdürlükler (departments.deputy_mayor_id)
-- Seviye 3: mudur (eski: mudurluk)      → kendi müdürlüğü
-- Seviye 4: zabita_memuru (eski: zabita)→ operasyonel saha işleri
-- Bu adım, 20260725140000_add_hierarchy_roles.sql çalıştırıldıktan SONRA çalışmalıdır.

-- ── 1) has_role artık hiyerarşik eşdeğerlikleri tanıyor ───────────────────────
-- Böylece mevcut onlarca politika baştan yazılmadan yeni rol adlarıyla çalışır.
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
        -- yeni ad → eski politikaları da karşılar (yetki genişletmez, yalnızca eşler)
        OR (_role = 'admin'    AND ur.role = 'superuser')
        OR (_role = 'mudurluk' AND ur.role = 'mudur')
        OR (_role = 'zabita'   AND ur.role = 'zabita_memuru')
      )
  )
$$;

-- ── 2) Kullanıcının bağlı olduğu başkan yardımcısı ────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_deputy()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT deputy_mayor_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 3) Bir müdürlük, kullanıcının görev kapsamında mı? ────────────────────────
CREATE OR REPLACE FUNCTION public.can_access_department(_dept UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Seviye 1
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'baskan')
    -- Seviye 2: kendine bağlı müdürlükler
    OR (
      public.has_role(auth.uid(), 'baskan_yardimcisi')
      AND _dept IN (
        SELECT d.id FROM public.departments d
        WHERE d.deputy_mayor_id = public.current_user_deputy()
      )
    )
    -- Seviye 3 & 4: kendi müdürlüğü
    OR (
      _dept IS NOT NULL
      AND _dept = public.current_user_department()
      AND (
        public.has_role(auth.uid(), 'mudurluk')
        OR public.has_role(auth.uid(), 'zabita')
        OR public.has_role(auth.uid(), 'cozum_masasi')
      )
    )
$$;

-- ── 4) Şikayetler: başkan yardımcısı kapsamı eklendi ──────────────────────────
DROP POLICY IF EXISTS "complaints_staff_select" ON public.complaints;
CREATE POLICY "complaints_staff_select" ON public.complaints FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'baskan')
  OR public.has_role(auth.uid(), 'cozum_masasi')
  OR public.can_access_department(assigned_department_id)
);

DROP POLICY IF EXISTS "complaints_staff_update" ON public.complaints;
CREATE POLICY "complaints_staff_update" ON public.complaints FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'baskan')
  OR public.has_role(auth.uid(), 'cozum_masasi')
  OR public.can_access_department(assigned_department_id)
);

-- ── 5) Zabıta denetimleri: üst yönetim + zabıta kadrosu ───────────────────────
DROP POLICY IF EXISTS "Allow read access to admin and zabita" ON public.workplace_inspections;
DROP POLICY IF EXISTS "Allow insert access to admin and zabita" ON public.workplace_inspections;
DROP POLICY IF EXISTS "Allow update access to admin and zabita" ON public.workplace_inspections;

-- Aşağıdaki adlar canlıda elle oluşturulmuş olabilir; CREATE tek başına
-- "already exists" ile patlayıp migration'ı geri alıyordu.
DROP POLICY IF EXISTS "workplace_inspections_select" ON public.workplace_inspections;
DROP POLICY IF EXISTS "workplace_inspections_insert" ON public.workplace_inspections;
DROP POLICY IF EXISTS "workplace_inspections_update" ON public.workplace_inspections;

CREATE POLICY "workplace_inspections_select" ON public.workplace_inspections FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'baskan')
  OR public.has_role(auth.uid(), 'zabita')          -- zabita_memuru da bunu karşılar
  OR public.has_role(auth.uid(), 'baskan_yardimcisi')
  OR (
    public.has_role(auth.uid(), 'mudurluk')          -- mudur da bunu karşılar
    AND public.current_user_department() IN (
      SELECT id FROM public.departments WHERE name ILIKE '%zabıta%' OR name ILIKE '%zabita%'
    )
  )
);

CREATE POLICY "workplace_inspections_insert" ON public.workplace_inspections FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'zabita')
  OR (
    public.has_role(auth.uid(), 'mudurluk')
    AND public.current_user_department() IN (
      SELECT id FROM public.departments WHERE name ILIKE '%zabıta%' OR name ILIKE '%zabita%'
    )
  )
);

CREATE POLICY "workplace_inspections_update" ON public.workplace_inspections FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'zabita')
  OR (
    public.has_role(auth.uid(), 'mudurluk')
    AND public.current_user_department() IN (
      SELECT id FROM public.departments WHERE name ILIKE '%zabıta%' OR name ILIKE '%zabita%'
    )
  )
);
