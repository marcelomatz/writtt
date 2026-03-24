import { useCallback, useEffect, useRef, useState } from 'react';
import { LampDesk, Bookmark, BookmarkX, RotateCcw, X } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

/**
 * BrightnessControl — popover redesign
 *
 * Um pequeno botão (Sun) na barra de status abre um painel flutuante
 * contendo o slider de iluminação com toda a área necessária.
 *
 * Esquerda: reduz contraste/saturação/brilho → tom suave
 * Centro:   filtro neutro (nativo)
 * Direita:  realça contraste/saturação/brilho
 *
 * Favorito: um valor salvo por tema (light/dark), persistido em localStorage.
 */

const NEUTRAL = 0.5;

// ─── Aplicar filtro CSS ─────────────────────────────────────────────────────
function applyIllumination(value: number) {
  const root = document.documentElement;
  if (Math.abs(value - NEUTRAL) < 0.01) { root.style.filter = ''; return; }

  if (value < NEUTRAL) {
    const t = (NEUTRAL - value) / NEUTRAL;
    root.style.filter = [
      `contrast(${(1 - t * 0.35).toFixed(3)})`,
      `saturate(${(1 - t * 0.55).toFixed(3)})`,
      `brightness(${(1 - t * 0.30).toFixed(3)})`,
    ].join(' ');
  } else {
    const t = (value - NEUTRAL) / NEUTRAL;
    root.style.filter = [
      `contrast(${(1 + t * 0.12).toFixed(3)})`,
      `saturate(${(1 + t * 0.10).toFixed(3)})`,
      `brightness(${(1 + t * 0.05).toFixed(3)})`,
    ].join(' ');
  }
}

// ─── Persistência de favoritos ──────────────────────────────────────────────
const FAV_KEY = (theme: 'light' | 'dark') => `writtt_illum_fav_${theme}`;
const loadFav  = (t: 'light' | 'dark') => { const r = localStorage.getItem(FAV_KEY(t)); return r ? parseFloat(r) : null; };
const saveFav  = (t: 'light' | 'dark', v: number) => localStorage.setItem(FAV_KEY(t), v.toFixed(4));
const clearFav = (t: 'light' | 'dark') => localStorage.removeItem(FAV_KEY(t));

// ─── Helpers de label ────────────────────────────────────────────────────────
function label(v: number) {
  if (Math.abs(v - NEUTRAL) < 0.01) return 'Neutro';
  const pct = Math.round(Math.abs(v - NEUTRAL) / NEUTRAL * 100);
  return v < NEUTRAL ? `−${pct}% (suave)` : `+${pct}% (vívido)`;
}

// ────────────────────────────────────────────────────────────────────────────
export function BrightnessControl() {
  const theme = useEditorStore((s) => s.theme);

  const [open, setOpen]           = useState(false);
  const [illumination, setIllum]  = useState(() => loadFav(theme) ?? NEUTRAL);
  const [dragging, setDragging]   = useState(false);
  const [fav, setFav]             = useState<number | null>(() => loadFav(theme));
  const [savedFlash, setSaved]    = useState(false);

  const panelRef  = useRef<HTMLDivElement>(null);
  const trackRef  = useRef<HTMLDivElement>(null);
  const startX    = useRef(0);
  const startVal  = useRef(NEUTRAL);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sincronizar com mudança de tema ────────────────────────────────────────
  useEffect(() => {
    const saved = loadFav(theme);
    setFav(saved);
    const initial = saved ?? NEUTRAL;
    setIllum(initial);
    applyIllumination(initial);
  }, [theme]);

  // ── Fechar com Escape ou clique fora ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [open]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clamp  = (v: number) => Math.max(0, Math.min(1, v));
  const update = useCallback((v: number) => {
    const c = clamp(v);
    setIllum(c);
    applyIllumination(c);
  }, []);

  // ── Arrastar o thumb ──────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    // Click-to-position: set value directly on first click
    const rect = e.currentTarget.getBoundingClientRect();
    const clickVal = clamp((e.clientX - rect.left) / rect.width);
    update(clickVal);
    startX.current   = e.clientX;
    startVal.current = clickVal;
    setDragging(true);
  }, [update]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickVal = clamp((e.clientX - rect.left) / rect.width);
    update(clickVal);
  }, [dragging, update]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // ── Teclado ───────────────────────────────────────────────────────────────
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.10 : 0.02;
    if (e.key === 'ArrowRight') { e.preventDefault(); update(illumination + step); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); update(illumination - step); }
    if (e.key === 'Home')       { e.preventDefault(); update(0); }
    if (e.key === 'End')        { e.preventDefault(); update(1); }
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); update(NEUTRAL); }
  }, [illumination, update]);

  // ── Favorito ─────────────────────────────────────────────────────────────
  const handleSaveFav = useCallback(() => {
    saveFav(theme, illumination);
    setFav(illumination);
    setSaved(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaved(false), 1800);
  }, [theme, illumination]);

  const handleRestoreFav = useCallback(() => {
    if (fav !== null) update(fav);
  }, [fav, update]);

  const handleClearFav = useCallback(() => {
    clearFav(theme);
    setFav(null);
  }, [theme]);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => update(NEUTRAL), [update]);

  // ── Derivações ────────────────────────────────────────────────────────────
  const isBelowNeutral = illumination < NEUTRAL - 0.01;
  const isAboveNeutral = illumination > NEUTRAL + 0.01;
  const isNeutral      = !isBelowNeutral && !isAboveNeutral;
  const thumbPct       = illumination * 100;
  const trackColor     = isBelowNeutral ? 'var(--text-secondary)' : 'var(--accent)';
  const favPct         = fav !== null ? fav * 100 : null;

  // Ícone do trigger varia se não está neutro
  const triggerActive = !isNeutral;

  return (
    <div className="relative" ref={panelRef}>

      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Ajustar iluminação"
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200"
        style={{
          background: open || triggerActive ? 'var(--bg-elevated)' : 'none',
          border: open || triggerActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
          color: triggerActive ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <LampDesk className="w-3.5 h-3.5" strokeWidth={triggerActive ? 2 : 1.75} />
      </button>

      {/* ── Popover panel ── */}
      {open && (
        <div
          className="absolute z-50 rounded-2xl"
          style={{
            bottom: 'calc(100% + 10px)',
            right: 0,
            width: '300px',
            padding: '20px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.07em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Iluminação
            </span>
            <button
              onClick={() => setOpen(false)}
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current value label */}
          <div className="flex items-center justify-between mb-4">
            <span style={{ fontSize: '15px', fontWeight: 600, color: isNeutral ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {label(illumination)}
            </span>
            {!isNeutral && (
              <button
                onClick={handleReset}
                title="Resetar para neutro (R)"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-150"
                style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', cursor: 'pointer', letterSpacing: '0.03em' }}
              >
                <RotateCcw className="w-3 h-3" />
                neutro
              </button>
            )}
          </div>

          {/* ── Slider track ── */}
          <div
            ref={trackRef}
            role="slider"
            aria-label="Iluminação da tela"
            aria-valuenow={Math.round(illumination * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onKeyDown={onKeyDown}
            className="relative w-full rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{
              height: '8px',
              backgroundColor: 'var(--border-subtle, rgba(148,163,184,0.2))',
              cursor: dragging ? 'grabbing' : 'pointer',
              touchAction: 'none',
            }}
          >
            {/* Preenchimento */}
            <div
              className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
              style={{
                width: `${thumbPct}%`,
                backgroundColor: trackColor,
                opacity: isBelowNeutral ? 0.5 : 0.7,
                transition: dragging ? 'none' : 'width 60ms ease-out',
              }}
            />

            {/* Marcador neutro */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                left: '50%',
                width: '2px',
                height: '14px',
                backgroundColor: isNeutral ? 'var(--text-muted)' : 'color-mix(in srgb, var(--text-muted) 40%, transparent)',
              }}
            />

            {/* Marcador de favorito */}
            {favPct !== null && (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                style={{
                  left: `${favPct}%`,
                  width: '4px',
                  height: '4px',
                  backgroundColor: 'var(--accent)',
                  transform: 'translate(-50%, -50%) rotate(45deg)',
                  opacity: 0.7,
                }}
              />
            )}

            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                left: `${thumbPct}%`,
                width: '18px',
                height: '18px',
                backgroundColor: 'var(--bg-elevated)',
                border: `2.5px solid ${trackColor}`,
                boxShadow: dragging
                  ? `0 0 0 5px color-mix(in srgb, ${trackColor} 20%, transparent)`
                  : '0 2px 6px rgba(0,0,0,0.18)',
                transition: dragging ? 'none' : 'left 60ms ease-out, border-color 200ms',
              }}
            />
          </div>

          {/* Labels extremos */}
          <div className="flex justify-between mt-2 mb-5" style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}>
            <span>Suave</span>
            <span>Vívido</span>
          </div>

          {/* ── Divisor ── */}
          <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', marginBottom: '16px' }} />

          {/* ── Favorito section header ── */}
          <div className="flex items-center gap-2 mb-3">
            <Bookmark
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{ color: fav !== null ? 'var(--accent)' : 'var(--text-muted)', opacity: fav !== null ? 0.8 : 0.45 }}
              strokeWidth={1.75}
              fill={fav !== null ? 'var(--accent)' : 'none'}
            />
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Favorito
            </span>
          </div>

          {/* ── Favorito controls ── */}
          <div
            className="flex items-center justify-between rounded-xl px-3 py-2.5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <span style={{ fontSize: '13px', color: savedFlash ? 'var(--accent)' : fav !== null ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: fav !== null ? 500 : 400 }}>
              {savedFlash
                ? '✓ Favorito salvo'
                : fav !== null
                ? label(fav)
                : 'Nenhum favorito salvo'}
            </span>

            <div className="flex items-center gap-1.5">
              {fav !== null && (
                <>
                  <button
                    onClick={handleRestoreFav}
                    title="Restaurar favorito"
                    className="px-2.5 py-1 rounded-lg transition-all duration-150"
                    style={{ fontSize: '11px', color: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', cursor: 'pointer' }}
                  >
                    Restaurar
                  </button>
                  <button
                    onClick={handleClearFav}
                    title="Remover favorito"
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150"
                    style={{ color: 'var(--text-muted)', background: 'none', border: '1px solid var(--border-subtle)', cursor: 'pointer', opacity: 0.55 }}
                  >
                    <BookmarkX className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {fav === null && (
                <button
                  onClick={handleSaveFav}
                  title="Salvar iluminação atual como favorita"
                  className="px-2.5 py-1 rounded-lg transition-all duration-150"
                  style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'color-mix(in srgb, var(--text-muted) 8%, transparent)', border: '1px solid var(--border-subtle)', cursor: 'pointer', letterSpacing: '0.02em' }}
                >
                  Salvar atual
                </button>
              )}
            </div>
          </div>

          {/* Atalhos */}
          <div className="mt-4 flex gap-4" style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.4, letterSpacing: '0.03em' }}>
            <span>← → ajustar</span>
            <span>shift ± passo grande</span>
            <span>R neutro</span>
          </div>
        </div>
      )}
    </div>
  );
}
