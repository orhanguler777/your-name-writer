import React, { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, CheckCircle2, AlertTriangle, MapPin, Layers, Maximize2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

const MAP_PROVIDERS = {
  voyager: {
    name: "Sokak Haritası",
    url: "https://{a-c}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attributions: '© CARTO'
  },
  dark: {
    name: "Koyu Tema",
    url: "https://{a-c}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attributions: '© CARTO'
  },
  satellite: {
    name: "Uydu Görüntüsü",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attributions: '© Esri'
  },
  positron: {
    name: "Açık Gri",
    url: "https://{a-c}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attributions: '© CARTO'
  }
};

const ALANYA_NEIGHBORHOODS = [
  {
    "id": "akcati",
    "name": "Akçatı",
    "lat": 36.602,
    "lng": 32.045,
    "desc": "Akçatı Mahallesi"
  },
  {
    "id": "akdam",
    "name": "Akdam",
    "lat": 36.65,
    "lng": 31.87,
    "desc": "Akdam Mahallesi"
  },
  {
    "id": "alacami",
    "name": "Alacami",
    "lat": 36.59,
    "lng": 32.14,
    "desc": "Alacami Dim Vadisi Bölgesi"
  },
  {
    "id": "alara",
    "name": "Alara",
    "lat": 36.69,
    "lng": 31.66,
    "desc": "Alara Kalesi Çevresi"
  },
  {
    "id": "aliefendi",
    "name": "Aliefendi",
    "lat": 36.48,
    "lng": 32.26,
    "desc": "Aliefendi Mahallesi"
  },
  {
    "id": "asmaca",
    "name": "Asmaca",
    "lat": 36.63,
    "lng": 32.01,
    "desc": "Asmaca Mahallesi"
  },
  {
    "id": "avsallar",
    "name": "Avsallar",
    "lat": 36.6212,
    "lng": 31.7785,
    "desc": "Avsallar Turizm ve Oteller Bölgesi"
  },
  {
    "id": "bademagaci",
    "name": "Bademağacı",
    "lat": 36.62,
    "lng": 32.22,
    "desc": "Bademağacı Mahallesi"
  },
  {
    "id": "basirli",
    "name": "Basırlı",
    "lat": 36.49,
    "lng": 32.21,
    "desc": "Basırlı Mahallesi"
  },
  {
    "id": "baskoy",
    "name": "Başköy",
    "lat": 36.72,
    "lng": 32.06,
    "desc": "Başköy Yaylası"
  },
  {
    "id": "bayir",
    "name": "Bayır",
    "lat": 36.7,
    "lng": 32.27,
    "desc": "Bayır Mahallesi"
  },
  {
    "id": "bayirkozagaci",
    "name": "Bayırkozağacı",
    "lat": 36.73,
    "lng": 31.95,
    "desc": "Bayırkozağacı Mahallesi"
  },
  {
    "id": "bektas",
    "name": "Bektaş",
    "lat": 36.565,
    "lng": 32.005,
    "desc": "Bektaş Tepesi Yerleşim Alanı"
  },
  {
    "id": "beldibi",
    "name": "Beldibi",
    "lat": 36.66,
    "lng": 32.12,
    "desc": "Beldibi Mahallesi"
  },
  {
    "id": "beyreli",
    "name": "Beyreli",
    "lat": 36.75,
    "lng": 32.21,
    "desc": "Beyreli Yaylası"
  },
  {
    "id": "bicakci",
    "name": "Bıçakçı",
    "lat": 36.58,
    "lng": 32.1,
    "desc": "Bıçakçı Mahallesi"
  },
  {
    "id": "bucakkoy",
    "name": "Bucakköy",
    "lat": 36.62,
    "lng": 32.14,
    "desc": "Bucakköy Mahallesi"
  },
  {
    "id": "burcaklar",
    "name": "Burçaklar",
    "lat": 36.64,
    "lng": 32.25,
    "desc": "Burçaklar Mahallesi"
  },
  {
    "id": "buyukhasbahce",
    "name": "Büyükhasbahçe",
    "lat": 36.558,
    "lng": 32.015,
    "desc": "Büyükhasbahçe Yerleşim Bölgesi"
  },
  {
    "id": "buyukpinar",
    "name": "Büyükpınar",
    "lat": 36.565,
    "lng": 32.085,
    "desc": "Büyükpınar Mahallesi"
  },
  {
    "id": "cikcilli",
    "name": "Cikcilli",
    "lat": 36.5542,
    "lng": 32.0292,
    "desc": "Cikcilli Yüksek Yerleşim Alanı"
  },
  {
    "id": "cumhuriyet",
    "name": "Cumhuriyet",
    "lat": 36.541,
    "lng": 32.022,
    "desc": "Cumhuriyet Mahallesi (Alanyum ve Sanayi Bölgesi)"
  },
  {
    "id": "cakallar",
    "name": "Çakallar",
    "lat": 36.66,
    "lng": 31.78,
    "desc": "Çakallar Mahallesi"
  },
  {
    "id": "camlica",
    "name": "Çamlıca",
    "lat": 36.51,
    "lng": 32.28,
    "desc": "Çamlıca Mahallesi"
  },
  {
    "id": "carsi",
    "name": "Çarşı",
    "lat": 36.538,
    "lng": 31.996,
    "desc": "Alanya Çarşı ve Liman Bölgesi"
  },
  {
    "id": "ciplakli",
    "name": "Çıplaklı",
    "lat": 36.568,
    "lng": 32.042,
    "desc": "Çıplaklı Yerleşim Bölgesi"
  },
  {
    "id": "degirmendere",
    "name": "Değirmendere",
    "lat": 36.585,
    "lng": 32.055,
    "desc": "Değirmendere Yerleşkesi"
  },
  {
    "id": "demirtas",
    "name": "Demirtaş",
    "lat": 36.441,
    "lng": 32.221,
    "desc": "Demirtaş Mahallesi Merkez ve Sahil"
  },
  {
    "id": "derekoy",
    "name": "Dereköy",
    "lat": 36.67,
    "lng": 32.02,
    "desc": "Dereköy Yerleşkesi"
  },
  {
    "id": "dinek",
    "name": "Dinek",
    "lat": 36.561,
    "lng": 31.968,
    "desc": "Alanya Batı Girişi ve Dinek Sahili"
  },
  {
    "id": "elikesik",
    "name": "Elikesik",
    "lat": 36.568,
    "lng": 31.921,
    "desc": "Elikesik Mahallesi"
  },
  {
    "id": "emisbeleni",
    "name": "Emişbeleni",
    "lat": 36.615,
    "lng": 31.905,
    "desc": "Emişbeleni Mahallesi"
  },
  {
    "id": "fakircali",
    "name": "Fakırcalı",
    "lat": 36.55,
    "lng": 32.32,
    "desc": "Fakırcalı Yaylası"
  },
  {
    "id": "figla",
    "name": "Fığla",
    "lat": 36.544,
    "lng": 31.9962,
    "desc": "Fığla Mahallesi"
  },
  {
    "id": "gozubuyuk",
    "name": "Gözübüyük",
    "lat": 36.65,
    "lng": 31.83,
    "desc": "Gözübüyük Yerleşkesi"
  },
  {
    "id": "gozukucuklu",
    "name": "Gözüküçüklü",
    "lat": 36.49,
    "lng": 32.24,
    "desc": "Gözüküçüklü Mahallesi"
  },
  {
    "id": "gullerpinari",
    "name": "Güllerpınarı",
    "lat": 36.544,
    "lng": 32.012,
    "desc": "Güllerpınarı Mahallesi ve Doğu Sahili"
  },
  {
    "id": "gumusgoze",
    "name": "Gümüşgöze",
    "lat": 36.78,
    "lng": 32.05,
    "desc": "Gümüşgöze Mahallesi"
  },
  {
    "id": "gumuskavak",
    "name": "Gümüşkavak",
    "lat": 36.66,
    "lng": 32.18,
    "desc": "Gümüşkavak Mahallesi"
  },
  {
    "id": "guneykoy",
    "name": "Güneyköy",
    "lat": 36.36,
    "lng": 32.34,
    "desc": "Güneyköy Mahallesi"
  },
  {
    "id": "guzelbag",
    "name": "Güzelbağ",
    "lat": 36.72,
    "lng": 31.91,
    "desc": "Güzelbağ Beldesi"
  },
  {
    "id": "hacet",
    "name": "Hacet",
    "lat": 36.546,
    "lng": 32.011,
    "desc": "Hacet Mahallesi Merkez Bölgesi"
  },
  {
    "id": "hacikerimler",
    "name": "Hacıkerimler",
    "lat": 36.62,
    "lng": 31.89,
    "desc": "Hacıkerimler Mahallesi"
  },
  {
    "id": "hacimehmetli",
    "name": "Hacımehmetli",
    "lat": 36.559,
    "lng": 31.996,
    "desc": "Hacımehmetli Mahallesi"
  },
  {
    "id": "hisarici",
    "name": "Hisariçi",
    "lat": 36.535,
    "lng": 31.997,
    "desc": "Alanya Kalesi İçi Tarihi Doku"
  },
  {
    "id": "hocalar",
    "name": "Hocalar",
    "lat": 36.46,
    "lng": 32.23,
    "desc": "Hocalar Mahallesi"
  },
  {
    "id": "imamli",
    "name": "İmamlı",
    "lat": 36.38,
    "lng": 32.35,
    "desc": "İmamlı Mahallesi"
  },
  {
    "id": "incekum",
    "name": "İncekum",
    "lat": 36.634,
    "lng": 31.756,
    "desc": "İncekum Plajı ve Çevresi"
  },
  {
    "id": "ishakli",
    "name": "İshaklı",
    "lat": 36.47,
    "lng": 32.21,
    "desc": "İshaklı Mahallesi"
  },
  {
    "id": "ispatli",
    "name": "İspatlı",
    "lat": 36.45,
    "lng": 32.25,
    "desc": "İspatlı Mahallesi"
  },
  {
    "id": "kadipasa",
    "name": "Kadıpaşa",
    "lat": 36.547,
    "lng": 32,
    "desc": "Kadıpaşa Mahallesi Merkez Bölgesi"
  },
  {
    "id": "karakocali",
    "name": "Karakocalı",
    "lat": 36.56,
    "lng": 32.065,
    "desc": "Karakocalı Mahallesi"
  },
  {
    "id": "karamanlar",
    "name": "Karamanlar",
    "lat": 36.69,
    "lng": 31.84,
    "desc": "Karamanlar Mahallesi"
  },
  {
    "id": "karapinar",
    "name": "Karapınar",
    "lat": 36.42,
    "lng": 32.32,
    "desc": "Karapınar Mahallesi"
  },
  {
    "id": "kargicak",
    "name": "Kargıcak",
    "lat": 36.4632,
    "lng": 32.1332,
    "desc": "Kargıcak Lüks Konut ve Oteller Bölgesi"
  },
  {
    "id": "kayabasi",
    "name": "Kayabaşı",
    "lat": 36.5616,
    "lng": 32.0981,
    "desc": "Kayabaşı Mahallesi"
  },
  {
    "id": "kestel",
    "name": "Kestel",
    "lat": 36.5189,
    "lng": 32.0792,
    "desc": "Kestel Sahili ve Üniversite Kampüsü"
  },
  {
    "id": "kesefli",
    "name": "Keşefli",
    "lat": 36.448,
    "lng": 32.195,
    "desc": "Keşefli Mahallesi"
  },
  {
    "id": "kizilcasehir",
    "name": "Kızılcaşehir",
    "lat": 36.565,
    "lng": 32.05,
    "desc": "Kızılcaşehir Kalesi Çevresi"
  },
  {
    "id": "kizlarpinari",
    "name": "Kızlarpınarı",
    "lat": 36.551,
    "lng": 31.981,
    "desc": "Kızlarpınarı Cleopatra Plajı Çevresi"
  },
  {
    "id": "kocaoglanli",
    "name": "Kocaoğlanlı",
    "lat": 36.53,
    "lng": 32.25,
    "desc": "Kocaoğlanlı Mahallesi"
  },
  {
    "id": "konakli",
    "name": "Konaklı",
    "lat": 36.5878,
    "lng": 31.8797,
    "desc": "Konaklı Beldesi ve Çarşısı"
  },
  {
    "id": "kuzyaka",
    "name": "Kuzyaka",
    "lat": 36.61,
    "lng": 32.19,
    "desc": "Kuzyaka Mahallesi"
  },
  {
    "id": "kucukhasbahce",
    "name": "Küçükhasbahçe",
    "lat": 36.553,
    "lng": 32.009,
    "desc": "Küçükhasbahçe Mahallesi"
  },
  {
    "id": "mahmutlar",
    "name": "Mahmutlar",
    "lat": 36.4914,
    "lng": 32.0991,
    "desc": "Mahmutlar Yerleşim ve Turizm Merkezi"
  },
  {
    "id": "mahmutseydi",
    "name": "Mahmutseydi",
    "lat": 36.64,
    "lng": 32.03,
    "desc": "Mahmutseydi Tarihi Dağ Köyü"
  },
  {
    "id": "oba",
    "name": "Oba",
    "lat": 36.5367,
    "lng": 32.0394,
    "desc": "Oba Yerleşim ve Alışveriş Bölgesi"
  },
  {
    "id": "obaalacami",
    "name": "Obaalacami",
    "lat": 36.58,
    "lng": 32.06,
    "desc": "Obaalacami Mahallesi"
  },
  {
    "id": "okurcalar",
    "name": "Okurcalar",
    "lat": 36.643,
    "lng": 31.696,
    "desc": "Okurcalar Beldesi"
  },
  {
    "id": "orhankoy",
    "name": "Orhanköy",
    "lat": 36.76,
    "lng": 31.88,
    "desc": "Orhanköy Mahallesi"
  },
  {
    "id": "otekoy",
    "name": "Öteköy",
    "lat": 36.68,
    "lng": 32.21,
    "desc": "Öteköy Mahallesi"
  },
  {
    "id": "ozvadi",
    "name": "Özvadi",
    "lat": 36.63,
    "lng": 32.15,
    "desc": "Özvadi Mahallesi"
  },
  {
    "id": "pasakoy",
    "name": "Paşaköy",
    "lat": 36.64,
    "lng": 31.88,
    "desc": "Paşaköy Mahallesi"
  },
  {
    "id": "payallar",
    "name": "Payallar",
    "lat": 36.5982,
    "lng": 31.8488,
    "desc": "Payallar Tarım ve Oteller Bölgesi"
  },
  {
    "id": "saburlar",
    "name": "Saburlar",
    "lat": 36.68,
    "lng": 31.81,
    "desc": "Saburlar Yerleşkesi"
  },
  {
    "id": "sapadere",
    "name": "Sapadere",
    "lat": 36.52,
    "lng": 32.3,
    "desc": "Sapadere Kanyonu ve Yerleşkesi"
  },
  {
    "id": "saray",
    "name": "Saray",
    "lat": 36.549,
    "lng": 31.988,
    "desc": "Saray Mahallesi ve Cleopatra Plajı Doğu Kesimi"
  },
  {
    "id": "seki",
    "name": "Seki",
    "lat": 36.425,
    "lng": 32.247,
    "desc": "Seki Mahallesi"
  },
  {
    "id": "sogukpinar",
    "name": "Soğukpınar",
    "lat": 36.69,
    "lng": 32.17,
    "desc": "Soğukpınar Mahallesi"
  },
  {
    "id": "sugozi",
    "name": "Sugözü",
    "lat": 36.5918,
    "lng": 31.9905,
    "desc": "Sugözü Mahallesi"
  },
  {
    "id": "suleymanlar",
    "name": "Süleymanlar",
    "lat": 36.67,
    "lng": 31.89,
    "desc": "Süleymanlar Mahallesi"
  },
  {
    "id": "sekerhane",
    "name": "Şekerhane",
    "lat": 36.543,
    "lng": 32.004,
    "desc": "Şekerhane Mahallesi ve Çarşısı"
  },
  {
    "id": "seyhler",
    "name": "Şeyhler",
    "lat": 36.6,
    "lng": 32.26,
    "desc": "Şeyhler Mahallesi"
  },
  {
    "id": "tasbasi",
    "name": "Taşbaşı",
    "lat": 36.71,
    "lng": 32.18,
    "desc": "Taşbaşı Mahallesi"
  },
  {
    "id": "tepe",
    "name": "Tepe",
    "lat": 36.57,
    "lng": 31.995,
    "desc": "Tepe Mahallesi Alanya Seyir Terası"
  },
  {
    "id": "tirilar",
    "name": "Tırılar",
    "lat": 36.48,
    "lng": 32.2,
    "desc": "Tırılar Mahallesi"
  },
  {
    "id": "tophane",
    "name": "Tophane",
    "lat": 36.532,
    "lng": 31.999,
    "desc": "Tarihi Tophane ve Tersane Yerleşkesi"
  },
  {
    "id": "toslak",
    "name": "Toslak",
    "lat": 36.61,
    "lng": 31.93,
    "desc": "Toslak Yerleşkesi"
  },
  {
    "id": "tosmur",
    "name": "Tosmur",
    "lat": 36.5312,
    "lng": 32.0578,
    "desc": "Tosmur Sahili ve Dim Çayı Çevresi"
  },
  {
    "id": "turkler",
    "name": "Türkler",
    "lat": 36.608,
    "lng": 31.81,
    "desc": "Türkler Beldesi ve Sahili"
  },
  {
    "id": "turktas",
    "name": "Türktaş",
    "lat": 36.65,
    "lng": 32.09,
    "desc": "Türktaş Mahallesi"
  },
  {
    "id": "ugrak",
    "name": "Uğrak",
    "lat": 36.41,
    "lng": 32.27,
    "desc": "Uğrak Mahallesi"
  },
  {
    "id": "ugurlu",
    "name": "Uğurlu",
    "lat": 36.68,
    "lng": 32.06,
    "desc": "Uğurlu Mahallesi"
  },
  {
    "id": "uzunoz",
    "name": "Uzunöz",
    "lat": 36.63,
    "lng": 32.23,
    "desc": "Uzunöz Mahallesi"
  },
  {
    "id": "uzumlu",
    "name": "Üzümlü",
    "lat": 36.6,
    "lng": 32.21,
    "desc": "Üzümlü Mahallesi"
  },
  {
    "id": "yalci",
    "name": "Yalçı",
    "lat": 36.67,
    "lng": 32.29,
    "desc": "Yalçı Mahallesi"
  },
  {
    "id": "yasirali",
    "name": "Yasırali",
    "lat": 36.66,
    "lng": 32.04,
    "desc": "Yasırali Mahallesi"
  },
  {
    "id": "yaylakonak",
    "name": "Yaylakonak",
    "lat": 36.66,
    "lng": 32.14,
    "desc": "Yaylakonak Mahallesi"
  },
  {
    "id": "yaylali",
    "name": "Yaylalı",
    "lat": 36.52,
    "lng": 32.14,
    "desc": "Yaylalı Mahallesi"
  },
  {
    "id": "yenice",
    "name": "Yenice",
    "lat": 36.75,
    "lng": 31.9,
    "desc": "Yenice Mahallesi"
  },
  {
    "id": "yesiloz",
    "name": "Yeşilöz",
    "lat": 36.401,
    "lng": 32.298,
    "desc": "Yeşilöz Mahallesi ve Sahil Şeridi"
  },
  {
    "id": "yesilvadi",
    "name": "Yeşilvadi",
    "lat": 36.57,
    "lng": 32.29,
    "desc": "Yeşilvadi Mahallesi"
  }
];

interface AlanyaMapProps {
  complaints: any[];
}

export function AlanyaMap({ complaints }: AlanyaMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [mapType, setMapType] = useState<keyof typeof MAP_PROVIDERS>("satellite");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const olMapRef = useRef<any>(null);
  const tileSourceRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);

  // Her mahalle için şikayet istatistikleri
  const neighborhoodStats = ALANYA_NEIGHBORHOODS.map((nbr) => {
    const nbrComplaints = complaints.filter((c) => {
      const dbNbrName = c.neighborhoods?.name?.toLowerCase() || "";
      if (!dbNbrName) return false;
      const searchName = nbr.name.toLowerCase();
      return dbNbrName.includes(searchName) || searchName.includes(dbNbrName);
    });

    const total = nbrComplaints.length;
    const resolved = nbrComplaints.filter((c) => c.status === "cozuldu").length;
    const open = total - resolved;

    return {
      ...nbr,
      total,
      resolved,
      open,
    };
  });

  const activeId = hoveredId || selectedId;
  const activeStats = neighborhoodStats.find((n) => n.id === activeId);

  // Haritayı başlatma
  useEffect(() => {
    // OpenLayers CSS ekleme
    const cssId = "ol-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/ol@v8.2.0/ol.css";
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapContainerRef.current || olMapRef.current) return;

      const ol = (window as any).ol;
      if (!ol) return;

      const tileSource = new ol.source.XYZ({
        url: MAP_PROVIDERS[mapType].url,
        attributions: MAP_PROVIDERS[mapType].attributions,
      });
      tileSourceRef.current = tileSource;

      const tileLayer = new ol.layer.Tile({
        source: tileSource,
      });

      const map = new ol.Map({
        target: mapContainerRef.current,
        layers: [tileLayer],
        view: new ol.View({
          center: ol.proj.fromLonLat([32.0004, 36.5438]),
          zoom: 12,
        }),
        controls: ol.control.defaults.defaults({ attribution: false }),
      });

      olMapRef.current = map;
      drawHtmlOverlays(ol, map);

      // Zoom seviyesine göre marker boyutlarını dinamik ölçeklendir
      const updateMarkerScale = () => {
        const zoom = map.getView().getZoom() || 12;
        // Zoom 10'da scale 0.7, zoom 12'de scale 1.0, zoom 15'de scale 1.6, zoom 18'de scale 2.2
        const scale = Math.max(0.5, 0.25 + (zoom - 10) * 0.2);
        const allMarkers = mapContainerRef.current?.querySelectorAll(".map-marker-el") as NodeListOf<HTMLElement>;
        allMarkers?.forEach((el) => {
          el.style.transform = `scale(${scale})`;
          el.style.transformOrigin = "center center";
        });
      };

      map.getView().on('change:resolution', updateMarkerScale);
      updateMarkerScale(); // İlk yükleme
    };

    if (!(window as any).ol) {
      const script = document.createElement("script");
      script.id = "ol-js";
      script.src = "https://cdn.jsdelivr.net/npm/ol@v8.2.0/dist/ol.js";
      script.async = true;
      script.onload = initMap;
      document.body.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (olMapRef.current) {
        olMapRef.current.setTarget(undefined);
        olMapRef.current = null;
        tileSourceRef.current = null;
      }
    };
  }, []);

  // Harita tipi değiştiğinde kaynağı güncelle
  useEffect(() => {
    if (tileSourceRef.current) {
      tileSourceRef.current.setUrl(MAP_PROVIDERS[mapType].url);
    }
  }, [mapType]);

  // HTML Overlays (Markerlar) Oluşturma
  const drawHtmlOverlays = (ol: any, map: any) => {
    // Öncekileri temizle
    overlaysRef.current.forEach((o) => map.removeOverlay(o));
    overlaysRef.current = [];

    neighborhoodStats.forEach((nbr) => {
      let markerColor = "#10B981"; // Yeşil
      let shadowColor = "rgba(16, 185, 129, 0.4)";
      if (nbr.open > 5) {
        markerColor = "#EF4444"; // Kırmızı
        shadowColor = "rgba(239, 68, 68, 0.6)";
      } else if (nbr.open > 0) {
        markerColor = "#F59E0B"; // Turuncu
        shadowColor = "rgba(245, 158, 11, 0.5)";
      }

      // Marker elementini oluştur
      const markerEl = document.createElement("div");
      markerEl.style.position = "relative";
      markerEl.style.width = "30px";
      markerEl.style.height = "30px";
      markerEl.style.display = "flex";
      markerEl.style.alignItems = "center";
      markerEl.style.justifyContent = "center";
      markerEl.style.cursor = "pointer";

      // Dalga efekti (Ping)
      if (nbr.open > 0) {
        const pingEl = document.createElement("div");
        pingEl.style.position = "absolute";
        pingEl.style.width = "100%";
        pingEl.style.height = "100%";
        pingEl.style.borderRadius = "50%";
        pingEl.style.backgroundColor = markerColor;
        pingEl.style.opacity = "0.3";
        pingEl.style.animation = "ol-ping 2s infinite";
        markerEl.appendChild(pingEl);
      }

      // Merkez Nokta
      const coreEl = document.createElement("div");
      coreEl.style.width = "18px";
      coreEl.style.height = "18px";
      coreEl.style.borderRadius = "50%";
      coreEl.style.backgroundColor = markerColor;
      coreEl.style.border = "2px solid white";
      coreEl.style.boxShadow = `0 0 10px ${shadowColor}`;
      coreEl.style.display = "flex";
      coreEl.style.alignItems = "center";
      coreEl.style.justifyContent = "center";
      coreEl.style.color = "white";
      coreEl.style.fontFamily = "sans-serif";
      coreEl.style.fontSize = "9px";
      coreEl.style.fontWeight = "bold";
      coreEl.innerText = nbr.open > 0 ? nbr.open.toString() : "";
      markerEl.appendChild(coreEl);

      // Tooltip/Label elementini oluştur (Hover durumunda gösterilecek)
      const labelEl = document.createElement("div");
      labelEl.innerText = nbr.name;
      labelEl.style.position = "absolute";
      labelEl.style.bottom = "26px";
      labelEl.style.left = "50%";
      labelEl.style.transform = "translateX(-50%)";
      labelEl.style.backgroundColor = "rgba(15, 23, 42, 0.95)";
      labelEl.style.color = "#ffffff";
      labelEl.style.padding = "3px 8px";
      labelEl.style.borderRadius = "4px";
      labelEl.style.fontSize = "10px";
      labelEl.style.fontWeight = "600";
      labelEl.style.fontFamily = "Outfit, Inter, sans-serif";
      labelEl.style.whiteSpace = "nowrap";
      labelEl.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)";
      labelEl.style.border = "1px solid rgba(255, 255, 255, 0.15)";
      labelEl.style.opacity = "0";
      labelEl.style.transition = "all 0.15s ease-out";
      labelEl.style.pointerEvents = "none";
      labelEl.style.zIndex = "100";
      markerEl.appendChild(labelEl);

      // Mouse olayları ile detayları tetikle
      markerEl.addEventListener("mouseenter", () => {
        setHoveredId(nbr.id);
        labelEl.style.opacity = "1";
        labelEl.style.bottom = "30px";
        if (markerEl.parentElement) {
          markerEl.parentElement.style.zIndex = "9999";
        }
      });
      markerEl.addEventListener("mouseleave", () => {
        setHoveredId(null);
        labelEl.style.opacity = "0";
        labelEl.style.bottom = "26px";
        if (markerEl.parentElement) {
          markerEl.parentElement.style.zIndex = "";
        }
      });

      // Marker elementlerine seçici sınıfları ekle (Click vurgulama için)
      markerEl.classList.add("map-marker-el");
      if (coreEl) {
        coreEl.classList.add("marker-core-el");
      }

      // Tıklama olayları ile detayları sabitle
      markerEl.addEventListener("click", () => {
        setSelectedId(nbr.id);
        
        // Önceki seçili markerların vurgusunu temizle
        const allMarkers = mapContainerRef.current?.querySelectorAll(".map-marker-el");
        allMarkers?.forEach((el: any) => {
          const core = el.querySelector(".marker-core-el");
          if (core) {
            core.style.border = "2px solid white";
            core.style.transform = "";
          }
        });

        // Tıklanan marker'ı vurgula
        if (coreEl) {
          coreEl.style.border = "3px solid #38bdf8";
          coreEl.style.transform = "scale(1.2)";
        }
      });

      // OpenLayers Overlay olarak haritaya ekle
      const overlay = new ol.Overlay({
        position: ol.proj.fromLonLat([nbr.lng, nbr.lat]),
        positioning: "center-center",
        element: markerEl,
        stopEvent: false,
      });

      map.addOverlay(overlay);
      overlaysRef.current.push(overlay);
    });
  };

  // Harita oluştuktan sonra markerları güncellemek için stil ekleyelim
  useEffect(() => {
    const styleId = "ol-marker-ping-style";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.innerHTML = `
        @keyframes ol-ping {
          0% { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(2.0); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Tam ekran geçişinde haritayı yeniden boyutlandır
  useEffect(() => {
    if (olMapRef.current) {
      setTimeout(() => {
        olMapRef.current?.updateSize();
      }, 100);
    }
  }, [isFullscreen]);

  return (
    <>
      {/* Fullscreen overlay backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
          onClick={() => setIsFullscreen(false)}
        />
      )}
      <Card className={`p-6 relative overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 text-slate-100 border-0 shadow-xl transition-all duration-300 ${
        isFullscreen
          ? "fixed inset-4 z-50 flex flex-col"
          : ""
      }`}>
      <div className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h3 className="font-display font-semibold text-lg text-white">Alanya İnteraktif Coğrafi Şikayet Haritası</h3>
          <p className="text-xs text-slate-400">Canlı dalga efektli ısı noktaları ve mahalle bazlı detaylar (Marker'ların üzerine geliniz)</p>
        </div>

        {/* Harita Tipi Seçici Menü */}
        <div className="flex items-center gap-1.5 bg-slate-800/60 p-1 rounded-lg border border-slate-700/60 text-xs z-10">
          <Layers className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
          {Object.entries(MAP_PROVIDERS).map(([key, value]) => (
            <button
              key={key}
              onClick={() => setMapType(key as keyof typeof MAP_PROVIDERS)}
              className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                mapType === key
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {value.name}
            </button>
          ))}
        </div>

        {/* Tam Ekran / Küçült Butonu */}
        <button
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800/60 border border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 transition-all z-10"
          title={isFullscreen ? "Küçült" : "Tam Ekran"}
        >
          {isFullscreen ? <X className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-4 gap-6 ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
        {/* OpenLayers Harita Konteyneri */}
        <div className={`lg:col-span-3 rounded-xl overflow-hidden border border-slate-800 relative z-0 ${isFullscreen ? "h-full" : "h-[420px]"}`}>
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>

        {/* Detay Kartı */}
        <div className="flex flex-col justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800">
          {activeStats ? (
            <div className="space-y-4">
              <div>
                <Badge variant="outline" className="mb-1 text-sky-400 border-sky-400/30">
                  {activeStats.name}
                </Badge>
                <p className="text-[11px] text-slate-400 leading-relaxed">{activeStats.desc}</p>
              </div>

              <div className="space-y-2">
                <div 
                  onClick={() => navigate({ to: "/sikayetler", search: { neighborhood: activeStats.id, status: "all" } as any })}
                  className="flex items-center justify-between text-xs p-2 rounded bg-slate-800/40 hover:bg-slate-800/70 border border-transparent hover:border-slate-700/50 cursor-pointer transition-all"
                  title="Tüm şikayetleri listele"
                >
                  <div className="flex items-center gap-2 text-slate-300">
                    <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                    <span>Toplam Şikayet</span>
                  </div>
                  <span className="font-semibold text-white">{activeStats.total}</span>
                </div>

                <div 
                  onClick={() => navigate({ to: "/sikayetler", search: { neighborhood: activeStats.id, status: "active" } as any })}
                  className="flex items-center justify-between text-xs p-2 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 cursor-pointer border border-transparent hover:border-rose-500/30 transition-all"
                  title="Aktif şikayetleri listele"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Aktif Şikayet</span>
                  </div>
                  <span className="font-bold">{activeStats.open}</span>
                </div>

                <div 
                  onClick={() => navigate({ to: "/sikayetler", search: { neighborhood: activeStats.id, status: "cozuldu" } as any })}
                  className="flex items-center justify-between text-xs p-2 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 cursor-pointer border border-transparent hover:border-emerald-500/30 transition-all"
                  title="Çözülen şikayetleri listele"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Çözülen Şikayet</span>
                  </div>
                  <span className="font-bold">{activeStats.resolved}</span>
                </div>
              </div>

              {activeStats.open > 5 ? (
                <div className="text-[10px] text-rose-400 bg-rose-950/20 border border-rose-900/30 rounded p-2 text-center animate-pulse">
                  ⚠️ Bu bölgede yüksek şikayet yoğunluğu tespit edilmiştir.
                </div>
              ) : activeStats.open === 0 && activeStats.total > 0 ? (
                <div className="text-[10px] text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 rounded p-2 text-center">
                  🎉 Bu bölgedeki tüm şikayetler çözülmüştür!
                </div>
              ) : null}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-8">
              <MapPin className="h-10 w-10 text-slate-700 mb-2" />
              <p className="text-xs">Detayları görmek için harita üzerindeki markerların üzerine geliniz.</p>
            </div>
          )}

          <div className="border-t border-slate-800 pt-3 mt-4 text-[10px] text-slate-400">
            OpenLayers HTML Overlay teknolojisiyle dinamik dalgalı ısı noktaları.
          </div>
        </div>
      </div>
    </Card>
    </>
  );
}
