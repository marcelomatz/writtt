import { useEditorStore } from '../store/editorStore';
import { Palette, Shield, ArrowLeft, Info, Lock, HardDrive, WifiOff, Heart } from 'lucide-react';
import { useState } from 'react';
import { SecurityTab } from './SecurityTab';

export function SettingsScreen() {
  const { setView, theme, setTheme } = useEditorStore();
  const [activeTab, setActiveTab] = useState('theme');

  const tabs = [
    { id: 'theme',    label: 'Aparência',  icon: Palette, desc: 'Tema visual' },
    { id: 'security', label: 'Segurança',  icon: Shield,  desc: 'Senha e cofre' },
    { id: 'about',    label: 'Sobre',      icon: Info,    desc: 'O que é o Writtt' },
  ];

  return (
    <div
      className="h-full w-full flex font-light transition-colors duration-500 animate-in fade-in duration-300"
      style={{ backgroundColor: 'var(--bg-base)' }}
    >
      {/* ── Sidebar ── */}
      <div
        className="w-60 shrink-0 border-r flex flex-col p-6 gap-1"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
      >
        <button
          onClick={() => setView('home')}
          className="group flex items-center gap-2 text-sm font-medium mb-8 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" strokeWidth={2} />
          Voltar
        </button>

        <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-3 px-2" style={{ color: 'var(--text-muted)' }}>
          Configurações
        </p>

        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-left border"
              style={
                active
                  ? {
                      backgroundColor: 'var(--bg-elevated)',
                      borderColor: 'var(--border)',
                      color: 'var(--accent)',
                      fontWeight: 500,
                    }
                  : {
                      backgroundColor: 'transparent',
                      borderColor: 'transparent',
                      color: 'var(--text-muted)',
                    }
              }
              onMouseEnter={e => {
                if (!active) e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                if (!active) e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <tab.icon
                className="w-4 h-4 shrink-0"
                style={{ opacity: active ? 1 : 0.45 }}
                strokeWidth={1.5}
              />
              <div>
                <div>{tab.label}</div>
                <div className="text-[10px] font-light opacity-60 leading-none mt-0.5">{tab.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">

        {/* ── Aparência ── */}
        {activeTab === 'theme' && (
          <div className="p-12 max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-500">
            <h3 className="text-2xl font-extralight tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>
              Aparência
            </h3>
            <p className="text-sm font-light mb-10" style={{ color: 'var(--text-muted)' }}>
              Escolha como o Writtt aparece na sua tela.
            </p>

            <div className="grid grid-cols-2 gap-5 max-w-sm">
              {/* Light */}
              <button
                onClick={() => setTheme('light')}
                className={`group p-5 rounded-2xl border-2 transition-all duration-500 text-left ${
                  theme === 'light'
                    ? 'border-blue-500'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                }`}
                style={{ backgroundColor: theme === 'light' ? '#eff6ff' : 'var(--bg-surface)' }}
              >
                {/* Preview */}
                <div className="w-full h-20 rounded-xl mb-4 overflow-hidden shadow-sm border border-slate-200 bg-[#efede8] relative">
                  <div className="h-4 bg-[#e5e1da] border-b border-slate-300/60 flex items-center px-2 gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 opacity-70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 opacity-70" />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 opacity-70" />
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="h-1.5 w-3/4 bg-slate-400/30 rounded-full" />
                    <div className="h-1.5 w-1/2 bg-slate-400/20 rounded-full" />
                    <div className="h-1.5 w-5/6 bg-slate-400/25 rounded-full" />
                  </div>
                </div>
                <span className={`text-xs font-semibold uppercase tracking-widest ${theme === 'light' ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}>
                  Claro
                </span>
              </button>

              {/* Dark */}
              <button
                onClick={() => setTheme('dark')}
                className={`group p-5 rounded-2xl border-2 transition-all duration-500 text-left ${
                  theme === 'dark'
                    ? 'border-blue-500'
                    : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                }`}
                style={{ backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.08)' : 'var(--bg-surface)' }}
              >
                {/* Preview */}
                <div className="w-full h-20 rounded-xl mb-4 overflow-hidden shadow-sm border border-slate-800 bg-[#020617] relative">
                  <div className="h-4 bg-slate-900 border-b border-slate-800 flex items-center px-2 gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 opacity-50" />
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 opacity-50" />
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 opacity-50" />
                  </div>
                  <div className="p-2 space-y-1">
                    <div className="h-1.5 w-3/4 bg-slate-600/60 rounded-full" />
                    <div className="h-1.5 w-1/2 bg-slate-600/40 rounded-full" />
                    <div className="h-1.5 w-5/6 bg-slate-600/50 rounded-full" />
                  </div>
                </div>
                <span className={`text-xs font-semibold uppercase tracking-widest ${theme === 'dark' ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  Escuro
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Segurança ── */}
        {activeTab === 'security' && (
          <div className="p-12 max-w-2xl">
            <SecurityTab />
          </div>
        )}

        {/* ── Sobre ── */}
        {activeTab === 'about' && (
          <div className="p-12 max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-16">

            {/* Hero */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                >
                  W
                </div>
                <div>
                  <h2 className="text-2xl font-extralight tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    Writtt
                  </h2>
                  <p className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
                    Um editor de rich text que vive no seu computador.
                  </p>
                </div>
              </div>

              <p className="text-base font-light leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
                Sem assinaturas. Sem sync forçado. Sem empresa lendo seu diário.{' '}
                <span style={{ color: 'var(--text-primary)', fontWeight: 400 }}>Só você e o que você quer escrever.</span>
              </p>
            </div>

            {/* Manifesto */}
            <div className="space-y-10">
              <section>
                <h4 className="text-xs font-bold uppercase tracking-[0.25em] mb-4" style={{ color: 'var(--text-muted)' }}>
                  Sobre escrever sem rede
                </h4>
                <p className="text-sm font-light leading-7" style={{ color: 'var(--text-secondary)' }}>
                  Toda vez que abro um documento novo, é o mesmo momento: a página em branco, sem badge de notificação,
                  sem ninguém olhando. Esse é o ponto. Escrever para pensar — não para publicar, não para ser visto pensando.
                </p>
              </section>

              <section>
                <h4 className="text-xs font-bold uppercase tracking-[0.25em] mb-4" style={{ color: 'var(--text-muted)' }}>
                  Privacidade como condição
                </h4>
                <p className="text-sm font-light leading-7" style={{ color: 'var(--text-secondary)' }}>
                  Não existe escrita honesta sob vigilância. Quando você sabe que alguém pode ler, você edita antes de
                  escrever. Suas ideias chegam pré-censuradas pelo medo da audiência.
                </p>
                <p className="text-sm font-light leading-7 mt-4" style={{ color: 'var(--text-secondary)' }}>
                  O Writtt não tem servidor. Não tem conta. Não tem analytics de quanto tempo você passou nessa nota.{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 400 }}>Suas palavras ficam aqui.</span>
                </p>
              </section>

              {/* Destaque */}
              <div
                className="rounded-2xl p-8 border"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <p className="text-lg font-light leading-relaxed mb-2" style={{ color: 'var(--text-primary)' }}>
                  Isso não é feature.
                </p>
                <p className="text-2xl font-extralight tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  É o produto inteiro.
                </p>
              </div>
            </div>

            {/* Princípios */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-[0.25em] mb-6" style={{ color: 'var(--text-muted)' }}>
                Princípios
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: HardDrive,
                    title: 'Local-first por princípio',
                    desc: 'Não por limitação. Seus arquivos .md ficam no seu disco, legíveis por qualquer editor, para sempre.',
                    color: '#3b82f6',
                  },
                  {
                    icon: Lock,
                    title: 'AES-256 quando você precisa',
                    desc: 'Para o que você prefere manter privado. Cofre individual por documento, com Argon2id.',
                    color: '#8b5cf6',
                  },
                  {
                    icon: WifiOff,
                    title: 'Offline sempre',
                    desc: 'Não quando a conexão permite. O app funciona completamente sem internet — sem exceção.',
                    color: '#10b981',
                  },
                  {
                    icon: Heart,
                    title: 'Feito por uma pessoa',
                    desc: 'Um dev só, sem VC, sem roadmap de monetização agressiva. Simples, prático, robusto, seguro.',
                    color: '#f43f5e',
                  },
                ].map(({ icon: Icon, title, desc, color }) => (
                  <div
                    key={title}
                    className="p-5 rounded-2xl border flex gap-4"
                    style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                      style={{ backgroundColor: `${color}18` }}
                    >
                      <Icon className="w-4 h-4" style={{ color }} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                        {title}
                      </p>
                      <p className="text-xs font-light leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex items-center gap-2 pb-4" style={{ color: 'var(--text-muted)' }}>
              <span className="text-xs font-light">
                Writtt · 2025 · Suas palavras são suas. Completamente.
              </span>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsScreen;
