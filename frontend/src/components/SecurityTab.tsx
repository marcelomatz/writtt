import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
  ShieldOff,
  Unlock,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  GetSecurityConfig,
  IsVaultUnlocked,
  LockVault,
  RemovePassword,
  RemoveVaultPIN,
  SetPassword,
  SetVaultPIN,
  UnlockVault,
} from '../../wailsjs/go/main/App';
import { useTranslation } from '../hooks/useTranslation';
import { useSecurityStore } from '../store/securityStore';

const dict = {
  pt: {
    btn_cancel: 'Cancelar',
    txt_loading: 'Carregando...',
    sec_title: 'Segurança',
    sec_desc_on: 'Seus documentos estão protegidos.',
    sec_desc_off: 'Nenhuma proteção ativa no momento.',
    status_on: 'Protegido com senha',
    status_off: 'Sem proteção',
    pwd_title: 'Senha de acesso',
    pwd_desc: 'Exige autenticação ao abrir o app',
    pwd_warn: 'Seus documentos serão descriptografados no disco, removendo a proteção de acesso.',
    change_pwd_link: 'Alterar senha →',
    new_pwd_label: 'Nova Senha',
    new_pwd_placeholder: 'Mínimo 6 caracteres',
    confirm_pwd_label: 'Confirmar Senha',
    confirm_pwd_placeholder: 'Repita a senha',
    confirm_new_pwd_label: 'Confirmar Nova Senha',
    confirm_new_pwd_placeholder: 'Repita a nova senha',
    current_pwd_label: 'Senha Atual',
    current_pwd_placeholder: 'Sua senha atual',
    current_pwd_confirm: 'Confirme sua senha',
    btn_enable_pwd: 'Ativar Senha',
    btn_disable_pwd: 'Desativar Proteção',
    btn_change_pwd: 'Alterar Senha',
    vault_title: 'Criptografia',
    vault_desc_on: 'Desbloqueado — acesso liberado aos documentos',
    vault_desc_off: 'Bloqueado — protegido contra acessos indevidos',
    btn_lock: 'Bloquear',
    btn_unlock: 'Desbloquear',
    vault_pwd_label: 'Senha do Cofre',
    vault_pwd_placeholder: 'Digite sua senha',
    vault_expl_1: 'O aplicativo criptografa todos os seus documentos nativamente usando ',
    vault_expl_2: ' com derivação de chave ',
    vault_expl_3:
      'Apenas você, com a senha correta, pode abrir seus arquivos. Se a tela for bloqueada, um acesso indevido ao computador não expõe seus arquivos. ',
    vault_expl_4: 'Se perder a senha, o conteúdo não pode ser recuperado.',
    pin_title: 'PIN do Cofre',
    pin_desc_on: 'PIN ativo — use no lugar da senha',
    pin_desc_off: 'Atalho numérico (4–8 dígitos) para desbloquear',
    pin_warn: 'Confirme a senha do cofre para criar um PIN de acesso rápido.',
    new_pin_label: 'Novo PIN (4–8 dígitos)',
    new_pin_placeholder: '4–8 dígitos',
    confirm_pin_label: 'Confirmar PIN',
    btn_enable_pin: 'Ativar PIN',
    btn_remove_pin: 'Remover PIN',
    change_pin_link: 'Alterar PIN →',
    err_enter_new_pwd: 'Digite a nova senha.',
    err_pwd_mismatch: 'As senhas não coincidem.',
    err_pwd_length: 'A senha deve ter pelo menos 6 caracteres.',
    success_pwd_set: 'Senha configurada com sucesso.',
    err_enter_current_pwd: 'Digite sua senha atual.',
    success_pwd_removed: 'Proteção por senha removida.',
    err_enter_pwd: 'Digite sua senha.',
    success_vault_unlocked: 'Cofre desbloqueado.',
    err_incorrect_pwd: 'Senha incorreta.',
    success_vault_locked: 'Cofre bloqueado.',
    err_confirm_vault_pwd: 'Confirme sua senha do cofre.',
    err_pin_length: 'O PIN deve ter pelo menos 4 dígitos.',
    err_pin_mismatch: 'Os PINs não coincidem.',
    success_pin_set: 'PIN do cofre configurado.',
    success_pin_removed: 'PIN do cofre removido.',
  },
  en: {
    btn_cancel: 'Cancel',
    txt_loading: 'Loading...',
    sec_title: 'Security',
    sec_desc_on: 'Your documents are protected.',
    sec_desc_off: 'No active protection at the moment.',
    status_on: 'Password protected',
    status_off: 'No protection',
    pwd_title: 'Access Password',
    pwd_desc: 'Requires authentication when opening the app',
    pwd_warn: 'Your documents will be decrypted on disk, removing access protection.',
    change_pwd_link: 'Change password →',
    new_pwd_label: 'New Password',
    new_pwd_placeholder: 'Minimum 6 characters',
    confirm_pwd_label: 'Confirm Password',
    confirm_pwd_placeholder: 'Repeat password',
    confirm_new_pwd_label: 'Confirm New Password',
    confirm_new_pwd_placeholder: 'Repeat new password',
    current_pwd_label: 'Current Password',
    current_pwd_placeholder: 'Your current password',
    current_pwd_confirm: 'Confirm your password',
    btn_enable_pwd: 'Enable Password',
    btn_disable_pwd: 'Disable Protection',
    btn_change_pwd: 'Change Password',
    vault_title: 'Encryption',
    vault_desc_on: 'Unlocked — access granted to documents',
    vault_desc_off: 'Locked — protected against unauthorized access',
    btn_lock: 'Lock',
    btn_unlock: 'Unlock',
    vault_pwd_label: 'Vault Password',
    vault_pwd_placeholder: 'Enter your password',
    vault_expl_1: 'The app natively encrypts all your documents using ',
    vault_expl_2: ' with key derivation ',
    vault_expl_3:
      'Only you, with the correct password, can open your files. If the screen is locked, unauthorized access to the computer does not expose your files. ',
    vault_expl_4: 'If you lose the password, the content cannot be recovered.',
    pin_title: 'Vault PIN',
    pin_desc_on: 'PIN active — use instead of password',
    pin_desc_off: 'Numeric shortcut (4–8 digits) to unlock',
    pin_warn: 'Confirm the vault password to create a quick access PIN.',
    new_pin_label: 'New PIN (4–8 digits)',
    new_pin_placeholder: '4–8 digits',
    confirm_pin_label: 'Confirm PIN',
    btn_enable_pin: 'Enable PIN',
    btn_remove_pin: 'Remove PIN',
    change_pin_link: 'Change PIN →',
    err_enter_new_pwd: 'Enter the new password.',
    err_pwd_mismatch: 'Passwords do not match.',
    err_pwd_length: 'Password must be at least 6 characters long.',
    success_pwd_set: 'Password set successfully.',
    err_enter_current_pwd: 'Enter your current password.',
    success_pwd_removed: 'Password protection removed.',
    err_enter_pwd: 'Enter your password.',
    success_vault_unlocked: 'Vault unlocked.',
    err_incorrect_pwd: 'Incorrect password.',
    success_vault_locked: 'Vault locked.',
    err_confirm_vault_pwd: 'Confirm your vault password.',
    err_pin_length: 'PIN must be at least 4 digits long.',
    err_pin_mismatch: 'PINs do not match.',
    success_pin_set: 'Vault PIN set successfully.',
    success_pin_removed: 'Vault PIN removed.',
  },
};

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
      <label
        className="block text-[10px] font-bold uppercase tracking-widest mb-2"
        style={{ color: 'var(--text-muted)' }}
      >
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
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function PINField({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label
        className="block text-[10px] font-bold uppercase tracking-widest mb-2"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </label>
      <div className="relative max-w-xs">
        <input
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          maxLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full rounded-xl px-4 py-3 outline-none transition-all border pr-10 font-mono text-center tracking-[0.4em] text-sm"
          style={{
            backgroundColor: 'var(--bg-base)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
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
    <div
      className="mt-6 pt-6 border-t animate-in fade-in slide-in-from-top-2 duration-300 space-y-4"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {children}
    </div>
  );
}

function ActionButtons({
  onConfirm,
  onCancel,
  saving,
  confirmLabel,
  cancelLabel,
  danger,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-1">
      <button
        onClick={onConfirm}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 text-white"
        style={{ backgroundColor: danger ? '#dc2626' : 'var(--accent)' }}
        onMouseEnter={(e) => {
          if (!saving) e.currentTarget.style.opacity = '0.9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {confirmLabel}
      </button>
      <button
        onClick={onCancel}
        className="px-4 py-2.5 text-sm transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        {cancelLabel}
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
  const { setVaultUnlocked: setGlobalVaultUnlocked, setVaultPINEnabled: setGlobalPINEnabled } =
    useSecurityStore();
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

  const t = useTranslation(dict);

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPINValue('');
    setPINConfirm('');
    setError('');
    setSuccess('');
    setMode('idle');
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
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshState().finally(() => setLoading(false));
  }, []);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3500);
  };

  const handleSetPassword = async () => {
    if (!newPassword) {
      setError(t.err_enter_new_pwd);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t.err_pwd_mismatch);
      return;
    }
    if (newPassword.length < 6) {
      setError(t.err_pwd_length);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await SetPassword(currentPassword, newPassword);
      await refreshState();
      resetForm();
      showSuccess(t.success_pwd_set);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!currentPassword) {
      setError(t.err_enter_current_pwd);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await RemovePassword(currentPassword);
      await refreshState();
      resetForm();
      showSuccess(t.success_pwd_removed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async () => {
    if (!currentPassword) {
      setError(t.err_enter_pwd);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const ok = await UnlockVault(currentPassword);
      if (ok) {
        setGlobalVaultUnlocked(true);
        await refreshState();
        resetForm();
        showSuccess(t.success_vault_unlocked);
      } else {
        setError(t.err_incorrect_pwd);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleLock = async () => {
    await LockVault();
    setGlobalVaultUnlocked(false);
    await refreshState();
    showSuccess(t.success_vault_locked);
  };

  const handleSetPIN = async () => {
    if (!currentPassword) {
      setError(t.err_confirm_vault_pwd);
      return;
    }
    if (pinValue.length < 4) {
      setError(t.err_pin_length);
      return;
    }
    if (pinValue !== pinConfirm) {
      setError(t.err_pin_mismatch);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await SetVaultPIN(currentPassword, pinValue);
      await refreshState();
      resetForm();
      showSuccess(t.success_pin_set);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePIN = async () => {
    if (!currentPassword) {
      setError(t.err_confirm_vault_pwd);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await RemoveVaultPIN(currentPassword);
      await refreshState();
      resetForm();
      showSuccess(t.success_pin_removed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm font-light">{t.txt_loading}</span>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-10">
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
              boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
            }}
          >
            <Shield className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          <div>
            <h3
              className="text-2xl font-extralight tracking-tight"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.sec_title}
            </h3>
            <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
              {passwordEnabled ? t.sec_desc_on : t.sec_desc_off}
            </p>
          </div>
        </div>

        <div
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium"
          style={
            passwordEnabled
              ? {
                  backgroundColor: 'rgba(99,102,241,0.08)',
                  borderColor: 'rgba(99,102,241,0.25)',
                  color: '#6366f1',
                }
              : {
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-muted)',
                }
          }
        >
          {passwordEnabled ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" /> {t.status_on}
            </>
          ) : (
            <>
              <ShieldOff className="w-3.5 h-3.5" /> {t.status_off}
            </>
          )}
        </div>
      </div>

      {success && (
        <div
          className="flex items-center gap-2 text-sm animate-in fade-in duration-300"
          style={{ color: '#16a34a' }}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div
          className="flex items-center gap-2 text-sm animate-in fade-in duration-300"
          style={{ color: '#dc2626' }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4 max-w-lg">
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
                  {t.pwd_title}
                </p>
                <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.pwd_desc}
                </p>
              </div>
            </div>
            <Toggle
              on={passwordEnabled}
              onClick={() => {
                resetForm();
                setMode(passwordEnabled ? 'disabling' : 'enabling');
              }}
            />
          </div>

          {mode === 'enabling' && (
            <ActionPanel>
              <PasswordField
                label={t.new_pwd_label}
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t.new_pwd_placeholder}
                autoFocus
              />
              <PasswordField
                label={t.confirm_pwd_label}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t.confirm_pwd_placeholder}
              />
              <ActionButtons
                onConfirm={handleSetPassword}
                onCancel={resetForm}
                saving={saving}
                confirmLabel={t.btn_enable_pwd}
                cancelLabel={t.btn_cancel}
              />
            </ActionPanel>
          )}

          {mode === 'disabling' && (
            <ActionPanel>
              <p
                className="text-xs rounded-xl px-3 py-2 border"
                style={{
                  color: '#b45309',
                  backgroundColor: 'rgba(217,119,6,0.08)',
                  borderColor: 'rgba(217,119,6,0.2)',
                }}
              >
                ⚠️ {t.pwd_warn}
              </p>
              <PasswordField
                label={t.current_pwd_label}
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t.current_pwd_confirm}
                autoFocus
              />
              <ActionButtons
                onConfirm={handleRemovePassword}
                onCancel={resetForm}
                saving={saving}
                confirmLabel={t.btn_disable_pwd}
                cancelLabel={t.btn_cancel}
                danger
              />
            </ActionPanel>
          )}

          {passwordEnabled && mode === 'idle' && (
            <ActionPanel>
              <button
                onClick={() => {
                  resetForm();
                  setMode('changing');
                }}
                className="text-xs font-medium transition-colors"
                style={{ color: 'var(--accent)' }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {t.change_pwd_link}
              </button>
            </ActionPanel>
          )}

          {mode === 'changing' && (
            <ActionPanel>
              <PasswordField
                label={t.current_pwd_label}
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={t.current_pwd_placeholder}
                autoFocus
              />
              <PasswordField
                label={t.new_pwd_label}
                value={newPassword}
                onChange={setNewPassword}
                placeholder={t.new_pwd_placeholder}
              />
              <PasswordField
                label={t.confirm_new_pwd_label}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder={t.confirm_new_pwd_placeholder}
              />
              <ActionButtons
                onConfirm={handleSetPassword}
                onCancel={resetForm}
                saving={saving}
                confirmLabel={t.btn_change_pwd}
                cancelLabel={t.btn_cancel}
              />
            </ActionPanel>
          )}
        </Section>

        {passwordEnabled && (
          <Section>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: vaultUnlocked
                      ? 'rgba(16,185,129,0.1)'
                      : 'rgba(245,158,11,0.1)',
                  }}
                >
                  {vaultUnlocked ? (
                    <Unlock className="w-4 h-4" style={{ color: '#10b981' }} strokeWidth={1.5} />
                  ) : (
                    <Lock className="w-4 h-4" style={{ color: '#f59e0b' }} strokeWidth={1.5} />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.vault_title}
                  </p>
                  <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {vaultUnlocked ? t.vault_desc_on : t.vault_desc_off}
                  </p>
                </div>
              </div>
              <button
                onClick={
                  vaultUnlocked
                    ? handleLock
                    : () => {
                        resetForm();
                        setMode('unlocking');
                      }
                }
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all border"
                style={
                  vaultUnlocked
                    ? { borderColor: 'var(--border)', color: 'var(--text-secondary)' }
                    : {
                        borderColor: 'rgba(99,102,241,0.4)',
                        color: '#6366f1',
                        backgroundColor: 'rgba(99,102,241,0.06)',
                      }
                }
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
              >
                {vaultUnlocked ? t.btn_lock : t.btn_unlock}
              </button>
            </div>

            {mode === 'unlocking' && (
              <ActionPanel>
                <PasswordField
                  label={t.vault_pwd_label}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder={t.vault_pwd_placeholder}
                  autoFocus
                />
                <ActionButtons
                  onConfirm={handleUnlock}
                  onCancel={resetForm}
                  saving={saving}
                  confirmLabel={t.btn_unlock}
                  cancelLabel={t.btn_cancel}
                />
              </ActionPanel>
            )}

            <div
              className="mt-5 pt-5 space-y-3 border-t"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <p
                className="text-xs font-light leading-relaxed"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t.vault_expl_1}
                <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  AES-256-GCM
                </strong>{' '}
                {t.vault_expl_2}
                <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Argon2id</strong>.
              </p>
              <div
                className="flex gap-3 p-3 rounded-xl border"
                style={{ backgroundColor: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
              >
                <AlertCircle
                  className="w-4 h-4 shrink-0 mt-0.5"
                  strokeWidth={1.5}
                  style={{ color: '#b45309' }}
                />
                <p
                  className="text-xs font-light leading-relaxed"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t.vault_expl_3}
                  <span style={{ color: '#b45309', fontWeight: 500 }}>{t.vault_expl_4}</span>
                </p>
              </div>
            </div>
          </Section>
        )}

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
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.pin_title}
                  </p>
                  <p className="text-xs font-light mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {vaultPINEnabled ? t.pin_desc_on : t.pin_desc_off}
                  </p>
                </div>
              </div>
              <Toggle
                on={vaultPINEnabled}
                onClick={() => {
                  resetForm();
                  setMode(vaultPINEnabled ? 'pinRemoving' : 'pinSetting');
                }}
              />
            </div>

            {mode === 'pinSetting' && (
              <ActionPanel>
                <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
                  {t.pin_warn}
                </p>
                <PasswordField
                  label={t.vault_pwd_label}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder={t.current_pwd_confirm}
                  autoFocus
                />
                <PINField
                  label={t.new_pin_label}
                  value={pinValue}
                  onChange={setPINValue}
                  placeholder={t.new_pin_placeholder}
                />
                <PINField
                  label={t.confirm_pin_label}
                  value={pinConfirm}
                  onChange={setPINConfirm}
                  placeholder={t.new_pin_placeholder}
                />
                <ActionButtons
                  onConfirm={handleSetPIN}
                  onCancel={resetForm}
                  saving={saving}
                  confirmLabel={t.btn_enable_pin}
                  cancelLabel={t.btn_cancel}
                />
              </ActionPanel>
            )}

            {mode === 'pinRemoving' && (
              <ActionPanel>
                <PasswordField
                  label={t.vault_pwd_label}
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  placeholder={t.current_pwd_confirm}
                  autoFocus
                />
                <ActionButtons
                  onConfirm={handleRemovePIN}
                  onCancel={resetForm}
                  saving={saving}
                  confirmLabel={t.btn_remove_pin}
                  cancelLabel={t.btn_cancel}
                  danger
                />
              </ActionPanel>
            )}

            {vaultPINEnabled && mode === 'idle' && (
              <ActionPanel>
                <button
                  onClick={() => {
                    resetForm();
                    setMode('pinSetting');
                  }}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--accent)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  {t.change_pin_link}
                </button>
              </ActionPanel>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}

export default SecurityTab;
