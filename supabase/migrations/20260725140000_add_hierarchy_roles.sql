-- ADIM 1/2 — 4 seviyeli yetki hiyerarşisi için yeni rol değerleri
-- NOT: ALTER TYPE ... ADD VALUE, aynı işlem (transaction) içinde kullanılamaz.
-- Bu dosya TEK BAŞINA çalıştırılmalı; politikalar 2. adımda gelir.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superuser';          -- teknik üst yetki (sistem yöneticisi)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'baskan_yardimcisi';  -- 2. seviye: bağlı müdürlükleri görür
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'mudur';              -- 3. seviye: kendi müdürlüğü
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'zabita_memuru';      -- 4. seviye: saha personeli
