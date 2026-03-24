import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { UnlockApp, UnlockVaultWithPIN } from '../../wailsjs/go/main/App';
import { useEditorStore } from '../store/editorStore';

interface LockScreenProps {
  onUnlocked: () => void;
  /** Whether the user has a vault PIN configured */
  vaultPINEnabled?: boolean;
  /**
   * true  = locked mid-session (CTRL+L): PIN is allowed because the vault
   *         key was already stored in memory before the lock.
   * false = startup lock: only the master password works.
   */
  isMidSessionLock?: boolean;
}

/** Returns true if the value looks like a numeric PIN (≤ 8 digits). */
function looksLikePIN(value: string): boolean {
  return /^\d{1,8}$/.test(value);
}

export function LockScreen({
  onUnlocked,
  vaultPINEnabled = false,
  isMidSessionLock = false,
}: LockScreenProps) {
  const { theme } = useEditorStore();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // true when user is likely entering a PIN (auto-detected)
  const isPINMode = vaultPINEnabled && isMidSessionLock && looksLikePIN(value);

  // Apply theme class so the lock screen matches the selected theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 600);
  };

  const handleUnlock = async () => {
    if (!value) {
      setError(vaultPINEnabled && isMidSessionLock ? 'Digite sua senha ou PIN.' : 'Digite sua senha.');
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      let ok = false;

      if (isPINMode) {
        // Mid-session + looks like a PIN → try PIN first
        ok = await UnlockVaultWithPIN(value);
        if (!ok) {
          // Fall back to password in case they typed a numeric password
          ok = await UnlockApp(value);
        }
      } else {
        ok = await UnlockApp(value);
      }

      if (ok) {
        onUnlocked();
      } else {
        setError('Credencial incorreta. Tente novamente.');
        setValue('');
        triggerShake();
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Surface brute-force lockout message from backend
      if (msg.toLowerCase().includes('try again') || msg.toLowerCase().includes('tente')) {
        setError(msg);
      } else {
        setError('Erro ao verificar credencial.');
      }
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleUnlock();
    if (e.key === 'Escape') setValue('');
  };

  const canUsePIN = vaultPINEnabled && isMidSessionLock;

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-[9999] select-none"
      style={{
        backgroundColor: 'var(--bg-base)',
        backgroundImage:
          'radial-gradient(ellipse 100% 60% at 50% 0%, rgba(99,102,241,0.06) 0%, transparent 65%)',
      }}
    >
      {/* Subtle animated rings */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border opacity-[0.03] dark:opacity-[0.05] animate-pulse"
        style={{ borderColor: 'var(--text-primary)', animationDuration: '4s' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border opacity-[0.05] dark:opacity-[0.08] animate-pulse"
        style={{ borderColor: 'var(--text-primary)', animationDuration: '6s' }}
      />

      {/* Card */}
      <div
        className={`relative flex flex-col items-center gap-8 p-10 rounded-3xl w-[380px] animate-in fade-in zoom-in-95 duration-500 ${shake ? 'animate-shake' : ''
          }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.08), 0 0 0 1px var(--border-subtle)',
        }}
      >
        {/* Lock icon */}
        {/* <div className="flex flex-col items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
            }}
          >
            <Lock
              className="w-6 h-6 text-slate-500 dark:text-slate-400"
              strokeWidth={1.5}
            />
          </div>

          <div className="text-center">
            <h1 className="text-xl font-light text-slate-900 dark:text-white tracking-tight">
              Writtt está bloqueado
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {canUsePIN
                ? 'Digite sua senha ou PIN para continuar'
                : 'Digite sua senha para continuar'}
            </p>
          </div>
        </div> */}

        {/* Input */}
        <div className="w-full space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder={canUsePIN ? 'PIN ou Senha' : 'Senha'}
              className="w-full px-4 py-3.5 rounded-xl text-sm font-mono outline-none transition-all duration-200 pr-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: error
                  ? '1px solid rgb(239 68 68)'
                  : '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              tabIndex={-1}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* PIN mode indicator */}
          {/* {isPINMode && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 animate-in fade-in duration-200">
              <Hash className="w-3 h-3" /> */}
          {/* <span>Modo PIN detectado</span>
            </div>
          )} */}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}

            </div>
          )}

          {/* Unlock button */}
          <button
            onClick={handleUnlock}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-60"
            style={{
              backgroundColor: 'var(--text-primary)',
              color: 'var(--bg-base)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.87';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Desbloquear
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Hint */}
        {/* <p className="text-[11px] text-slate-400 dark:text-slate-600 text-center">
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            Enter
          </kbd>{' '}
          to unlock
          {canUsePIN && (
            <span className="ml-2 opacity-60">· PIN ativado</span>
          )}
        </p> */}
      </div>

      {/* App name at bottom */}
      <p className="absolute bottom-8 text-[18px] logo-font tracking-[0.3em] text-slate-8700 dark:text-slate-900">
        Writtt.
      </p>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
        .animate-shake {
          animation: shake 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
      `}</style>
    </div>
  );
}

export default LockScreen;
