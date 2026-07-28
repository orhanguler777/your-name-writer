-- Vatandaş kayıtları ve vatandaş–mahalle bağları.
--
-- Şimdiye kadar "vatandaş" kavramı yalnızca complaints tablosundan anlık olarak
-- türetiliyordu. Duyuruları mahalleye göre segmentleyebilmek için bu bilgiyi
-- kalıcı hale getiriyoruz: her telefon bir citizens satırı, ilişkili olduğu her
-- mahalle için de bir citizen_neighborhoods satırı tutar.
--
-- Bir vatandaş birden çok mahalleye bağlı olabilir (farklı mahallelerde şikayet
-- bildirmiş olabilir); mahalle duyurusu bu mahallelerin hepsine gider.

/* ---------------------------------------------------------------- */
/* citizens                                                          */
/* ---------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS public.citizens (
    phone TEXT PRIMARY KEY,
    name TEXT,
    language TEXT NOT NULL DEFAULT 'tr',
    kvkk_accepted BOOLEAN NOT NULL DEFAULT false,
    complaint_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

/* ---------------------------------------------------------------- */
/* citizen_neighborhoods                                             */
/* ---------------------------------------------------------------- */
CREATE TABLE IF NOT EXISTS public.citizen_neighborhoods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    citizen_phone TEXT NOT NULL REFERENCES public.citizens (phone) ON DELETE CASCADE,
    neighborhood_id UUID NOT NULL REFERENCES public.neighborhoods (id) ON DELETE CASCADE,
    complaint_count INTEGER NOT NULL DEFAULT 0,
    -- Elle eklenen bağlar şikayet senkronizasyonunda silinmez.
    is_manual BOOLEAN NOT NULL DEFAULT false,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT citizen_neighborhoods_unique_pair UNIQUE (citizen_phone, neighborhood_id)
);

CREATE INDEX IF NOT EXISTS citizen_neighborhoods_neighborhood_idx
    ON public.citizen_neighborhoods (neighborhood_id);
CREATE INDEX IF NOT EXISTS citizen_neighborhoods_phone_idx
    ON public.citizen_neighborhoods (citizen_phone);

/* ---------------------------------------------------------------- */
/* RLS                                                               */
/* ---------------------------------------------------------------- */
ALTER TABLE public.citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citizen_neighborhoods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read citizens to authenticated" ON public.citizens;
CREATE POLICY "Allow read citizens to authenticated" ON public.citizens
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write citizens to authenticated" ON public.citizens;
CREATE POLICY "Allow write citizens to authenticated" ON public.citizens
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read citizen_neighborhoods to authenticated" ON public.citizen_neighborhoods;
CREATE POLICY "Allow read citizen_neighborhoods to authenticated" ON public.citizen_neighborhoods
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow write citizen_neighborhoods to authenticated" ON public.citizen_neighborhoods;
CREATE POLICY "Allow write citizen_neighborhoods to authenticated" ON public.citizen_neighborhoods
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

/* ---------------------------------------------------------------- */
/* Şikayetten vatandaş/mahalle bağını güncelleyen trigger            */
/* ---------------------------------------------------------------- */
CREATE OR REPLACE FUNCTION public.sync_citizen_from_complaint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone TEXT;
    v_is_full_name BOOLEAN;
BEGIN
    v_phone := NULLIF(TRIM(NEW.citizen_phone), '');
    IF v_phone IS NULL THEN
        RETURN NEW;
    END IF;

    -- "Vatandaş" gibi yer tutucu adları gerçek ad saymıyoruz (en az iki kelime).
    v_is_full_name := NEW.citizen_name IS NOT NULL
        AND LOWER(TRIM(NEW.citizen_name)) <> 'vatandaş'
        AND array_length(string_to_array(TRIM(NEW.citizen_name), ' '), 1) >= 2;

    INSERT INTO public.citizens (phone, name, language, kvkk_accepted, complaint_count, first_seen_at, last_seen_at, updated_at)
    VALUES (
        v_phone,
        NULLIF(TRIM(COALESCE(NEW.citizen_name, '')), ''),
        LOWER(COALESCE(NEW.language, 'tr')),
        COALESCE(v_is_full_name, false),
        1,
        COALESCE(NEW.created_at, timezone('utc'::text, now())),
        COALESCE(NEW.created_at, timezone('utc'::text, now())),
        timezone('utc'::text, now())
    )
    ON CONFLICT (phone) DO UPDATE SET
        -- Gerçek ad geldiyse yer tutucunun üstüne yaz.
        name = CASE
            WHEN COALESCE(v_is_full_name, false) THEN EXCLUDED.name
            ELSE COALESCE(public.citizens.name, EXCLUDED.name)
        END,
        kvkk_accepted = public.citizens.kvkk_accepted OR EXCLUDED.kvkk_accepted,
        language = COALESCE(EXCLUDED.language, public.citizens.language),
        complaint_count = public.citizens.complaint_count + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END,
        last_seen_at = GREATEST(public.citizens.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = timezone('utc'::text, now());

    IF NEW.neighborhood_id IS NOT NULL THEN
        INSERT INTO public.citizen_neighborhoods (citizen_phone, neighborhood_id, complaint_count, first_seen_at, last_seen_at)
        VALUES (
            v_phone,
            NEW.neighborhood_id,
            1,
            COALESCE(NEW.created_at, timezone('utc'::text, now())),
            COALESCE(NEW.created_at, timezone('utc'::text, now()))
        )
        ON CONFLICT (citizen_phone, neighborhood_id) DO UPDATE SET
            complaint_count = public.citizen_neighborhoods.complaint_count
                + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END,
            last_seen_at = GREATEST(public.citizen_neighborhoods.last_seen_at, EXCLUDED.last_seen_at);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_citizen_from_complaint ON public.complaints;
CREATE TRIGGER trg_sync_citizen_from_complaint
    AFTER INSERT OR UPDATE OF citizen_phone, citizen_name, language, neighborhood_id
    ON public.complaints
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_citizen_from_complaint();

/* ---------------------------------------------------------------- */
/* Mevcut şikayetlerden geriye dönük doldurma                        */
/* ---------------------------------------------------------------- */
INSERT INTO public.citizens (phone, name, language, kvkk_accepted, complaint_count, first_seen_at, last_seen_at)
SELECT
    TRIM(c.citizen_phone) AS phone,
    -- Gerçek ad (en az iki kelime) varsa onu al, yoksa herhangi bir adı.
    COALESCE(
        MAX(CASE
            WHEN LOWER(TRIM(c.citizen_name)) <> 'vatandaş'
             AND array_length(string_to_array(TRIM(c.citizen_name), ' '), 1) >= 2
            THEN TRIM(c.citizen_name)
        END),
        MAX(NULLIF(TRIM(c.citizen_name), ''))
    ) AS name,
    LOWER(COALESCE(MAX(c.language), 'tr')) AS language,
    bool_or(
        LOWER(TRIM(c.citizen_name)) <> 'vatandaş'
        AND array_length(string_to_array(TRIM(c.citizen_name), ' '), 1) >= 2
    ) AS kvkk_accepted,
    COUNT(*)::int AS complaint_count,
    MIN(c.created_at) AS first_seen_at,
    MAX(c.created_at) AS last_seen_at
FROM public.complaints c
WHERE NULLIF(TRIM(c.citizen_phone), '') IS NOT NULL
GROUP BY TRIM(c.citizen_phone)
ON CONFLICT (phone) DO NOTHING;

INSERT INTO public.citizen_neighborhoods (citizen_phone, neighborhood_id, complaint_count, first_seen_at, last_seen_at)
SELECT
    TRIM(c.citizen_phone) AS citizen_phone,
    c.neighborhood_id,
    COUNT(*)::int AS complaint_count,
    MIN(c.created_at) AS first_seen_at,
    MAX(c.created_at) AS last_seen_at
FROM public.complaints c
WHERE NULLIF(TRIM(c.citizen_phone), '') IS NOT NULL
  AND c.neighborhood_id IS NOT NULL
GROUP BY TRIM(c.citizen_phone), c.neighborhood_id
ON CONFLICT (citizen_phone, neighborhood_id) DO NOTHING;
