import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Navigation, Layers, Maximize2, Minimize2 } from "lucide-react";
import { ZABITA_CHECKLISTS } from "@/lib/ZabitaChecklists";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Alanya Center Coordinates
const ALANYA_CENTER = { lat: 36.54375, lng: 31.99982 };

const MAP_PROVIDERS = {
  satellite: {
    id: "satellite",
    name: "Uydu Görüntüsü",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
  },
  voyager: {
    id: "voyager",
    name: "Sokak Haritası",
    url: "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
    attribution: "© CARTO",
  },
  dark: {
    id: "dark",
    name: "Koyu Tema",
    url: "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
    attribution: "© CARTO",
  },
  positron: {
    id: "positron",
    name: "Açık Gri",
    url: "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
    attribution: "© CARTO",
  },
};

// Custom Pin Icons creator
const createCustomIcon = (color: string) => {
  if (typeof window === "undefined" || !L) return undefined as any;
  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `
      <div style="
        background-color: ${color};
        width: 26px;
        height: 26px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 3px 8px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="width: 10px; height: 10px; background-color: white; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
};

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 16, { animate: true });
  }, [lat, lng, map]);
  return null;
}

function ResizeMapOnFullscreen({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [isFullscreen, map]);
  return null;
}

export function ZabitaHaritaClientComponent({
  filtered,
  selectedInspection,
  setSelectedInspection,
}: {
  filtered: any[];
  selectedInspection: any;
  setSelectedInspection: (item: any) => void;
}) {
  const [activeProvider, setActiveProvider] = useState<keyof typeof MAP_PROVIDERS>("satellite");
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  const getCoords = (item: any, index: number) => {
    if (item.latitude && item.longitude) {
      return { lat: item.latitude, lng: item.longitude };
    }
    // Alanya kara sınırları içinde gerçekçi noktalar (Atatürk Blv, Saray, Çarşı, Şekerhane, Kızlar Pınarı)
    const offsets = [
      { lat: 36.5450, lng: 31.9950 }, // Çarşı / Atatürk Bulvarı
      { lat: 36.5485, lng: 31.9880 }, // Kızlar Pınarı / Otogar civarı
      { lat: 36.5490, lng: 32.0010 }, // Şekerhane / Hacet
      { lat: 36.5510, lng: 31.9960 }, // Saray Mahallesi
      { lat: 36.5440, lng: 32.0040 }, // Güller Pınarı
    ];
    return offsets[index % offsets.length];
  };

  const provider = MAP_PROVIDERS[activeProvider];

  return (
    <Card className={`flex flex-col overflow-hidden border-sidebar-border bg-slate-950 text-white shadow-2xl transition-all duration-300 ${
      isFullscreen
        ? "fixed inset-2 z-[9999] h-[calc(100vh-16px)] w-[calc(100vw-16px)]"
        : "lg:col-span-2 h-[650px] relative"
    }`}>
      {/* Harita Başlığı ve Katman Seçici Butonlar */}
      <CardHeader className="pb-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 z-10 bg-slate-950/90 backdrop-blur-md">
        <div>
          <CardTitle className="text-base font-bold flex items-center gap-2 text-white">
            <MapPin className="w-4 h-4 text-emerald-400" />
            Alanya İnteraktif Coğrafi Zabıta Haritası
          </CardTitle>
          <p className="text-xs text-slate-400 mt-0.5">Canlı uydu görüntüsü ve işyeri denetim noktaları</p>
        </div>

        {/* Katman Değiştirici Buton Grubu ve Tam Ekran / Kapat Düğmesi */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 shrink-0">
            <Layers className="w-3.5 h-3.5 text-slate-400 ml-1 mr-0.5" />
            {Object.entries(MAP_PROVIDERS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveProvider(key as keyof typeof MAP_PROVIDERS)}
                className={`px-2.5 py-1 text-xs rounded-md transition-all font-medium ${
                  activeProvider === key
                    ? "bg-primary text-primary-foreground font-semibold shadow"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className={`p-2 rounded-lg transition-all font-bold flex items-center gap-1 text-xs border ${
              isFullscreen
                ? "bg-red-600 hover:bg-red-700 text-white border-red-500 shadow-lg"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800"
            }`}
            title={isFullscreen ? "Haritayı Küçült / Kapat (ESC)" : "Tam Ekran Yap"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4" />
                <span>Kapat (ESC)</span>
              </>
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-0 relative">
        <MapContainer
          center={[ALANYA_CENTER.lat, ALANYA_CENTER.lng]}
          zoom={14}
          scrollWheelZoom={true}
          attributionControl={false}
          className="w-full h-full z-0 bg-slate-900"
        >
          <ResizeMapOnFullscreen isFullscreen={isFullscreen} />
          <TileLayer
            key={activeProvider}
            attribution={provider.attribution}
            url={provider.url}
            maxZoom={19}
          />

          {selectedInspection && (() => {
            const idx = filtered.findIndex((i) => i.id === selectedInspection.id);
            const coords = getCoords(selectedInspection, idx >= 0 ? idx : 0);
            return <RecenterMap lat={coords.lat} lng={coords.lng} />;
          })()}

          {filtered.map((item, idx) => {
            const coords = getCoords(item, idx);
            const hasPenalty = (item.penalty_points ?? 0) > 0;
            const icon = createCustomIcon(hasPenalty ? "#ef4444" : "#10b981");

            return (
              <Marker
                key={item.id}
                position={[coords.lat, coords.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => setSelectedInspection(item),
                }}
              >
                <Popup>
                  <div className="p-1 space-y-1.5 max-w-[230px]">
                    <h4 className="font-bold text-sm text-slate-900 border-b pb-1 flex items-center justify-between">
                      {item.workplace_name}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white font-medium ${hasPenalty ? "bg-red-500" : "bg-emerald-500"}`}>
                        {hasPenalty ? `${item.penalty_points} Puan` : "Temiz"}
                      </span>
                    </h4>
                    <div className="text-xs text-slate-700 space-y-0.5">
                      {item.owner_name && <div><strong>Sahibi:</strong> {item.owner_name}</div>}
                      {item.phone && <div><strong>Tel:</strong> {item.phone}</div>}
                      {item.address && <div className="text-[11px] truncate"><strong>Adres:</strong> {item.address}</div>}
                      {item.recommended_action && (
                        <div className="mt-1 text-[11px] font-bold text-red-600">
                          Yaptırım: {item.recommended_action}
                        </div>
                      )}
                    </div>
                    <div className="pt-1.5 flex items-center justify-between border-t text-[10px]">
                      <a
                        href={`https://maps.google.com/?q=${coords.lat},${coords.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-bold hover:underline flex items-center gap-0.5"
                      >
                        <Navigation className="w-3 h-3" /> Navigasyon
                      </a>
                      <span className="text-slate-400">{new Date(item.created_at).toLocaleDateString("tr-TR")}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* Alt Seçili İşyeri Detay Bilgi Kartı */}
        <div className="absolute bottom-4 left-4 right-4 z-[400] pointer-events-none">
          {selectedInspection ? (
            <div className="p-4 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-800 text-white shadow-2xl pointer-events-auto space-y-2 animate-in slide-in-from-bottom-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2 text-white">
                    {selectedInspection.workplace_name}
                    {selectedInspection.penalty_points > 0 ? (
                      <Badge variant="destructive" className="text-xs">
                        {selectedInspection.recommended_action || "Cezalı"} ({selectedInspection.penalty_points} Puan)
                      </Badge>
                    ) : (
                      <Badge variant="default" className="text-xs bg-emerald-600">
                        Sorunsuz Denetim
                      </Badge>
                    )}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>Sahibi: <strong>{selectedInspection.owner_name || "—"}</strong></span>
                    <span>Telefon: <strong>{selectedInspection.phone || "—"}</strong></span>
                    <span>Tarih: <strong>{new Date(selectedInspection.created_at).toLocaleDateString("tr-TR")}</strong></span>
                  </p>
                </div>

                <a
                  href={`https://maps.google.com/?q=${selectedInspection.latitude || ALANYA_CENTER.lat},${selectedInspection.longitude || ALANYA_CENTER.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold shrink-0 flex items-center gap-1.5 hover:opacity-90 shadow-lg"
                >
                  <Navigation className="w-4 h-4" /> Google Yol Tarifi
                </a>
              </div>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-300 bg-slate-950/85 backdrop-blur-md rounded-lg border border-slate-800 shadow-xl pointer-events-auto flex items-center justify-between">
              <span>Pinlerin veya listedeki işyerlerinin üzerine tıklayarak canlı konum ve detayları inceleyin.</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow" /> Uygun</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow" /> Cezalı</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
