import {
  ArrowLeftToLine,
  Bot,
  Copy,
  GripVertical,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Send,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AskAssistant, GetLocalModels } from '../../wailsjs/go/main/App';
import { useTranslation } from '../hooks/useTranslation';
import { useEditorStore } from '../store/editorStore';

const dict = {
  pt: {
    title: 'Assistente de IA',
    ollama_unavailable: 'Ollama indisponível. Certifique-se de que o ollama serve está rodando.',
    gen_error: 'Erro ao gerar texto.',
    copied: 'Texto copiado! Cole (Ctrl+V) no editor onde desejar.',
    expand: 'Abrir Assistente de IA',
    collapse: 'Recolher Assistente',
    local_model: 'Modelo Local (Ollama)',
    no_model: 'Nenhum modelo encontrado.',
    placeholder:
      'Faça uma pergunta ou peça para gerar um texto. O contexto do documento atual será usado.',
    copy_insert: 'Copiar / Inserir',
    generating: 'Gerando...',
    input_placeholder: 'Comando para a IA...',
  },
  en: {
    title: 'AI Assistant',
    ollama_unavailable: 'Ollama unavailable. Make sure "ollama serve" is running.',
    gen_error: 'Error generating text.',
    copied: 'Text copied! Paste (Ctrl+V) anywhere in the editor.',
    expand: 'Open AI Assistant',
    collapse: 'Collapse Assistant',
    local_model: 'Local Model (Ollama)',
    no_model: 'No model found.',
    placeholder:
      'Ask a question or request text generation. The current document context will be used.',
    copy_insert: 'Copy / Insert',
    generating: 'Generating...',
    input_placeholder: 'Command for the AI...',
  },
};

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function AIAssistantSidebar() {
  const t = useTranslation(dict);
  const {
    primaryDoc,
    rightSidebarCollapsed,
    rightSidebarWidth,
    toggleRightSidebar,
    setRightSidebarWidth,
  } = useEditorStore();
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchModels();
  }, [t]); // Fetch implies side effect, keeping it safe

  const fetchModels = async () => {
    try {
      const availableModels = await GetLocalModels();
      setModels(availableModels || []);
      if (availableModels && availableModels.length > 0) {
        setSelectedModel(availableModels[0]);
      }
    } catch (err: any) {
      setError(t.ollama_unavailable);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedModel || isGenerating) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);
    setError('');

    try {
      const context = primaryDoc ? primaryDoc.content : '';
      const response = await AskAssistant(selectedModel, userMsg, context);

      setMessages((prev) => [...prev, { role: 'assistant', content: response }]);
    } catch (err: any) {
      setError(err.message || t.gen_error);
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const insertToEditor = (text: string) => {
    navigator.clipboard.writeText(text);
    alert(t.copied);
  };

  const isResizing = useRef(false);

  const startResizing = (e: React.MouseEvent) => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';

    const handleMouseMove = (me: MouseEvent) => {
      if (!isResizing.current) return;
      handleResize(me.clientX);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResize = (clientX: number) => {
    const newWidth = window.innerWidth - clientX;
    setRightSidebarWidth(newWidth);
  };

  if (rightSidebarCollapsed) {
    return (
      <div
        className="h-full flex flex-col transition-[width] duration-300 ease-in-out items-center py-4 bg-transparent w-14 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer rounded-2xl shadow-sm border"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}
        onClick={toggleRightSidebar}
        title={t.expand}
      >
        <Bot className="w-5 h-5 text-blue-500 mb-4" />
        <PanelRightOpen className="w-4 h-4 text-slate-400" />
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col relative rounded-2xl shadow-sm border"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        width: `${rightSidebarWidth}px`,
        minWidth: '260px',
      }}
    >
      <div
        onMouseDown={startResizing}
        className="absolute top-0 left-[-4px] w-2 h-full cursor-col-resize z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
      >
        <div className="w-1 h-32 bg-blue-500/30 rounded-full flex items-center justify-center">
          <GripVertical className="w-3 h-3 text-blue-500/50" />
        </div>
      </div>

      <div
        className="flex items-center justify-between p-4 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {t.title}
          </h3>
        </div>
        <button
          onClick={toggleRightSidebar}
          className="text-slate-400 hover:text-blue-500 transition-colors"
          title={t.collapse}
        >
          <PanelRightClose className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text-muted)' }}>
          {t.local_model}
        </label>
        {models.length > 0 ? (
          <select
            className="w-full text-sm p-2 rounded-lg border outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <div className="text-xs text-red-500">{error || t.no_model}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
        {messages.length === 0 && (
          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            {t.placeholder}
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`p-3 rounded-xl text-sm max-w-[90%] whitespace-pre-wrap ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'rounded-bl-none'}`}
              style={
                msg.role === 'assistant'
                  ? {
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }
                  : {}
              }
            >
              {msg.content}
            </div>
            {msg.role === 'assistant' && (
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => insertToEditor(msg.content)}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-slate-500 hover:text-blue-500"
                >
                  <ArrowLeftToLine className="w-3 h-3" /> {t.copy_insert}
                </button>
              </div>
            )}
          </div>
        ))}
        {isGenerating && (
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-4 h-4 animate-spin" /> {t.generating}
          </div>
        )}
        {error && msgError(error)}
      </div>

      <div className="p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="relative">
          <textarea
            rows={2}
            className="w-full resize-none text-sm p-3 pr-10 rounded-xl outline-none"
            style={{
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
            }}
            placeholder={t.input_placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={isGenerating || !input.trim()}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function msgError(error: string) {
  return (
    <div className="text-xs text-red-500 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">{error}</div>
  );
}
