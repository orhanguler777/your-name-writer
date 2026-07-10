-- Create events table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create policy to allow select for everyone
CREATE POLICY "Allow read access to everyone" ON public.events
    FOR SELECT TO public USING (true);

-- Insert Alanya 2026 events
INSERT INTO public.events (title, start_date, end_date, description) VALUES
('10. Uluslararası Alanya Karikatür Yarışması', '2026-01-13', '2026-04-01', '10th International Alanya Cartoon Competition'),
('Ramazan Meydanı Etkinlikleri', '2026-02-19', '2026-03-19', 'Ramadan Cultural Events - Ramazan Meydanı Etkinlikleri'),
('8. Uluslararası Alanya Çocuk Festivali', '2026-04-25', '2026-04-26', '8th International Alanya Children''s Festival'),
('12. Liselerarası Tiyatro Festivali', '2026-05-01', '2026-05-31', '12th Inter-High School Theatre Festival'),
('24. Uluslararası Alanya Kültür, Sanat ve Turizm Festivali', '2026-05-22', '2026-05-24', '24th International Alanya Culture, Art and Tourism Festival'),
('2026 Volleyball World Beach Pro Tour Challenge Turnuvası', '2026-06-10', '2026-06-14', '2026 Volleyball World Beach Pro Tour Challenge Tournament'),
('Keykubad Göç ve Kervan Yürüyüş Yolu Etkinliği', '2026-06-07', '2026-09-13', 'Keykubad Migration & Caravan Walk'),
('20. Geleneksel Gökbel Yağlı Pehlivan Güreşleri ve Festivali', '2026-07-30', '2026-08-02', '20th Traditional Gökbel Oil Wrestling and Festival'),
('Tarihi Mekanlardan Yükselen Müzik Tınıları', '2026-05-16', '2026-11-14', 'Musical Tones Rising From Historical Places. Tarihler: 16 Mayıs, 20 Haziran, 18 Temmuz, 15 Ağustos, 17 Ekim, 14 Kasım 2026'),
('20. Uluslararası Alanya Caz Festivali', '2026-09-17', '2026-09-20', '20th International Alanya Jazz Festival'),
('8. Alanya Kitap Fuarı', '2026-09-25', '2026-10-04', '8th Alanya Book Fair'),
('5. Alanya Tropikal Meyve Festivali', '2026-10-09', '2026-10-11', '5th Alanya Tropical Fruit Festival'),
('35. Uluslararası Alanya Triatlonu', '2026-10-23', '2026-10-25', '35th International Alanya Triathlon'),
('21. Uluslararası Alanya Taş Heykel Sempozyumu', '2026-11-01', '2026-11-30', '21st International Alanya Stone Sculpture Symposium'),
('16. Uluslararası Alanya Noel Pazarı', '2026-12-12', '2026-12-13', '16th International Alanya Noel Bazaar')
ON CONFLICT DO NOTHING;
