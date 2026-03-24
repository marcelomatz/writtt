import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  name: string;
  email: string;

  setName: (name: string) => void;
  setEmail: (email: string) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      name: '',
      email: '',

      setName: (name) => set({ name }),
      setEmail: (email) => set({ email }),
    }),
    {
      name: 'writtt-user-storage',
    }
  )
);
