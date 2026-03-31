import { NodeViewWrapper } from '@tiptap/react';
import {
  ArrowRight,
  Circle,
  Eraser,
  Minus,
  Pencil,
  Square,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type Tool = 'pen' | 'eraser' | 'line' | 'rect' | 'circle' | 'arrow';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  color: string;
  width: number;
  points: Point[];
}

const COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6'];
const WIDTHS = [2, 4, 6];

export function DrawingNodeView({ node, updateAttributes, selected }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#000000');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [strokes, setStrokes] = useState<Stroke[]>(() => {
    try {
      return JSON.parse(node.attrs['data-strokes'] || '[]');
    } catch {
      return [];
    }
  });

  // Use refs for drawing state to avoid stale closures
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const canvasHeight = Number.parseInt(node.attrs.height, 10) || 300;

  // Convert client coords → canvas logical coords (no scaling tricks)
  const getLogicalPos = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const renderStrokes = useCallback(
    (allStrokes: Stroke[], activeStroke?: Stroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const toDraw = activeStroke ? [...allStrokes, activeStroke] : allStrokes;

      for (const s of toDraw) {
        if (s.points.length < 2 && s.tool !== 'pen') continue;
        if (s.points.length < 1) continue;

        ctx.strokeStyle = s.tool === 'eraser' ? '#ffffff' : s.color;
        ctx.lineWidth = s.tool === 'eraser' ? s.width * 4 : s.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation =
          s.tool === 'eraser' ? 'destination-out' : 'source-over';

        if (s.tool === 'pen' || s.tool === 'eraser') {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y);
          }
          ctx.stroke();
        } else if (s.tool === 'line' || s.tool === 'arrow') {
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          if (s.tool === 'arrow' && s.points.length >= 2) {
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const headLen = 12 + s.width * 2;
            ctx.beginPath();
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - headLen * Math.cos(angle - Math.PI / 6),
              end.y - headLen * Math.sin(angle - Math.PI / 6),
            );
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(
              end.x - headLen * Math.cos(angle + Math.PI / 6),
              end.y - headLen * Math.sin(angle + Math.PI / 6),
            );
            ctx.stroke();
          }
        } else if (s.tool === 'rect') {
          if (s.points.length < 2) continue;
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
        } else if (s.tool === 'circle') {
          if (s.points.length < 2) continue;
          const start = s.points[0];
          const end = s.points[s.points.length - 1];
          const rx = Math.abs(end.x - start.x) / 2;
          const ry = Math.abs(end.y - start.y) / 2;
          const cx = start.x + (end.x - start.x) / 2;
          const cy = start.y + (end.y - start.y) / 2;
          if (rx > 0 && ry > 0) {
            ctx.beginPath();
            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    [],
  );

  // Initialize canvas dimensions — 1:1 with CSS size (no HiDPI scaling to keep coords simple)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        canvas.width = rect.width;
        canvas.height = canvasHeight;
        renderStrokes(strokesRef.current);
      }
    };

    // Delay one frame to ensure layout is computed
    requestAnimationFrame(initCanvas);

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(initCanvas);
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasHeight, renderStrokes]);

  // Redraw on strokes change
  useEffect(() => {
    renderStrokes(strokes);
  }, [strokes, renderStrokes]);

  // Use native events to bypass ProseMirror event capturing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const pos = getLogicalPos(e.clientX, e.clientY);
      drawingRef.current = true;
      currentStrokeRef.current = {
        tool,
        color,
        width: strokeWidth,
        points: [pos],
      };
      canvas.setPointerCapture(e.pointerId);
    };

    const handleMove = (e: PointerEvent) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      const pos = getLogicalPos(e.clientX, e.clientY);

      if (currentStrokeRef.current.tool === 'pen' || currentStrokeRef.current.tool === 'eraser') {
        currentStrokeRef.current.points.push(pos);
      } else {
        currentStrokeRef.current.points = [currentStrokeRef.current.points[0], pos];
      }

      renderStrokes(strokesRef.current, currentStrokeRef.current);
    };

    const handleUp = (e: PointerEvent) => {
      if (!drawingRef.current || !currentStrokeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      drawingRef.current = false;

      if (currentStrokeRef.current.points.length >= 2) {
        const newStrokes = [...strokesRef.current, currentStrokeRef.current];
        setStrokes(newStrokes);
        strokesRef.current = newStrokes;

        updateAttributes({
          'data-strokes': JSON.stringify(newStrokes),
        });

        // Save image data
        const imageData = canvas.toDataURL('image/png');
        updateAttributes({ 'data-image': imageData });
      }
      currentStrokeRef.current = null;
    };

    canvas.addEventListener('pointerdown', handleDown, { capture: true });
    canvas.addEventListener('pointermove', handleMove, { capture: true });
    canvas.addEventListener('pointerup', handleUp, { capture: true });
    canvas.addEventListener('pointerleave', handleUp, { capture: true });

    return () => {
      canvas.removeEventListener('pointerdown', handleDown, { capture: true });
      canvas.removeEventListener('pointermove', handleMove, { capture: true });
      canvas.removeEventListener('pointerup', handleUp, { capture: true });
      canvas.removeEventListener('pointerleave', handleUp, { capture: true });
    };
  }, [tool, color, strokeWidth, getLogicalPos, renderStrokes, updateAttributes]);

  const clearCanvas = useCallback(() => {
    setStrokes([]);
    strokesRef.current = [];
    updateAttributes({ 'data-strokes': '[]', 'data-image': '' });
  }, [updateAttributes]);

  const toolItems: { id: Tool; icon: React.ElementType; label: string }[] = [
    { id: 'pen', icon: Pencil, label: 'Lápis' },
    { id: 'eraser', icon: Eraser, label: 'Borracha' },
    { id: 'line', icon: Minus, label: 'Linha' },
    { id: 'arrow', icon: ArrowRight, label: 'Seta' },
    { id: 'rect', icon: Square, label: 'Retângulo' },
    { id: 'circle', icon: Circle, label: 'Círculo' },
  ];

  return (
    <NodeViewWrapper>
      <div
        ref={wrapperRef}
        className={`drawing-wrapper ${selected ? 'selected' : ''}`}
        contentEditable={false}
      >
        {/* Drawing Toolbar */}
        <div className="drawing-toolbar">
          {toolItems.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? 'active' : ''}
              onClick={() => setTool(t.id)}
              title={t.label}
              type="button"
            >
              <t.icon className="w-4 h-4" strokeWidth={1.5} />
            </button>
          ))}

          <span className="separator" />

          {COLORS.map((c) => (
            <button
              key={c}
              className={color === c ? 'active' : ''}
              onClick={() => setColor(c)}
              title={c}
              type="button"
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid var(--accent)' : '2px solid var(--border)',
                padding: 0,
                minWidth: 'unset',
              }}
            />
          ))}

          <span className="separator" />

          {WIDTHS.map((w) => (
            <button
              key={w}
              className={strokeWidth === w ? 'active' : ''}
              onClick={() => setStrokeWidth(w)}
              title={`${w}px`}
              type="button"
            >
              <span
                style={{
                  width: `${Math.min(w * 3, 16)}px`,
                  height: `${Math.min(w, 6)}px`,
                  background: 'currentColor',
                  borderRadius: 2,
                  display: 'block',
                }}
              />
            </button>
          ))}

          <span className="separator" />

          <button onClick={clearCanvas} title="Limpar" type="button">
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          style={{ width: '100%', height: `${canvasHeight}px` }}
        />
      </div>
    </NodeViewWrapper>
  );
}
