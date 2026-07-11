-- Trigger: Şikayet durumu 'cozuldu' olduğunda otomatik complaint_responses kaydı oluştur
-- Hata düzeltildi: responder_name sütunu tabloda bulunmadığı için kaldırıldı.

CREATE OR REPLACE FUNCTION notify_complaint_resolved()
RETURNS TRIGGER AS $$
BEGIN
  -- Sadece status 'cozuldu' olarak değiştiğinde tetikle
  IF NEW.status = 'cozuldu' AND (OLD.status IS NULL OR OLD.status != 'cozuldu') THEN
    INSERT INTO complaint_responses (
      complaint_id,
      response_text,
      response_type
    ) VALUES (
      NEW.id,
      'Şikayetiniz başarıyla çözülmüştür. Alanya Belediyesi olarak hizmetlerimizi sürekli iyileştirmeye devam ediyoruz.',
      'durum_bildirimi'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger'ı complaints tablosuna bağla
DROP TRIGGER IF EXISTS trigger_complaint_resolved ON complaints;
CREATE TRIGGER trigger_complaint_resolved
  AFTER UPDATE OF status ON complaints
  FOR EACH ROW
  EXECUTE FUNCTION notify_complaint_resolved();
