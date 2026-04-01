import { useEffect, useState } from 'react';
import { GetSecurityConfig, IsVaultUnlocked, LockApp, LockVault } from '../wailsjs/go/main/App';
import { EventsOn, Environment } from '../wailsjs/runtime/runtime';
import { AIAssistantSidebar } from './components/AIAssistantSidebar';
import { CommandPalette } from './components/CommandPalette';
import { DocumentTree } from './components/DocumentTree';
import { Editor } from './components/Editor';
import { EmptyState } from './components/EmptyState';
import { HomeScreen } from './components/HomeScreen';
import { LockScreen } from './components/LockScreen';
import { Modal } from './components/Modal';
import { SettingsScreen } from './components/SettingsScreen';
import { StatusBar } from './components/StatusBar';
import { TitleBar } from './components/TitleBar';
import { useEditorStore } from './store/editorStore';
import { useSecurityStore } from './store/securityStore';

function App() {
  const { primaryDoc, loadDocument, theme, view, setView, createDocument, saveCurrentDocument } =
    useEditorStore();

  const [os, setOs] = useState<string>('');

  // ── Security gate ─────────────────────────────────────────────────────────
  const [locked, setLocked] = useState<boolean | null>(null);
  const [isMidSessionLock, setIsMidSessionLock] = useState(false);
  const [vaultPINEnabled, setVaultPINEnabledLocal] = useState(false);

  const { setVaultPINEnabled, setVaultUnlocked } = useSecurityStore();

  useEffect(() => {
    (async () => {
      try {
        const env = await Environment();
        setOs(env.platform);

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
      LockVault().catch(() => {});
      setVaultUnlocked(false);
    }
  }, [view]);

  // Listen for backend-emitted app-locked event
  useEffect(() => {
    const unsub = EventsOn('app-locked', () => {
      setIsMidSessionLock(true);
      setLocked(true);
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (!e.metaKey && !e.ctrlKey) return;
      }

      // Ctrl/Cmd + L : Lock app
      if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        LockApp().catch(() => {});
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
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [primaryDoc?.frontmatter?.id]);

  if (locked === null) {
    return <div className="flex h-screen w-screen" style={{ backgroundColor: 'var(--bg-base)' }} />;
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-transparent overflow-hidden font-sans transition-colors duration-500">
      {os === 'darwin' && <TitleBar />}
      <CommandPalette />
      <Modal />

      <div className={`flex flex-1 w-full overflow-hidden px-2 pb-2 ${os === 'darwin' ? 'mt-[40px]' : 'mt-2'}`}>
        {view === 'home' ? (
          <HomeScreen />
        ) : view === 'settings' ? (
          <SettingsScreen />
        ) : (
          <div className="flex flex-1 h-full w-full overflow-hidden gap-2 bg-transparent">
            <DocumentTree />
            <div className="flex-1 h-full overflow-hidden relative">
              {primaryDoc ? <Editor /> : <EmptyState />}
            </div>
            <AIAssistantSidebar />
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
