-- Step 2: Create workplace_inspections table and RLS policies
-- This must run AFTER the 'zabita' enum value is committed

CREATE TABLE IF NOT EXISTS public.workplace_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workplace_name TEXT NOT NULL,
  owner_name TEXT,
  address TEXT,
  inspection_type TEXT NOT NULL,
  checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  inspector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.workplace_inspections ENABLE ROW LEVEL SECURITY;

-- Allow read access to admin and zabita
CREATE POLICY "Allow read access to admin and zabita"
  ON public.workplace_inspections
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'zabita')
    )
  );

-- Allow insert access to admin and zabita
CREATE POLICY "Allow insert access to admin and zabita"
  ON public.workplace_inspections
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'zabita')
    )
  );

-- Allow update access to admin and zabita
CREATE POLICY "Allow update access to admin and zabita"
  ON public.workplace_inspections
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'zabita')
    )
  );
