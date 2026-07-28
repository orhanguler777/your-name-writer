-- Bot / SLA / kriz / zabıta eşik ayarlarının kalıcı deposu.
--
-- Neden: bu ayarlar şimdiye kadar whatsapp-bot/bot-settings.json dosyasına
-- Node fs ile yazılıyordu. Web uygulaması Cloudflare Workers üzerinde
-- çalıştığı için orada yazılabilir dosya sistemi yok — panelden yapılan
-- değişiklikler canlıda hiç kalıcı olmuyor, kullanıcıya "kaydedildi"
-- dendiği hâlde değer eski kalıyordu.
--
-- Tek satırlı, jsonb kolonlu bir tablo seçildi: mevcut API zaten düz bir
-- {anahtar: değer} nesnesi döndürüyor, key/value tablosu gereksiz karmaşıklık
-- getirirdi. id üzerindeki CHECK ikinci satır eklenmesini engelliyor.

CREATE TABLE IF NOT EXISTS public.app_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.app_settings IS
  'Tek satırlı uygulama ayarları (SLA, kriz, zabıta eşikleri, WhatsApp bot modu). Ayarlar sayfasından yönetilir.';

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL    ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Okuma: panel ve zabıta denetim ekranı eşik değerlerini okuyor.
DROP POLICY IF EXISTS "app_settings_select" ON public.app_settings;
CREATE POLICY "app_settings_select" ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Yazma: yalnızca üst yönetim. has_role 20260725140100_hierarchy_rls'te tanımlı.
DROP POLICY IF EXISTS "app_settings_write" ON public.app_settings;
CREATE POLICY "app_settings_write" ON public.app_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superuser')
    OR public.has_role(auth.uid(), 'baskan')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superuser')
    OR public.has_role(auth.uid(), 'baskan')
  );

-- Mevcut bot-settings.json değerleriyle tohumla: canlıdaki davranış
-- taşınma sırasında değişmesin. Satır zaten varsa dokunulmaz.
INSERT INTO public.app_settings (id, settings)
VALUES (
  1,
  '{
    "selfChatOnly": false,
    "koksalChatOnly": false,
    "slaLimitHours": 800,
    "crisisLimitHours": 1,
    "crisisLimitCount": 3,
    "zabitaInspectionThresholdDays": 30,
    "dedupEnabled": true,
    "dedupWindowHours": 72,
    "voiceReplyEnabled": true,
    "voiceReplyVoice": "nova"
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;
