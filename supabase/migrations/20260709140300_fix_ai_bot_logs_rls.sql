-- RLS politikasını genişlet: ai_bot_logs tablosunu tüm yetkili personel okuyabilsin
-- Eski politikayı kaldır
DROP POLICY IF EXISTS "ai_bot_logs_own_select" ON public.ai_bot_logs;

-- Yeni politika: admin, baskan, cozum_masasi ve mudurluk rolleri tüm kayıtları görebilsin
CREATE POLICY "ai_bot_logs_staff_select" ON public.ai_bot_logs FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'baskan')
  OR public.has_role(auth.uid(), 'cozum_masasi')
  OR public.has_role(auth.uid(), 'mudurluk')
);

-- service_role ile insert edilenlere de izin ver (user_id NULL olabilir)
DROP POLICY IF EXISTS "ai_bot_logs_insert" ON public.ai_bot_logs;
CREATE POLICY "ai_bot_logs_insert_all" ON public.ai_bot_logs FOR INSERT TO authenticated
WITH CHECK (true);

-- service_role zaten RLS'i bypass eder, ama güvenlik için service_role'a da ALL izni verelim
CREATE POLICY "ai_bot_logs_service_all" ON public.ai_bot_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);
