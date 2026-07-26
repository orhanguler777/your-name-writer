-- ADIM 2/2 — Şef rolünün varsayılan menü izinleri
-- Şef, müdüre yakın ama daha operasyonel: birim sayfaları + birim analitiği açık,
-- kurum geneli yönetim sayfaları kapalı. İnce ayar RBAC matrisinden yapılabilir.
-- 20260725170000_add_sef_role.sql çalıştırıldıktan SONRA çalışmalıdır.

INSERT INTO public.role_menu_permissions (role, menu_id, allowed)
SELECT 'sef'::public.app_role, m.menu_id, m.allowed
FROM (
  VALUES
    ('panel', TRUE), ('sikayetler', TRUE), ('bilgi-talepleri', TRUE),
    ('cozum-masasi', FALSE), ('zabita-denetim', TRUE), ('zabita-isyerleri', TRUE),
    ('zabita-harita', TRUE), ('tutanak-arsivi', TRUE), ('memnuniyet', FALSE),
    ('baskan-ai-bot', FALSE), ('gunluk-mesajlar', TRUE), ('arac-bakim', TRUE),
    ('personel-analizi', FALSE), ('duyurular', FALSE), ('anketler', FALSE),
    ('vatandaslar', FALSE), ('ayarlar', FALSE)
) AS m(menu_id, allowed)
ON CONFLICT (role, menu_id) DO NOTHING;

-- 'sef' de birim görevlisi sayılır (eski rol adlarıyla yazılmış politikalar için)
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
        OR (_role = 'mudurluk' AND ur.role IN ('mudur', 'sef'))
        OR (_role = 'zabita'   AND ur.role = 'zabita_memuru')
      )
  )
$$;
