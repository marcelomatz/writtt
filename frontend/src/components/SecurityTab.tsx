import { useEffect, useState } from 'react';
import {
  Shield,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  KeyRound,
  Hash,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import {
  GetSecurityConfig,
  SetPassword,
  RemovePassword,
  UnlockVault,
  LockVault,
  IsVaultUnlocked,
  SetVaultPIN,
  RemoveVaultPIN,
} from '../../wailsjs/go/main/App';
import { useSecurityStore } from '../store/securityStore';

type Mode =
  | 'idle'
  | 'enabling'
  | 'disabling'
  | 'unlocking'
  | 'changing'
  | 'pinSetting'
  | 'pinRemoving';

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

function PasswordField({ label, value, onChange, placeholder, autoFocus }: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative max-w-sm">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-xl px-4 py-3 outline-none transition-all border font-mono text-sm pr-10"
          style={{
            backgroundColor: 'var(--bg-base)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function PINField({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative max-w-xs">
        <input
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="4–8 dígitos"
          autoFocus={autoFocus}
          className="w-full rounded-xl px-4 py-3 outline-none transition-all border pr-10 font-mono text-center tracking-[0.4em] text-sm"
          style={{
            backgroundColor: 'var(--bg-base)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/** Compact inline action form – slide-in panel */
function ActionPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 pt-6 border-t animate-in fade-in slide-in-from-top-2 duration-300 space-y-4"
      style={{ borderColor: 'var(--border-subtle)' }}>
      {children}
    </div>
  );
}

function ActionButtons({
  onConfirm,
  onCancel,
  saving,
  confirmLabel,
  danger,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  confirmLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button
        onClick={onConfirm}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 text-white"
        style={{ backgroundColor: danger ? '#dc2626' : 'var(--accent)' }}
        onMouseEnter={e => { if (!saving) e.currentTarget.style.opacity = '0.9'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {confirmLabel}
      </button>
      <button
        onClick={onCancel}
        className="px-4 py-2.5 text-sm transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        Cancelar
      </button>
    </div>
  );
}

/** Toggle switch */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0"
      style={{ backgroundColor: on ? 'var(--accent)' : 'var(--border)' }}
    >
      <div
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300"
        style={{ left: on ? '1.375rem' : '0.25rem' }}
      />
    </button>
  );
}

/** Section block — card-style */
function Section({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      {children}
    </div>
  );
}

export function SecurityTab() {
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [vaultPINEnabled, setVaultPINEnabled] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const { setVaultUnlocked: setGlobalVaultUnlocked, setVaultPINEnabled: setGlobalPINEnabled } = useSecurityStore();
  const [mode, setMode] = useState<Mode>('idle');
  const [loading, setLoading] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pinValue, setPINValue] = useState('');
  const [pinConfirm, setPINConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setPINValue(''); setPINConfirm(''); setError(''); setSuccess(''); setMode('idle');
  };

  const refreshState = async () => {
    try {
      const cfg = await GetSecurityConfig();
      setPasswordEnabled(cfg.password_enabled);
      const pinOn = cfg.vault_pin_enabled ?? false;
      setVaultPINEnabled(pinOn);
      setGlobalPINEnabled(pinOn);
      const unlocked = await IsVaultUnlocked();
      setVaultUnlocked(unlocked);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refreshState().finally(() => setLoading(false));
  }, []);

  const showSuccess = (msg: string) => {
    setSuccess(msg); setTimeout(() => setSuccess(''), 3500);
  };

  const handleSetPassword = async () => {
    if (!newPassword) { setError('Digite a nova senha.'); return; }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem.'); return; }
    if (newPassword.length < 6) { setError('A senha deve ter pelo menos 6 caracteres.'); return; }
    setSaving(true); setError('');
    try {
      await SetPassword(currentPassword, newPassword);
      await refreshState(); resetForm(); showSuccess('Senha configurada com sucesso.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const handleRemovePassword = async () => {
    if (!currentPassword) { setError('Digite sua senha atual.'); return; }
    setSaving(true); setError('');
    try {
      await RemovePassword(currentPassword);
      await refreshState(); resetForm(); showSuccess('Proteção por senha removida.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const handleUnlock = async () => {
    if (!currentPassword) { setError('Digite sua senha.'); return; }
    setSaving(true); setError('');
    try {
      const ok = await UnlockVault(currentPassword);
      if (ok) {
        setGlobalVaultUnlocked(true);
        await refreshState(); resetForm(); showSuccess('Cofre desbloqueado.');
      } else { setError('Senha incorreta.'); }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const handleLock = async () => {
    await LockVault(); setGlobalVaultUnlocked(false);
    await refreshState(); showSuccess('Cofre bloqueado.');
  };

  const handleSetPIN = async () => {
    if (!currentPassword) { setError('Confirme sua senha do cofre.'); return; }
    if (pinValue.length < 4) { setError('O PIN deve ter pelo menos 4 dígitos.'); return; }
    if (pinValue !== pinConfirm) { setError('Os PINs não coincidem.'); return; }
    setSaving(true); setError('');
    try {
      await SetVaultPIN(currentPassword, pinValue);
      await refreshState(); resetForm(); showSuccess('PIN do cofre configurado.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  const handleRemovePIN = async () => {
    if (!currentPassword) { setError('Confirme sua senha do cofre.'); return; }
    setSaving(true); setError('');
    try {
      await RemoveVaultPIN(currentPassword);
      await refreshState(); resetForm(); showSuccess('PIN do cofre removido.');
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-light">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-10">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)', boxShadow: '0 4px 14px rgba(99,102,241,0.25)' }}
          >
            <Shield className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-2xl font-extralight tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Segurança
            </h3>
            <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
              {passwordEnabled ? 'Seus documentos estão protegidos.' : 'Nenhuma proteção ativa no momento.'}
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
          style={
            passwordEnabled
              ? { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)', color: '#6366f1' }
              : { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }
          }
        >
          {passwordEnabled
            ? <><ShieldCheck className="w-3.5 h-3.5" /> Protegido com senha</>
            : <><ShieldOff className="w-3.5 h-3.5" /> Sem proteção</>
          }
        </div>
      </div>

      {/* ── Feedback ── */}
      {success && (
        <div className="flex items-center gap-2 text-sm animate-in fade-in duration-300" style={{ color: '#16a34a' }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-sm animate-in fade-in duration-300" style={{ color: '#dc2626' }}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4 max-w-lg">

        {/* ── Senha ── */}
        <Section>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(99,102,241,0.1)' }}
              >
                <KeyRound className="w-4 h-4" style={{ color: '#6366f1' }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Senha de acesso
                </p>
                <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Exige autenticação ao abrir o app
                </p>
              </div>
            </div>
            <Toggle
              on={passwordEnabled}
              onClick={() => { resetForm(); setMode(passwordEnabled ? 'disabling' : 'enabling'); }}
            />
          </div>

          {/* Enabling */}
          {mode === 'enabling' && (
            <ActionPanel>
              <PasswordField label="Nova Senha" value={newPassword} onChange={setNewPassword} placeholder="Mínimo 6 caracteres" autoFocus />
              <PasswordField label="Confirmar Senha" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repita a senha" />
              <ActionButtons onConfirm={handleSetPassword} onCancel={resetForm} saving={saving} confirmLabel="Ativar Senha" />
            </ActionPanel>
          )}

          {/* Disabling */}
          {mode === 'disabling' && (
            <ActionPanel>
              <p className="text-xs rounded-xl px-3 py-2 border" style={{ color: '#b45309', backgroundColor: 'rgba(217,119,6,0.08)', borderColor: 'rgba(217,119,6,0.2)' }}>
                ⚠️ Os documentos do cofre serão descriptografados no disco.
              </p>
              <PasswordField label="Senha Atual" value={currentPassword} onChange={setCurrentPassword} placeholder="Confirme sua senha" autoFocus />
              <ActionButtons onConfirm={handleRemovePassword} onCancel={resetForm} saving={saving} confirmLabel="Desativar Proteção" danger />
            </ActionPanel>
          )}

          {/* Change password link */}
          {passwordEnabled && mode === 'idle' && (
            <ActionPanel>
              <button
                onClick={() => { resetForm(); setMode('changing'); }}
                className="text-xs font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                Alterar senha →
              </button>
            </ActionPanel>
          )}

          {/* Changing */}
          {mode === 'changing' && (
            <ActionPanel>
              <PasswordField label="Senha Atual" value={currentPassword} onChange={setCurrentPassword} placeholder="Sua senha atual" autoFocus />
              <PasswordField label="Nova Senha" value={newPassword} onChange={setNewPassword} placeholder="Mínimo 6 caracteres" />
              <PasswordField label="Confirmar Nova Senha" value={confirmPassword} onChange={setConfirmPassword} placeholder="Repita a nova senha" />
              <ActionButtons onConfirm={handleSetPassword} onCancel={resetForm} saving={saving} confirmLabel="Alterar Senha" />
            </ActionPanel>
          )}
        </Section>

        {/* ── Cofre ── */}
        {passwordEnabled && (
          <Section>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: vaultUnlocked ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }}
                >
                  {vaultUnlocked
                    ? <Unlock className="w-4 h-4" style={{ color: '#10b981' }} strokeWidth={1.5} />
                    : <Lock className="w-4 h-4" style={{ color: '#f59e0b' }} strokeWidth={1.5} />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Cofre</p>
                  <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {vaultUnlocked ? 'Desbloqueado — documentos secretos visíveis' : 'Bloqueado — documentos secretos inacessíveis'}
                  </p>
                </div>
              </div>
              <button
                onClick={vaultUnlocked ? handleLock : () => { resetForm(); setMode('unlocking'); }}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={
                  vaultUnlocked
                    ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                    : { borderColor: 'rgba(99,102,241,0.4)', color: '#6366f1', backgroundColor: 'rgba(99,102,241,0.06)' }
                }
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                {vaultUnlocked ? 'Bloquear' : 'Desbloquear'}
              </button>
            </div>

            {/* Unlock form */}
            {mode === 'unlocking' && (
              <ActionPanel>
                <PasswordField label="Senha do Cofre" value={currentPassword} onChange={setCurrentPassword} placeholder="Digite sua senha" autoFocus />
                <ActionButtons onConfirm={handleUnlock} onCancel={resetForm} saving={saving} confirmLabel="Desbloquear" />
              </ActionPanel>
            )}

            {/* Vault explanation */}
            <div className="mt-5 pt-5 space-y-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                O <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Cofre</strong> é uma camada separada dentro do app.
                Cada arquivo marcado como Cofre é cifrado individualmente com{' '}
                <code className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>AES-256-GCM</code>.
                Mesmo com o app aberto, um acesso indevido ao computador não expõe esses documentos.
              </p>
            </div>
          </Section>
        )}

        {/* ── PIN do Cofre ── */}
        {passwordEnabled && (
          <Section>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}
                >
                  <Hash className="w-4 h-4" style={{ color: '#3b82f6' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>PIN do Cofre</p>
                  <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {vaultPINEnabled ? 'PIN ativo — use no lugar da senha' : 'Atalho numérico (4–8 dígitos) para desbloquear'}
                  </p>
                </div>
              </div>
              <Toggle
                on={vaultPINEnabled}
                onClick={() => { resetForm(); setMode(vaultPINEnabled ? 'pinRemoving' : 'pinSetting'); }}
              />
            </div>

            {/* Set PIN */}
            {mode === 'pinSetting' && (
              <ActionPanel>
                <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
                  Confirme a senha do cofre para criar um PIN de acesso rápido.
                </p>
                <PasswordField label="Senha do Cofre" value={currentPassword} onChange={setCurrentPassword} placeholder="Confirme sua senha" autoFocus />
                <PINField label="Novo PIN (4–8 dígitos)" value={pinValue} onChange={setPINValue} />
                <PINField label="Confirmar PIN" value={pinConfirm} onChange={setPINConfirm} />
                <ActionButtons onConfirm={handleSetPIN} onCancel={resetForm} saving={saving} confirmLabel="Ativar PIN" />
              </ActionPanel>
            )}

            {/* Remove PIN */}
            {mode === 'pinRemoving' && (
              <ActionPanel>
                <PasswordField label="Senha do Cofre" value={currentPassword} onChange={setCurrentPassword} placeholder="Confirme sua senha" autoFocus />
                <ActionButtons onConfirm={handleRemovePIN} onCancel={resetForm} saving={saving} confirmLabel="Remover PIN" danger />
              </ActionPanel>
            )}

            {/* Change PIN link */}
            {vaultPINEnabled && mode === 'idle' && (
              <ActionPanel>
                <button
                  onClick={() => { resetForm(); setMode('pinSetting'); }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--accent)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  Alterar PIN →
                </button>
              </ActionPanel>
            )}
          </Section>
        )}

        {/* ── Aviso final ── */}
        <div
          className="flex gap-3 p-4 rounded-2xl border"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <Shield className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Documentos do Cofre usam <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>AES-256-GCM</strong> com derivação{' '}
            <strong style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>Argon2id</strong>.
            Apenas você, com a senha correta, pode abrir esses arquivos.{' '}
            <span style={{ color: '#b45309' }}>Se perder a senha, o conteúdo não pode ser recuperado.</span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecurityTab;
