import { useRef, useEffect } from "react";
import { Eraser } from "lucide-react";

/**
 * Dokunmatik/fare ile imza almak için hafif canvas imza pedi. Bağımlılık gerektirmez.
 * Çizim değiştikçe onChange ile PNG data URL'i döner (boşsa null).
 */
export function SignaturePad({
  label,
  disabled,
  onChange,
}: {
  label: string;
  disabled?: boolean;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    const h = canvas.clientHeight || 128;
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const start = (e: React.PointerEvent) => {
    if (disabled) return;
    drawing.current = true;
    dirty.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(dirty.current ? canvasRef.current!.toDataURL("image/png") : null);
  };

  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-40"
        >
          <Eraser className="w-3 h-3" /> Temizle
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className={`w-full h-32 rounded-md border bg-white touch-none ${
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-crosshair"
        }`}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
    </div>
  );
}
