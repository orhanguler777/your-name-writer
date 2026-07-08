
-- ========== ENUMS ==========
CREATE TYPE public.app_role AS ENUM ('vatandas', 'cozum_masasi', 'mudurluk', 'baskan', 'admin');

-- ========== DEPUTY MAYORS ==========
CREATE TABLE public.deputy_mayors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deputy_mayors TO authenticated;
GRANT ALL ON public.deputy_mayors TO service_role;
ALTER TABLE public.deputy_mayors ENABLE ROW LEVEL SECURITY;

-- ========== DEPARTMENTS ==========
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  responsible_person_name TEXT,
  responsible_person_phone TEXT,
  deputy_mayor_id UUID REFERENCES public.deputy_mayors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- ========== NEIGHBORHOODS ==========
CREATE TABLE public.neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  population INTEGER,
  district TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neighborhoods TO authenticated;
GRANT SELECT ON public.neighborhoods TO anon;
GRANT ALL ON public.neighborhoods TO service_role;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;

-- ========== PROFILES ==========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  deputy_mayor_id UUID REFERENCES public.deputy_mayors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ========== USER ROLES (SECURITY) ==========
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_department()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ========== COMPLAINTS ==========
CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  citizen_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  citizen_name TEXT,
  citizen_phone TEXT,
  citizen_email TEXT,
  neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  language TEXT DEFAULT 'tr',
  complaint_text TEXT NOT NULL,
  category TEXT,
  ai_category TEXT,
  ai_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_personnel_id UUID,
  ai_confidence_score NUMERIC,
  priority TEXT DEFAULT 'orta',
  status TEXT NOT NULL DEFAULT 'yeni',
  satisfaction_score INTEGER,
  source TEXT DEFAULT 'web',
  wants_human_representative BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaints TO authenticated;
GRANT SELECT, INSERT ON public.complaints TO anon;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_complaints_status ON public.complaints(status);
CREATE INDEX idx_complaints_assigned_department ON public.complaints(assigned_department_id);
CREATE INDEX idx_complaints_neighborhood ON public.complaints(neighborhood_id);
CREATE INDEX idx_complaints_created_at ON public.complaints(created_at DESC);
CREATE INDEX idx_complaints_category ON public.complaints(category);
CREATE INDEX idx_complaints_language ON public.complaints(language);
CREATE INDEX idx_complaints_priority ON public.complaints(priority);

-- ========== COMPLAINT ATTACHMENTS ==========
CREATE TABLE public.complaint_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_attachments TO authenticated;
GRANT ALL ON public.complaint_attachments TO service_role;
ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;

-- ========== COMPLAINT RESPONSES ==========
CREATE TABLE public.complaint_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  responder_id UUID,
  response_text TEXT NOT NULL,
  response_type TEXT DEFAULT 'manuel',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_responses TO authenticated;
GRANT ALL ON public.complaint_responses TO service_role;
ALTER TABLE public.complaint_responses ENABLE ROW LEVEL SECURITY;

-- ========== ASSIGNMENT FEEDBACK ==========
CREATE TABLE public.complaint_assignment_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  old_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  new_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  corrected_by UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.complaint_assignment_feedback TO authenticated;
GRANT ALL ON public.complaint_assignment_feedback TO service_role;
ALTER TABLE public.complaint_assignment_feedback ENABLE ROW LEVEL SECURITY;

-- ========== MAYOR DAILY MESSAGES ==========
CREATE TABLE public.mayor_daily_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  created_by UUID,
  send_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mayor_daily_messages TO authenticated;
GRANT ALL ON public.mayor_daily_messages TO service_role;
ALTER TABLE public.mayor_daily_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.mayor_daily_message_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.mayor_daily_messages(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mayor_daily_message_targets TO authenticated;
GRANT ALL ON public.mayor_daily_message_targets TO service_role;
ALTER TABLE public.mayor_daily_message_targets ENABLE ROW LEVEL SECURITY;

-- ========== VEHICLES ==========
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL,
  vehicle_type TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aktif',
  maintenance_start_date DATE,
  maintenance_reason TEXT,
  estimated_return_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_vehicles_status ON public.vehicles(status);

-- ========== PERSONNEL ==========
CREATE TABLE public.personnel (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  phone TEXT,
  title TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel TO authenticated;
GRANT ALL ON public.personnel TO service_role;
ALTER TABLE public.personnel ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.personnel_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  personnel_id UUID NOT NULL REFERENCES public.personnel(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  check_in_time TIME,
  check_out_time TIME,
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  has_overtime BOOLEAN NOT NULL DEFAULT FALSE,
  missing_checkout BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personnel_attendance TO authenticated;
GRANT ALL ON public.personnel_attendance TO service_role;
ALTER TABLE public.personnel_attendance ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_attendance_date ON public.personnel_attendance(date DESC);
CREATE INDEX idx_attendance_personnel ON public.personnel_attendance(personnel_id);

-- ========== AI BOT LOGS ==========
CREATE TABLE public.ai_bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  related_filters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_bot_logs TO authenticated;
GRANT ALL ON public.ai_bot_logs TO service_role;
ALTER TABLE public.ai_bot_logs ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========
-- profiles: user reads own; staff reads all
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'cozum_masasi') OR public.has_role(auth.uid(), 'mudurluk'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- user_roles: user reads own
CREATE POLICY "user_roles_self_select" ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- reference tables: everyone signed-in can read
CREATE POLICY "deputy_mayors_read" ON public.deputy_mayors FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "deputy_mayors_admin" ON public.deputy_mayors FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'));

CREATE POLICY "departments_read" ON public.departments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "departments_admin" ON public.departments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'));

CREATE POLICY "neighborhoods_read_all" ON public.neighborhoods FOR SELECT USING (TRUE);
CREATE POLICY "neighborhoods_admin" ON public.neighborhoods FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'));

-- complaints
CREATE POLICY "complaints_citizen_own_select" ON public.complaints FOR SELECT TO authenticated
USING (citizen_user_id = auth.uid());
CREATE POLICY "complaints_staff_select" ON public.complaints FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'cozum_masasi')
  OR (public.has_role(auth.uid(), 'mudurluk') AND assigned_department_id = public.current_user_department())
);
CREATE POLICY "complaints_public_insert" ON public.complaints FOR INSERT TO anon WITH CHECK (TRUE);
CREATE POLICY "complaints_auth_insert" ON public.complaints FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "complaints_public_select" ON public.complaints FOR SELECT TO anon USING (FALSE);
CREATE POLICY "complaints_staff_update" ON public.complaints FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'cozum_masasi')
  OR (public.has_role(auth.uid(), 'mudurluk') AND assigned_department_id = public.current_user_department())
);
CREATE POLICY "complaints_admin_delete" ON public.complaints FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- attachments follow complaint visibility (simplified: any authenticated)
CREATE POLICY "attachments_staff_select" ON public.complaint_attachments FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "attachments_insert" ON public.complaint_attachments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "attachments_admin_delete" ON public.complaint_attachments FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- responses
CREATE POLICY "responses_select" ON public.complaint_responses FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "responses_insert" ON public.complaint_responses FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  OR public.has_role(auth.uid(), 'cozum_masasi') OR public.has_role(auth.uid(), 'mudurluk')
);

-- assignment feedback
CREATE POLICY "assignment_feedback_select" ON public.complaint_assignment_feedback FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "assignment_feedback_insert" ON public.complaint_assignment_feedback FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'mudurluk') OR public.has_role(auth.uid(), 'cozum_masasi') OR public.has_role(auth.uid(), 'admin'));

-- mayor messages
CREATE POLICY "messages_select" ON public.mayor_daily_messages FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "messages_mayor_manage" ON public.mayor_daily_messages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "message_targets_select" ON public.mayor_daily_message_targets FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "message_targets_insert" ON public.mayor_daily_message_targets FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'baskan') OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "message_targets_update" ON public.mayor_daily_message_targets FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  OR (public.has_role(auth.uid(), 'mudurluk') AND department_id = public.current_user_department())
);

-- vehicles: read all authenticated; mayor/admin/mudurluk manage own dept
CREATE POLICY "vehicles_select" ON public.vehicles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "vehicles_manage" ON public.vehicles FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  OR (public.has_role(auth.uid(), 'mudurluk') AND department_id = public.current_user_department())
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan')
  OR (public.has_role(auth.uid(), 'mudurluk') AND department_id = public.current_user_department())
);

-- personnel + attendance: staff read
CREATE POLICY "personnel_select" ON public.personnel FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "personnel_manage" ON public.personnel FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'));

CREATE POLICY "attendance_select" ON public.personnel_attendance FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "attendance_manage" ON public.personnel_attendance FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'baskan'));

-- ai_bot_logs: user reads own
CREATE POLICY "ai_bot_logs_own_select" ON public.ai_bot_logs FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ai_bot_logs_insert" ON public.ai_bot_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- ========== SIGNUP TRIGGER ==========
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vatandas');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER complaints_set_updated_at BEFORE UPDATE ON public.complaints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vehicles_set_updated_at BEFORE UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
