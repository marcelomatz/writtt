import { Bookmark, BookmarkX, LampDesk, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const NEUTRAL = 0.5;

function applyIllumination(value: number) {
  const root = document.documentElement;
  if (Math.abs(value - NEUTRAL) < 0.01) {
    root.style.filter = '';
    return;
  }

  if (value < NEUTRAL) {
    const t = (NEUTRAL - value) / NEUTRAL;
    root.style.filter = [
      `contrast(${(1 - t * 0.35).toFixed(3)})`,
      `saturate(${(1 - t * 0.55).toFixed(3)})`,
      `brightness(${(1 - t * 0.3).toFixed(3)})`,
    ].join(' ');
  } else {
    const t = (value - NEUTRAL) / NEUTRAL;
    root.style.filter = [
      `contrast(${(1 + t * 0.12).toFixed(3)})`,
      `saturate(${(1 + t * 0.1).toFixed(3)})`,
      `brightness(${(1 + t * 0.05).toFixed(3)})`,
    ].join(' ');
  }
}

const FAV_KEY = (theme: 'light' | 'dark') => `writtt_illum_fav_${theme}`;
const loadFav = (t: 'light' | 'dark') => {
  const r = localStorage.getItem(FAV_KEY(t));
  return r ? parseFloat(r) : null;
};
const saveFav = (t: 'light' | 'dark', v: number) => localStorage.setItem(FAV_KEY(t), v.toFixed(4));
const clearFav = (t: 'light' | 'dark') => localStorage.removeItem(FAV_KEY(t));

const dict = {
  pt: {
    neutral: 'Neutro',
    soft: 'suave',
    vivid: 'vívido',
    adjust: 'Ajustar iluminação',
    illumination: 'Iluminação',
    close: 'Fechar',
    reset: 'neutro',
    reset_tooltip: 'Resetar para neutro (R)',
    soft_label: 'Suave',
    vivid_label: 'Vívido',
    favorite: 'Favorito',
    fav_saved: '✓ Favorito salvo',
    no_fav: 'Nenhum favorito salvo',
    restore: 'Restaurar',
    restore_tooltip: 'Restaurar favorito',
    remove_tooltip: 'Remover favorito',
    save_current: 'Salvar atual',
    save_tooltip: 'Salvar iluminação atual como favorita',
    shortcut_adjust: '← → ajustar',
    shortcut_step: 'shift ± passo grande',
    shortcut_reset: 'R neutro',
    aria_slider: 'Iluminação da tela',
  },
  en: {
    neutral: 'Neutral',
    soft: 'soft',
    vivid: 'vivid',
    adjust: 'Adjust brightness',
    illumination: 'Brightness',
    close: 'Close',
    reset: 'neutral',
    reset_tooltip: 'Reset to neutral (R)',
    soft_label: 'Soft',
    vivid_label: 'Vivid',
    favorite: 'Favorite',
    fav_saved: '✓ Favorite saved',
    no_fav: 'No favorite saved',
    restore: 'Restore',
    restore_tooltip: 'Restore favorite',
    remove_tooltip: 'Remove favorite',
    save_current: 'Save current',
    save_tooltip: 'Save current brightness as favorite',
    shortcut_adjust: '← → adjust',
    shortcut_step: 'shift ± big step',
    shortcut_reset: 'R neutral',
    aria_slider: 'Screen brightness',
  },
};

function formatLabel(v: number, t: typeof dict.pt) {
  if (Math.abs(v - NEUTRAL) < 0.01) return t.neutral;
  const pct = Math.round((Math.abs(v - NEUTRAL) / NEUTRAL) * 100);
  return v < NEUTRAL ? `−${pct}% (${t.soft})` : `+${pct}% (${t.vivid})`;
}

export function BrightnessControl() {
  const t = useTranslation(dict);
  const theme = useEditorStore((s) => s.theme);

  const [open, setOpen] = useState(false);
  const [illumination, setIllum] = useState(() => loadFav(theme) ?? NEUTRAL);
  const [dragging, setDragging] = useState(false);
  const [fav, setFav] = useState<number | null>(() => loadFav(theme));
  const [savedFlash, setSaved] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const startVal = useRef(NEUTRAL);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = loadFav(theme);
    setFav(saved);
    const initial = saved ?? NEUTRAL;
    setIllum(initial);
    applyIllumination(initial);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
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

  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const update = useCallback((v: number) => {
    const c = clamp(v);
    setIllum(c);
    applyIllumination(c);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      const clickVal = clamp((e.clientX - rect.left) / rect.width);
      update(clickVal);
      startX.current = e.clientX;
      startVal.current = clickVal;
      setDragging(true);
    },
    [update]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clickVal = clamp((e.clientX - rect.left) / rect.width);
      update(clickVal);
    },
    [dragging, update]
  );

  const onPointerUp = useCallback(() => setDragging(false), []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        update(illumination + step);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        update(illumination - step);
      }
      if (e.key === 'Home') {
        e.preventDefault();
        update(0);
      }
      if (e.key === 'End') {
        e.preventDefault();
        update(1);
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        update(NEUTRAL);
      }
    },
    [illumination, update]
  );

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

  const handleReset = useCallback(() => update(NEUTRAL), [update]);

  const isBelowNeutral = illumination < NEUTRAL - 0.01;
  const isAboveNeutral = illumination > NEUTRAL + 0.01;
  const isNeutral = !isBelowNeutral && !isAboveNeutral;
  const thumbPct = illumination * 100;
  const trackColor = isBelowNeutral ? 'var(--text-secondary)' : 'var(--accent)';
  const favPct = fav !== null ? fav * 100 : null;

  const triggerActive = !isNeutral;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t.adjust}
        className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-200"
        style={{
          background: open || triggerActive ? 'var(--bg-elevated)' : 'none',
          border:
            open || triggerActive ? '1px solid var(--border-subtle)' : '1px solid transparent',
          color: triggerActive ? 'var(--accent)' : 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <LampDesk className="w-3.5 h-3.5" strokeWidth={triggerActive ? 2 : 1.75} />
      </button>

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
          <div className="flex items-center justify-between mb-5">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.07em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t.illumination}
            </span>
            <button
              onClick={() => setOpen(false)}
              title={t.close}
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.5,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-4">
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: isNeutral ? 'var(--text-secondary)' : 'var(--text-primary)',
              }}
            >
              {formatLabel(illumination, t)}
            </span>
            {!isNeutral && (
              <button
                onClick={handleReset}
                title={t.reset_tooltip}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all duration-150"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  letterSpacing: '0.03em',
                }}
              >
                <RotateCcw className="w-3 h-3" />
                {t.reset}
              </button>
            )}
          </div>

          <div
            ref={trackRef}
            role="slider"
            aria-label={t.aria_slider}
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
            <div
              className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
              style={{
                width: `${thumbPct}%`,
                backgroundColor: trackColor,
                opacity: isBelowNeutral ? 0.5 : 0.7,
                transition: dragging ? 'none' : 'width 60ms ease-out',
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full pointer-events-none"
              style={{
                left: '50%',
                width: '2px',
                height: '14px',
                backgroundColor: isNeutral
                  ? 'var(--text-muted)'
                  : 'color-mix(in srgb, var(--text-muted) 40%, transparent)',
              }}
            />
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

          <div
            className="flex justify-between mt-2 mb-5"
            style={{ fontSize: '11px', color: 'var(--text-muted)', opacity: 0.6 }}
          >
            <span>{t.soft_label}</span>
            <span>{t.vivid_label}</span>
          </div>

          <div
            style={{ height: '1px', backgroundColor: 'var(--border-subtle)', marginBottom: '16px' }}
          />

          <div className="flex items-center gap-2 mb-3">
            <Bookmark
              className="w-3.5 h-3.5 flex-shrink-0"
              style={{
                color: fav !== null ? 'var(--accent)' : 'var(--text-muted)',
                opacity: fav !== null ? 0.8 : 0.45,
              }}
              strokeWidth={1.75}
              fill={fav !== null ? 'var(--accent)' : 'none'}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              {t.favorite}
            </span>
          </div>

          <div
            className="flex items-center justify-between rounded-xl px-3 py-2.5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
          >
            <span
              style={{
                fontSize: '13px',
                color: savedFlash
                  ? 'var(--accent)'
                  : fav !== null
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                fontWeight: fav !== null ? 500 : 400,
              }}
            >
              {savedFlash ? t.fav_saved : fav !== null ? formatLabel(fav, t) : t.no_fav}
            </span>

            <div className="flex items-center gap-1.5">
              {fav !== null && (
                <>
                  <button
                    onClick={handleRestoreFav}
                    title={t.restore_tooltip}
                    className="px-2.5 py-1 rounded-lg transition-all duration-150"
                    style={{
                      fontSize: '11px',
                      color: 'var(--accent)',
                      background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      cursor: 'pointer',
                    }}
                  >
                    {t.restore}
                  </button>
                  <button
                    onClick={handleClearFav}
                    title={t.remove_tooltip}
                    className="flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150"
                    style={{
                      color: 'var(--text-muted)',
                      background: 'none',
                      border: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      opacity: 0.55,
                    }}
                  >
                    <BookmarkX className="w-3.5 h-3.5" />
                  </button>
                </>
              )}

              {fav === null && (
                <button
                  onClick={handleSaveFav}
                  title={t.save_tooltip}
                  className="px-2.5 py-1 rounded-lg transition-all duration-150"
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    background: 'color-mix(in srgb, var(--text-muted) 8%, transparent)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                  }}
                >
                  {t.save_current}
                </button>
              )}
            </div>
          </div>

          <div
            className="mt-4 flex gap-4"
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              opacity: 0.4,
              letterSpacing: '0.03em',
            }}
          >
            <span>{t.shortcut_adjust}</span>
            <span>{t.shortcut_step}</span>
            <span>{t.shortcut_reset}</span>
          </div>
        </div>
      )}
    </div>
  );
}
