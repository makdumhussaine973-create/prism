import React, { useEffect, useRef, useState } from 'react';
import { BAND_LOW, BAND_HIGH, SETPOINT } from '../core/prismRules';

export interface MoisturePoint {
  ts: string;
  m: number;
  T?: number;
  RH?: number;
  irrigating?: boolean;
}

interface MoistureCanvasProps {
  data: MoisturePoint[];
  height?: number;
  interactive?: boolean;
}

export const MoistureCanvas: React.FC<MoistureCanvasProps> = ({
  data,
  height = 180,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    point: MoisturePoint;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Coordinate mapping
    const paddingLeft = 36;
    const paddingRight = 16;
    const paddingTop = 20;
    const paddingBottom = 24;

    const chartW = w - paddingLeft - paddingRight;
    const chartH = h - paddingTop - paddingBottom;

    const y = (val: number) => {
      // 0 to 100% moisture mapped to paddingTop + chartH to paddingTop
      const clamped = Math.max(0, Math.min(100, val));
      return paddingTop + chartH - (clamped / 100) * chartH;
    };

    const x = (index: number) => {
      if (data.length <= 1) return paddingLeft;
      return paddingLeft + (index / (data.length - 1)) * chartW;
    };

    ctx.clearRect(0, 0, w, h);

    // 1. Shaded Agronomic Target Band (40% to 70%)
    const y70 = y(BAND_HIGH);
    const y40 = y(BAND_LOW);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
    ctx.fillRect(paddingLeft, y70, chartW, y40 - y70);

    // Band border lines
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // 70% line
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y70);
    ctx.lineTo(paddingLeft + chartW, y70);
    ctx.stroke();

    // 40% line
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y40);
    ctx.lineTo(paddingLeft + chartW, y40);
    ctx.stroke();

    // 55% Setpoint dotted line
    const y55 = y(SETPOINT);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)';
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y55);
    ctx.lineTo(paddingLeft + chartW, y55);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Y-Axis Labels
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#78716c';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ctx.fillText('100%', paddingLeft - 6, y(100));
    ctx.fillText('70%', paddingLeft - 6, y70);
    ctx.fillText('55%', paddingLeft - 6, y55);
    ctx.fillText('40%', paddingLeft - 6, y40);
    ctx.fillText('0%', paddingLeft - 6, y(0));

    // Target band annotation
    ctx.fillStyle = '#059669';
    ctx.textAlign = 'left';
    ctx.fillText('Optimal Band (40–70%)', paddingLeft + 8, y70 + 12);

    if (data.length === 0) {
      ctx.fillStyle = '#a8a29e';
      ctx.textAlign = 'center';
      ctx.fillText('No readings recorded yet', w / 2, h / 2);
      return;
    }

    // 3. Moisture Area Fill
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0].m));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(x(i), y(data[i].m));
    }
    ctx.lineTo(x(data.length - 1), y(0));
    ctx.lineTo(x(0), y(0));
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, paddingTop, 0, h - paddingBottom);
    grad.addColorStop(0, 'rgba(5, 150, 105, 0.25)');
    grad.addColorStop(1, 'rgba(5, 150, 105, 0.01)');
    ctx.fillStyle = grad;
    ctx.fill();

    // 4. Moisture Line
    ctx.beginPath();
    ctx.moveTo(x(0), y(data[0].m));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(x(i), y(data[i].m));
    }
    ctx.strokeStyle = '#059669';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 5. Draw Points / Irrigation markers
    for (let i = 0; i < data.length; i++) {
      const px = x(i);
      const py = y(data[i].m);

      if (data[i].irrigating) {
        // Irrigation flag marker
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (i === data.length - 1) {
        // Latest current reading dot
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // 6. X-Axis Time Labels
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.fillStyle = '#a8a29e';
    ctx.textBaseline = 'top';

    if (data.length >= 2) {
      ctx.textAlign = 'left';
      ctx.fillText(data[0].ts.slice(11, 16) || 'Start', paddingLeft, h - paddingBottom + 6);

      const midIdx = Math.floor(data.length / 2);
      ctx.textAlign = 'center';
      ctx.fillText(data[midIdx].ts.slice(11, 16) || 'Mid', x(midIdx), h - paddingBottom + 6);

      ctx.textAlign = 'right';
      ctx.fillText(data[data.length - 1].ts.slice(11, 16) || 'Latest', paddingLeft + chartW, h - paddingBottom + 6);
    }
  }, [data, height]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!interactive || data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;

    const paddingLeft = 36;
    const paddingRight = 16;
    const chartW = rect.width - paddingLeft - paddingRight;

    if (clientX < paddingLeft || clientX > rect.width - paddingRight) {
      setHoveredPoint(null);
      return;
    }

    const relX = clientX - paddingLeft;
    const index = Math.round((relX / chartW) * (data.length - 1));
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index));
    const point = data[clampedIndex];

    const posX = paddingLeft + (clampedIndex / (data.length - 1)) * chartW;
    const paddingTop = 20;
    const chartH = height - paddingTop - 24;
    const posY = paddingTop + chartH - (Math.max(0, Math.min(100, point.m)) / 100) * chartH;

    setHoveredPoint({ x: posX, y: posY, point });
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  return (
    <div className="relative w-full overflow-hidden select-none">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="w-full block"
      />

      {hoveredPoint && (
        <div
          className="absolute z-10 pointer-events-none transform -translate-x-1/2 -translate-y-full mb-2 bg-stone-900/95 dark:bg-stone-800/95 text-stone-100 px-2.5 py-1.5 rounded shadow-lg text-xs font-mono border border-stone-700 whitespace-nowrap"
          style={{ left: `${hoveredPoint.x}px`, top: `${hoveredPoint.y}px` }}
        >
          <div className="font-semibold text-emerald-400">
            Moisture: {hoveredPoint.point.m.toFixed(1)}%
          </div>
          <div className="text-[10px] text-stone-400 flex items-center gap-2">
            <span>{hoveredPoint.point.ts.replace('T', ' ').slice(11, 16)}</span>
            {hoveredPoint.point.T !== undefined && <span>{hoveredPoint.point.T}°C</span>}
            {hoveredPoint.point.RH !== undefined && <span>{hoveredPoint.point.RH}% RH</span>}
          </div>
          {hoveredPoint.point.irrigating && (
            <div className="text-[10px] text-sky-400 font-sans">Watering Active</div>
          )}
        </div>
      )}
    </div>
  );
};
