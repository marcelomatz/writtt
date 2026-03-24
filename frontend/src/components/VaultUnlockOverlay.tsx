import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { UnlockVault, UnlockVaultWithPIN } from '../../wailsjs/go/main/App';
import { useSecurityStore } from '../store/securityStore';
import { useEditorStore } from '../store/editorStore';

interface VaultUnlockOverlayProps {
  pane?: 'primary';
}

/**
 * VaultUnlockOverlay — shown inside the editor panel when
 * a Vault document is open but the vault key is not in memory.
 *
 * If vaultPINEnabled → shows PIN field (numeric, short).
 * Otherwise          → shows full password field (existing behaviour).
 */
export function VaultUnlockOverlay({ pane: _pane }: VaultUnlockOverlayProps) {
  const { setVaultUnlocked, vaultPINEnabled } = useSecurityStore();
  const { primaryDoc, loadDocument } = useEditorStore();
  const doc = primaryDoc;

  const [value, setValue] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleUnlock() {
    if (!value) return;
    setLoading(true);
    setError('');
    try {
      const ok = vaultPINEnabled
        ? await UnlockVaultWithPIN(value)
        : await UnlockVault(value);

      if (ok) {
        setVaultUnlocked(true);
        if (doc?.frontmatter?.id) {
          await loadDocument(doc.frontmatter.id);
        }
      } else {
        triggerError(vaultPINEnabled ? 'PIN incorreto' : 'Senha incorreta');
      }
    } catch {
      triggerError('Erro ao verificar');
    } finally {
      setLoading(false);
    }
  }

  function triggerError(msg: string) {
    setError(msg);
    setShake(true);
    setValue('');
    setTimeout(() => setShake(false), 620);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleUnlock();
  }

  const isPIN = vaultPINEnabled;

  return (
    <div
      className="flex flex-col items-center justify-center h-full w-full select-none"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* Decorative rings */}
      <div className="relative mb-10 flex items-center justify-center">
        <div
          className="absolute w-48 h-48 rounded-full opacity-10 animate-ping"
          style={{ backgroundColor: 'var(--accent)', animationDuration: '3.5s' }}
        />
        <div
          className="absolute w-36 h-36 rounded-full opacity-15"
          style={{ border: '1px solid var(--accent)' }}
        />
        <div
          className="absolute w-24 h-24 rounded-full opacity-20"
          style={{ border: '1px solid var(--accent)' }}
        />
        {/* Vault icon */}
        <div
          className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
        >
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
            <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="12" cy="16" r="1.5" fill="currentColor"/>
          </svg>
        </div>
      </div>

      {/* Card */}
      <div
        className={`w-full max-w-xs rounded-2xl p-7 flex flex-col gap-5 transition-all ${shake ? 'animate-[shake_0.6s_ease]' : ''}`}
        style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="text-center">
          <p
            className="text-base font-semibold mb-1"
            style={{ color: 'var(--text-primary)' }}
          >
            Documento do Cofre
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'var(--text-muted)' }}
          >
            {isPIN
              ? <>Este documento está criptografado.<br />Digite o PIN do cofre para acessar.</>
              : <>Este documento está criptografado.<br />Digite sua senha para acessar o conteúdo.</>
            }
          </p>
        </div>

        {/* Input field — PIN or password */}
        <div className="relative">
          <input
            ref={inputRef}
            type={isPIN ? (showPw ? 'text' : 'password') : (showPw ? 'text' : 'password')}
            inputMode={isPIN ? 'numeric' : 'text'}
            maxLength={isPIN ? 8 : undefined}
            placeholder={isPIN ? 'PIN (4–8 dígitos)' : 'Senha do cofre'}
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-base)',
              color: 'var(--text-primary)',
              border: `1px solid ${error ? 'var(--color-danger, #ef4444)' : 'var(--border-strong)'}`,
              letterSpacing: isPIN ? '0.3em' : undefined,
              textAlign: isPIN ? 'center' : undefined,
            }}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
            tabIndex={-1}
          >
            {showPw ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-center" style={{ color: 'var(--color-danger, #ef4444)' }}>
            {error}
          </p>
        )}

        {/* Unlock button */}
        <button
          onClick={handleUnlock}
          disabled={loading || !value}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2"
          style={{
            backgroundColor: loading || !value ? 'var(--bg-hover)' : 'var(--accent)',
            color: loading || !value ? 'var(--text-muted)' : '#fff',
            cursor: loading || !value ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Verificando…
            </>
          ) : (
            isPIN ? 'Desbloquear com PIN' : 'Desbloquear Cofre'
          )}
        </button>

        <p className="text-[10px] text-center" style={{ color: 'var(--text-muted)' }}>
          O conteúdo descriptografado só fica em memória
        </p>
      </div>

      {/* Shake keyframes injected inline */}
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-8px)}
          30%{transform:translateX(8px)}
          45%{transform:translateX(-6px)}
          60%{transform:translateX(6px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
      `}</style>
    </div>
  );
}
