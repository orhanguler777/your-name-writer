-- ADIM 1/2 — "Şef" kademesi (birim içi ara yönetim)
--
-- Birim içi kademeler:  mudur (Müdür) → sef (Şef) → personel (Görevli)
--
-- NOT: ALTER TYPE ... ADD VALUE aynı işlem içinde kullanılamaz; bu dosya TEK BAŞINA
-- çalıştırılmalı, menü izinleri 2. adımda.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sef';
