import {
  ArrowLeft,
  BrainCircuit,
  Code2,
  Database,
  Fingerprint,
  Globe,
  HardDrive,
  Heart,
  Info,
  Lock,
  Palette,
  Shield,
  WifiOff,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';
import { useI18nStore } from '../store/i18nStore';
import { SecurityTab } from './SecurityTab';

const dict = {
  pt: {
    tab_theme: 'Aparência',
    desc_theme: 'Tema visual',
    tab_security: 'Segurança',
    desc_security: 'Senha e criptografia',
    tab_about: 'Sobre',
    desc_about: 'O que é o Writtt',
    btn_back: 'Voltar',
    title_settings: 'Configurações',
    appearance_title: 'Aparência',
    appearance_desc: 'Escolha como o Writtt aparece na sua tela.',
    theme_light: 'Claro',
    theme_dark: 'Escuro',
    lang_title: 'Idioma',
    lang_desc: 'Escolha o idioma do aplicativo.',
    lang_pt: 'Português',
    lang_en: 'Inglês',
    about_subtitle: 'O seu porto seguro para pensar, blindado e local.',
    about_desc:
      'Nós transformamos o seu computador em uma fortaleza inatingível de escrita reflexiva. Sem servidores nebulosos, sem assinaturas escondidas e sem violação da sua privacidade.',
    about_q1: 'O que é este aplicativo?',
    about_a1_1: 'O Writtt foi projetado com uma filosofia intransigente: ',
    about_a1_2: 'sua mente é apenas sua',
    about_a1_3:
      '. Em um mundo de editores colaborativos sempre-online que leem seus documentos para treinar algoritmos, nós construímos o oposto. O Writtt funciona 100% no seu disco rígido, offline e com blindagem de grau militar por padrão.',
    feat1_title: 'Offline e Soberano',
    feat1_desc:
      'Seus dados vivem num banco de dados SQLite ultrarrápido, morando estritamente dentro da pasta do seu próprio usuário. Zero conexão para fora.',
    feat2_title: 'AES-256 e Argon2id',
    feat2_desc:
      'Não é apenas "escondido". Configurou uma senha, e seus rascunhos são transformados em matemática indecifrável resistente a hackers e roubos de hardware.',
    feat3_title: 'Inteligência Puramente Local',
    feat3_desc:
      'Toda nossa IA e RAG se conecta diretamente ao Ollama na sua máquina. A IA interage com as suas anotações corporativas e segredos de forma totalmente estanque.',
    feat4_title: 'Sem Burocracia',
    feat4_desc:
      'Sem contas, sem termos de uso que exijam vender a sua alma. É um software tradicional que você liga, escreve e fecha.',
    expl1_title: 'Trancado no Gelo (Cold Storage)',
    expl1_1: 'A criptografia ',
    expl1_2:
      ' (Galois/Counter Mode) faz algo brilhante: não apenas criptografa cada letra com um cadeado que levariam milhões de anos para quebrar, como também "carimba" seu documento com um lacre inviolável. Se um malware conseguir abrir a pasta do seu disco e mexer em UM mísero bit dos seus arquivos cegos na tentativa de corrompê-los, o lacre GCM avisa ao Writtt que ouve adulteração, recusando de imediato a leitura. Além disso, a sua senha passa pela fornalha do ',
    expl1_3:
      ', o mesmo exigido para administradores e gerentes de chaves mestre por causa da sua resistência bruta.',
    expl2_title: 'IA Cúmplice, não Espiã',
    expl2_1:
      'Inteligência artificial moderna tem uma má fama, fundada no envio descontrolado de dados para a nuvem de gigantes tecnológicos. No Writtt, nós viramos a chave. A integração embutida do editor (o ajudante para escrever) chama a tecnologia ',
    expl2_2:
      ' rodando a sua inteligência de código-fonte aberto, nativamente no seu computador. Não importa se você colocar todas as planilhas financeiras da sua empresa na sua nota, nenhuma linha cruzará o seu Wi-Fi. A mente que reescreve o seu texto é vizinha de parede dele, no mesmo disco.',
    footer_text: 'Construído para quem pensa sem pressa.',
    version: 'Versão 0.1.0-beta',
  },
  en: {
    tab_theme: 'Appearance',
    desc_theme: 'Visual theme',
    tab_security: 'Security',
    desc_security: 'Password and encryption',
    tab_about: 'About',
    desc_about: 'What is Writtt',
    btn_back: 'Back',
    title_settings: 'Settings',
    appearance_title: 'Appearance',
    appearance_desc: 'Choose how Writtt looks on your screen.',
    theme_light: 'Light',
    theme_dark: 'Dark',
    lang_title: 'Language',
    lang_desc: 'Choose the application language.',
    lang_pt: 'Portuguese',
    lang_en: 'English',
    about_subtitle: 'Your safe harbor for thinking, shielded and local.',
    about_desc:
      'We transform your computer into an impenetrable fortress for reflective writing. No nebulous servers, no hidden subscriptions, and no privacy violations.',
    about_q1: 'What is this app?',
    about_a1_1: 'Writtt was designed with an uncompromising philosophy: ',
    about_a1_2: 'your mind is yours alone',
    about_a1_3:
      '. In a world of always-online collaborative editors that read your documents to train algorithms, we built the opposite. Writtt works 100% on your hard drive, offline, and with military-grade shielding by default.',
    feat1_title: 'Offline and Sovereign',
    feat1_desc:
      'Your data lives in an ultra-fast SQLite database, residing strictly within your own user folder. Zero outward connection.',
    feat2_title: 'AES-256 and Argon2id',
    feat2_desc:
      'It is not just "hidden". Set a password, and your drafts are transformed into unbreakable math, resistant to hackers and hardware theft.',
    feat3_title: 'Purely Local Intelligence',
    feat3_desc:
      'All our AI and RAG connect directly to Ollama on your machine. The AI interacts with your corporate notes and secrets in a completely airtight way.',
    feat4_title: 'No Bureaucracy',
    feat4_desc:
      "No accounts, no terms of use demanding your soul. It's traditional software: you turn it on, write, and close it.",
    expl1_title: 'Locked in Ice (Cold Storage)',
    expl1_1: 'The encryption ',
    expl1_2:
      ' (Galois/Counter Mode) does something brilliant: it not only encrypts every letter with a padlock that would take millions of years to crack, but it also "stamps" your document with a tamper-evident seal. If malware manages to open your disk folder and touch ONE single bit of your blind files trying to corrupt them, the GCM seal alerts Writtt of the tampering, immediately refusing the read. In addition, your password goes through the furnace of ',
    expl1_3:
      ', the same required for administrators and master key managers due to its brute-force resistance.',
    expl2_title: 'Accomplice AI, not Spy',
    expl2_1:
      'Modern artificial intelligence has a bad reputation, founded on the uncontrolled sending of data to the cloud of tech giants. In Writtt, we flip the switch. The built-in editor integration (your writing helper) calls the ',
    expl2_2:
      " technology running its open-source intelligence natively on your computer. It doesn't matter if you put all your company's financial spreadsheets in your note, not a single line will cross your Wi-Fi. The mind that rewrites your text is its next-door neighbor, on the same disk.",
    footer_text: 'Built for those who think unhurriedly.',
    version: 'Version 0.1.0-beta',
  },
};

export function SettingsScreen() {
  const { setView, theme, setTheme } = useEditorStore();
  const { language, setLanguage } = useI18nStore();
  const [activeTab, setActiveTab] = useState('theme');
  const t = useTranslation(dict);

  const tabs = [
    { id: 'theme', label: t.tab_theme, icon: Palette, desc: t.desc_theme },
    { id: 'security', label: t.tab_security, icon: Shield, desc: t.desc_security },
    { id: 'about', label: t.tab_about, icon: Info, desc: t.desc_about },
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
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <ArrowLeft
            className="w-4 h-4 group-hover:-translate-x-1 transition-transform"
            strokeWidth={2}
          />
          {t.btn_back}
        </button>

        <p
          className="text-[9px] font-bold uppercase tracking-[0.3em] mb-3 px-2"
          style={{ color: 'var(--text-muted)' }}
        >
          {t.title_settings}
        </p>

        {tabs.map((tab) => {
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
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
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
                <div className="text-[10px] font-light opacity-60 leading-none mt-0.5">
                  {tab.desc}
                </div>
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
            <h3
              className="text-2xl font-extralight tracking-tight mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              {t.appearance_title}
            </h3>
            <p className="text-sm font-light mb-10" style={{ color: 'var(--text-muted)' }}>
              {t.appearance_desc}
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
                <span
                  className={`text-xs font-semibold uppercase tracking-widest ${theme === 'light' ? 'text-blue-600' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {t.theme_light}
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
                style={{
                  backgroundColor: theme === 'dark' ? 'rgba(59,130,246,0.08)' : 'var(--bg-surface)',
                }}
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
                <span
                  className={`text-xs font-semibold uppercase tracking-widest ${theme === 'dark' ? 'text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {t.theme_dark}
                </span>
              </button>
            </div>

            {/* Language Selection */}
            <div className="mt-16">
              <h3
                className="text-2xl font-extralight tracking-tight mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                <Globe className="inline-block w-5 h-5 mr-2 -mt-1 opacity-70" />
                {t.lang_title}
              </h3>
              <p className="text-sm font-light mb-10" style={{ color: 'var(--text-muted)' }}>
                {t.lang_desc}
              </p>

              <div className="grid grid-cols-2 gap-5 max-w-sm">
                {/* Portuguese */}
                <button
                  onClick={() => setLanguage('pt')}
                  className={`group p-5 rounded-2xl border-2 transition-all duration-500 text-left ${
                    language === 'pt'
                      ? 'border-blue-500'
                      : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                  style={{
                    backgroundColor: language === 'pt' ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                  }}
                >
                  <span
                    className={`text-base font-medium ${language === 'pt' ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {t.lang_pt}
                  </span>
                </button>

                {/* English */}
                <button
                  onClick={() => setLanguage('en')}
                  className={`group p-5 rounded-2xl border-2 transition-all duration-500 text-left ${
                    language === 'en'
                      ? 'border-blue-500'
                      : 'border-transparent hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                  style={{
                    backgroundColor: language === 'en' ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                  }}
                >
                  <span
                    className={`text-base font-medium ${language === 'en' ? 'text-blue-500' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {t.lang_en}
                  </span>
                </button>
              </div>
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
          <div className="p-12 max-w-3xl animate-in fade-in slide-in-from-bottom-2 duration-500 space-y-16 pb-24">
            {/* Hero Section */}
            <div>
              <div className="flex items-center gap-4 mb-8">
                <div
                  className="w-16 h-16 rounded-3xl flex items-center justify-center text-2xl font-bold text-white shadow-xl"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
                >
                  W
                </div>
                <div>
                  <h2
                    className="text-3xl font-extralight tracking-tight"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Writtt
                  </h2>
                  <p className="text-sm font-light mt-1" style={{ color: 'var(--text-muted)' }}>
                    {t.about_subtitle}
                  </p>
                </div>
              </div>

              <p
                className="text-lg font-light leading-relaxed max-w-2xl"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t.about_desc}
              </p>
            </div>

            {/* O Que é o Writtt */}
            <div className="space-y-6">
              <h4
                className="text-xs font-bold uppercase tracking-[0.25em]"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.about_q1}
              </h4>
              <p
                className="text-base font-light leading-relaxed mb-6"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t.about_a1_1}
                <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                  {t.about_a1_2}
                </strong>
                {t.about_a1_3}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    icon: Database,
                    title: t.feat1_title,
                    desc: t.feat1_desc,
                    color: '#10b981',
                  },
                  {
                    icon: Fingerprint,
                    title: t.feat2_title,
                    desc: t.feat2_desc,
                    color: '#8b5cf6',
                  },
                  {
                    icon: BrainCircuit,
                    title: t.feat3_title,
                    desc: t.feat3_desc,
                    color: '#f59e0b',
                  },
                  {
                    icon: Code2,
                    title: t.feat4_title,
                    desc: t.feat4_desc,
                    color: '#3b82f6',
                  },
                ].map(({ icon: Icon, title, desc, color }) => (
                  <div
                    key={title}
                    className="p-6 rounded-2xl border transition-all hover:shadow-md"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: `${color}15` }}
                    >
                      <Icon className="w-5 h-5" style={{ color }} strokeWidth={1.5} />
                    </div>
                    <p
                      className="text-base font-medium mb-2"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {title}
                    </p>
                    <p
                      className="text-sm font-light leading-relaxed"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* O Assistente e a Criptografia Explicados */}
            <div className="space-y-10">
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <Lock
                    className="w-5 h-5"
                    style={{ color: 'var(--text-secondary)' }}
                    strokeWidth={1.5}
                  />
                  <h4 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.expl1_title}
                  </h4>
                </div>
                <p
                  className="text-sm font-light leading-relaxed p-5 rounded-2xl border"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {t.expl1_1}
                  <strong style={{ color: 'var(--text-primary)' }}>AES-256-GCM</strong>
                  {t.expl1_2}
                  <strong style={{ color: 'var(--text-primary)' }}>Argon2id</strong>
                  {t.expl1_3}
                </p>
              </section>

              <section>
                <div className="flex items-center gap-3 mb-4">
                  <BrainCircuit
                    className="w-5 h-5"
                    style={{ color: 'var(--text-secondary)' }}
                    strokeWidth={1.5}
                  />
                  <h4 className="text-base font-medium" style={{ color: 'var(--text-primary)' }}>
                    {t.expl2_title}
                  </h4>
                </div>
                <p
                  className="text-sm font-light leading-relaxed p-5 rounded-2xl border"
                  style={{
                    color: 'var(--text-secondary)',
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border)',
                  }}
                >
                  {t.expl2_1}
                  <strong style={{ color: 'var(--text-primary)' }}>Ollama</strong>
                  {t.expl2_2}
                </p>
              </section>
            </div>

            {/* Rodapé */}
            <div
              className="border-t pt-8 mt-16 flex items-center justify-between"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2">
                <Heart className="w-4 h-4" style={{ color: '#f43f5e' }} strokeWidth={1.5} />
                <span className="text-xs font-light" style={{ color: 'var(--text-muted)' }}>
                  {t.footer_text}
                </span>
              </div>
              <span
                className="text-xs font-light bg-slate-500/10 px-2 py-1 rounded"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.version}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsScreen;
