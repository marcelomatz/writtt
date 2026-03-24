import { create } from 'zustand';

type ModalType = 'confirm' | 'prompt' | 'prompt-upload';

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  inputValue?: string;
  placeholder?: string;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  onFileUpload?: (file: File) => void;
  show: (params: {
    type: ModalType;
    title: string;
    message: string;
    placeholder?: string;
    onConfirm?: (value?: string) => void;
    onCancel?: () => void;
    onFileUpload?: (file: File) => void;
    initialValue?: string;
  }) => void;
  hide: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  isOpen: false,
  type: 'confirm',
  title: '',
  message: '',
  inputValue: '',
  placeholder: '',
  onConfirm: () => {},
  onCancel: () => {},
  onFileUpload: () => {},
  show: ({ type, title, message, placeholder, onConfirm, onCancel, onFileUpload, initialValue }) =>
    set({
      isOpen: true,
      type,
      title,
      message,
      placeholder: placeholder ?? '',
      onConfirm: onConfirm || (() => {}),
      onCancel: onCancel || (() => set({ isOpen: false })),
      onFileUpload: onFileUpload,
      inputValue: initialValue || '',
    }),
  hide: () => set({ isOpen: false }),
}));
