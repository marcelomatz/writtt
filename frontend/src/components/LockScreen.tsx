import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { UnlockApp, UnlockVaultWithPIN } from '../../wailsjs/go/main/App';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const dict = {
  pt: {
    err_pin_pass: 'Digite sua senha ou PIN.',
    err_pass: 'Digite sua senha.',
    err_incorrect: 'Credencial incorreta. Tente novamente.',
    err_verify: 'Erro ao verificar credencial.',
    placeholder_pin: 'PIN ou Senha',
    placeholder_pass: 'Senha',
    btn_unlock: 'Desbloquear',
  },
  en: {
    err_pin_pass: 'Enter your password or PIN.',
    err_pass: 'Enter your password.',
    err_incorrect: 'Incorrect credential. Try again.',
    err_verify: 'Error verifying credential.',
    placeholder_pin: 'PIN or Password',
    placeholder_pass: 'Password',
    btn_unlock: 'Unlock',
  },
};

interface LockScreenProps {
  onUnlocked: () => void;
  vaultPINEnabled?: boolean;
  isMidSessionLock?: boolean;
}

function looksLikePIN(value: string): boolean {
  return /^\d{1,8}$/.test(value);
}

export function LockScreen({
  onUnlocked,
  vaultPINEnabled = false,
  isMidSessionLock = false,
}: LockScreenProps) {
  const t = useTranslation(dict);
  const { theme } = useEditorStore();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPINMode = vaultPINEnabled && isMidSessionLock && looksLikePIN(value);

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
      setError(vaultPINEnabled && isMidSessionLock ? t.err_pin_pass : t.err_pass);
      triggerShake();
      return;
    }

    setLoading(true);
    setError('');

    try {
      let ok = false;

      if (isPINMode) {
        ok = await UnlockVaultWithPIN(value);
        if (!ok) {
          ok = await UnlockApp(value);
        }
      } else {
        ok = await UnlockApp(value);
      }

      if (ok) {
        onUnlocked();
      } else {
        setError(t.err_incorrect);
        setValue('');
        triggerShake();
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes('try again') || msg.toLowerCase().includes('tente')) {
        setError(msg);
      } else {
        setError(t.err_verify);
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
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border opacity-[0.03] dark:opacity-[0.05] animate-pulse"
        style={{ borderColor: 'var(--text-primary)', animationDuration: '4s' }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full border opacity-[0.05] dark:opacity-[0.08] animate-pulse"
        style={{ borderColor: 'var(--text-primary)', animationDuration: '6s' }}
      />

      <div
        className={`relative flex flex-col items-center gap-8 p-10 rounded-3xl w-[380px] animate-in fade-in zoom-in-95 duration-500 ${
          shake ? 'animate-shake' : ''
        }`}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.08), 0 0 0 1px var(--border-subtle)',
        }}
      >
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
              placeholder={canUsePIN ? t.placeholder_pin : t.placeholder_pass}
              className="w-full px-4 py-3.5 rounded-xl text-sm font-mono outline-none transition-all duration-200 pr-10"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: error ? '1px solid rgb(239 68 68)' : '1px solid var(--border)',
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

          {error && (
            <div className="flex items-center gap-2 text-red-500 dark:text-red-400 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

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
                {t.btn_unlock}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

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
