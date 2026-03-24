import { useEffect, useState } from 'react';
import { useEditorStore } from './store/editorStore';
import { useSecurityStore } from './store/securityStore';
import { Editor } from './components/Editor';
import { CommandPalette } from './components/CommandPalette';
import { StatusBar } from './components/StatusBar';
import { HomeScreen } from './components/HomeScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { Modal } from './components/Modal';
import { TitleBar } from './components/TitleBar';
import { EmptyState } from './components/EmptyState';
import { LockScreen } from './components/LockScreen';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { GetSecurityConfig, IsVaultUnlocked, LockVault, LockApp } from '../wailsjs/go/main/App';

function App() {
  const {
    primaryDoc,
    loadDocument,
    theme,
    view,
    setView,
    createDocument,
    saveCurrentDocument,
  } = useEditorStore();

  // ── Security gate ─────────────────────────────────────────────────────────
  const [locked, setLocked] = useState<boolean | null>(null);
  const [isMidSessionLock, setIsMidSessionLock] = useState(false);
  const [vaultPINEnabled, setVaultPINEnabledLocal] = useState(false);

  const { setVaultPINEnabled, setVaultUnlocked } = useSecurityStore();

  useEffect(() => {
    (async () => {
      try {
        const cfg = await GetSecurityConfig();
        const pinEnabled = cfg.vault_pin_enabled ?? false;
        setVaultPINEnabled(pinEnabled);
        setVaultPINEnabledLocal(pinEnabled);
        if (cfg.password_enabled) {
          const unlocked = await IsVaultUnlocked();
          setLocked(!unlocked);
        } else {
          setLocked(false);
        }
      } catch {
        setLocked(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Auto-lock vault whenever user navigates away from editor
  useEffect(() => {
    if (view === 'home' || view === 'settings') {
      LockVault().catch(() => { });
      setVaultUnlocked(false);
    }
  }, [view]);

  // Listen for backend-emitted app-locked event
  useEffect(() => {
    const unsub = EventsOn('app-locked', () => {
      setIsMidSessionLock(true);
      setLocked(true);
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (!e.metaKey && !e.ctrlKey) return;
      }

      // Ctrl/Cmd + L : Lock app
      if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        LockApp().catch(() => { });
        return;
      }

      // Ctrl/Cmd + S : Manual Save
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const activeDoc = primaryDoc;
        if (activeDoc) {
          saveCurrentDocument(activeDoc.content, activeDoc.frontmatter.title);
        }
      }

      // Ctrl/Cmd + T : New Document
      if (e.key === 't' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        createDocument();
        setView('editor');
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [primaryDoc, view]);

  useEffect(() => {
    const unsub = EventsOn('file-updated', (id: string) => {
      if (primaryDoc?.frontmatter?.id === id) {
        loadDocument(id);
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [primaryDoc?.frontmatter?.id]);

  if (locked === null) {
    return <div className="flex h-screen w-screen" style={{ backgroundColor: 'var(--bg-base)' }} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-transparent overflow-hidden font-sans transition-colors duration-500">
      <TitleBar />
      <CommandPalette />
      <Modal />

      <div className="flex flex-1 w-full overflow-hidden mt-[40px]">
        {view === 'home' ? (
          <HomeScreen />
        ) : view === 'settings' ? (
          <SettingsScreen />
        ) : (
          <div className="flex-1 h-full" style={{ backgroundColor: 'var(--bg-base)' }}>
            {primaryDoc ? (
              <Editor />
            ) : (
              <EmptyState />
            )}
          </div>
        )}
      </div>

      <StatusBar />

      {locked && (
        <LockScreen
          onUnlocked={() => {
            setLocked(false);
            setIsMidSessionLock(false);
          }}
          vaultPINEnabled={vaultPINEnabled}
          isMidSessionLock={isMidSessionLock}
        />
      )}
    </div>
  );
}

export default App;
