import type React from 'react';

export const TitleBar: React.FC = () => {
  return (
    <div
      className="fixed top-0 left-0 right-0 h-10 flex justify-end items-center z-[100] bg-transparent select-none backdrop-blur-sm"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
    >
      {/* Nenhuma botão customizado aqui, o macOS insere as traffic lights nativas (padrão Apple) */}
    </div>
  );
};

export default TitleBar;
