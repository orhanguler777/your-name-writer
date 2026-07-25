-- Rol & Menü yetki matrisi — artık tarayıcı localStorage'ı yerine veritabanında.
-- Böylece bir yöneticinin yaptığı değişiklik TÜM cihazlarda (100'lerce saha telefonu dahil) geçerli olur.

CREATE TABLE IF NOT EXISTS public.role_menu_permissions (
  role       public.app_role NOT NULL,
  menu_id    TEXT NOT NULL,
  allowed    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (role, menu_id)
);

GRANT SELECT ON public.role_menu_permissions TO authenticated;
GRANT ALL    ON public.role_menu_permissions TO service_role;
ALTER TABLE public.role_menu_permissions ENABLE ROW LEVEL SECURITY;

-- Her oturum açmış kullanıcı matrisi okuyabilir (kendi menüsünü hesaplayabilmesi için).
DROP POLICY IF EXISTS "role_menu_permissions_select" ON public.role_menu_permissions;
CREATE POLICY "role_menu_permissions_select" ON public.role_menu_permissions
  FOR SELECT TO authenticated USING (TRUE);

-- Yalnızca üst yönetim değiştirebilir.
DROP POLICY IF EXISTS "role_menu_permissions_write" ON public.role_menu_permissions;
CREATE POLICY "role_menu_permissions_write" ON public.role_menu_permissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  );

-- ── Varsayılan matrisi doldur (mevcut satırlara dokunmaz) ────────────────────
INSERT INTO public.role_menu_permissions (role, menu_id, allowed)
SELECT r.role,
       m.menu_id,
       (r.role = 'superuser' OR r.role::text = ANY (m.roles))
FROM (
  VALUES
    ('panel',            ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin','cozum_masasi','mudurluk','zabita_memuru','zabita']),
    ('sikayetler',       ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin','cozum_masasi','mudurluk']),
    ('bilgi-talepleri',  ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin','cozum_masasi','mudurluk']),
    ('cozum-masasi',     ARRAY['superuser','baskan','admin','cozum_masasi']),
    ('zabita-denetim',   ARRAY['superuser','mudur','zabita_memuru','zabita']),
    ('zabita-isyerleri', ARRAY['superuser','baskan_yardimcisi','mudur','zabita_memuru','zabita']),
    ('zabita-harita',    ARRAY['superuser','baskan','baskan_yardimcisi','mudur','zabita_memuru','zabita']),
    ('tutanak-arsivi',   ARRAY['superuser','baskan_yardimcisi','mudur','zabita_memuru','zabita']),
    ('memnuniyet',       ARRAY['superuser','baskan','admin','cozum_masasi']),
    ('baskan-ai-bot',    ARRAY['superuser','baskan']),
    ('gunluk-mesajlar',  ARRAY['superuser','baskan','admin','mudur','mudurluk','zabita_memuru','zabita']),
    ('arac-bakim',       ARRAY['superuser','baskan_yardimcisi','mudur','admin','mudurluk']),
    ('personel-analizi', ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin']),
    ('duyurular',        ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin','cozum_masasi']),
    ('anketler',         ARRAY['superuser','baskan','baskan_yardimcisi','mudur','admin']),
    ('vatandaslar',      ARRAY['superuser','baskan','baskan_yardimcisi','admin','cozum_masasi']),
    ('ayarlar',          ARRAY['superuser','baskan','admin'])
) AS m(menu_id, roles)
CROSS JOIN (SELECT unnest(enum_range(NULL::public.app_role)) AS role) AS r
ON CONFLICT (role, menu_id) DO NOTHING;
