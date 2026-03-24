import React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../wailsjs/runtime/runtime';

export const TitleBar: React.FC = () => {
  return (
    <div 
      className="fixed top-0 left-0 right-0 h-10 flex justify-end items-center z-[100] bg-transparent select-none backdrop-blur-sm"
      style={{ "--wails-draggable": "drag" } as React.CSSProperties}
    >
      <div 
        className="flex h-full items-center"
        style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}
      >
        <button 
          onClick={WindowMinimise}
          className="h-full px-5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Minimizar"
        >
          <Minus size={16} strokeWidth={1.5} />
        </button>
        
        <button 
          onClick={WindowToggleMaximise}
          className="h-full px-5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          title="Maximizar"
        >
          <Square size={14} strokeWidth={1.5} />
        </button>
        
        <button 
          onClick={Quit}
          className="h-full px-5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-red-500 hover:text-white transition-colors"
          title="Fechar"
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;