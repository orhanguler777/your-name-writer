-- İmzalı denetim tutanağı arşivi: üretilen PDF'in storage URL'si + imza meta bilgisi
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS tutanak_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_by TEXT;
