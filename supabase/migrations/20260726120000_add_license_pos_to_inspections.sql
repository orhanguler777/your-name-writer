-- İşyeri denetim formuna ruhsat ve POS cihazı bilgisi eklendi
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS license_number TEXT,
  ADD COLUMN IF NOT EXISTS pos_device_number TEXT;
