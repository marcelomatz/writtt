import { Upload, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useModalStore } from '../store/modalStore';

const dict = {
  pt: {
    upload_device: 'Upload do dispositivo',
    cancel: 'Cancelar',
    insert_url: 'Inserir via URL',
    confirm: 'Confirmar',
  },
  en: {
    upload_device: 'Upload from device',
    cancel: 'Cancel',
    insert_url: 'Insert via URL',
    confirm: 'Confirm',
  },
};

export function Modal() {
  const t = useTranslation(dict);
  const { isOpen, title, message, type, inputValue, placeholder, onConfirm, onFileUpload, hide } =
    useModalStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && (type === 'prompt' || type === 'prompt-upload') && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, type]);

  if (!isOpen) {
    return null;
  }

  const handleConfirm = () => {
    onConfirm(inputValue);
    hide();
  };

  const handleCancel = () => {
    hide();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onFileUpload) {
      onFileUpload(e.target.files[0]);
      hide();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-300"
      onClick={handleCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="dark:bg-[#0b1224] rounded-xl shadow-2xl dark:border-slate-800 p-8 w-full max-w-md animate-in zoom-in-95 duration-200 border"
        style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button
            onClick={handleCancel}
            className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{message}</p>

        {(type === 'prompt' || type === 'prompt-upload') && (
          <div className="flex gap-2 items-center mb-6">
            <input
              ref={inputRef}
              type="text"
              value={useModalStore.getState().inputValue}
              onChange={(e) => useModalStore.setState({ inputValue: e.target.value })}
              className="flex-1 w-full bg-slate-50 dark:bg-slate-900 text-sm px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 outline-none text-slate-700 dark:text-slate-200 focus:border-blue-500 transition-colors"
              placeholder={placeholder || (type === 'prompt-upload' ? 'https://...' : '')}
            />
            {type === 'prompt-upload' && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-3 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
                  title={t.upload_device}
                >
                  <Upload className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleCancel}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
          >
            {t.cancel}
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
          >
            {type === 'prompt-upload' ? t.insert_url : t.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
