// modeStore is kept as a stub so no other import needs updating during cleanup.
// All mode-switching UI has been removed; this file may be deleted in a future pass.
export type EditorMode = 'standard';

export const useModeStore = () => ({ currentMode: 'standard' as EditorMode, setMode: (_m: EditorMode) => {} });
