import {
  ActiveEditorDoc,
  AIAssistantMode,
  AIChatMessage,
  AIModelCapabilityDTO,
  AIStudioPlacement,
  AIStudioTab,
  AliasConfigDTO,
  AppViewMode,
  AuthorshipProofDTO,
  BreadcrumbItem,
  ChatbotContextExcerpt,
  DocFilterMode,
  DocumentVersion,
  DriveVaultFile,
  EditorialInspectorTab,
  EditorialPreferences,
  EditorViewMode,
  ExpressMessageDTO,
  HelpTopicId,
  RAGSearchResult,
  ReleaseUpdateDTO,
  SearchResult,
  SecurityConfigDTO,
  SettingsTabId,
  TrustedDeviceDTO,
  WritttAlgorithmsReport,
} from "../domain";

export interface WorkspaceState {
  prefs: EditorialPreferences;
  activeView: AppViewMode;
  settingsTab: SettingsTabId;
  helpTopic: HelpTopicId;

  docs: SearchResult[];
  activeDoc: ActiveEditorDoc | null;
  splitCompareDoc: ActiveEditorDoc | null;
  docBreadcrumbs: BreadcrumbItem[];

  docFilter: DocFilterMode;
  selectedTagFilter: string;
  searchQuery: string;
  editorMode: EditorViewMode;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  inspectorTab: EditorialInspectorTab;
  aiStudioOpen: boolean;
  aiStudioPlacement: AIStudioPlacement;
  aiStudioTab: AIStudioTab;
  aiHistoryDrawerOpen: boolean;
  formatBarOpen: boolean;
  zenMode: boolean;
  saveState: "saved" | "dirty" | "saving";

  docVersions: DocumentVersion[];
  customDictionary: string[];
  driveFiles: DriveVaultFile[];
  expressInbox: ExpressMessageDTO[];
  trustedDevices: TrustedDeviceDTO[];
  algoReport: WritttAlgorithmsReport | null;
  lastProof: AuthorshipProofDTO | null;
  aliasConfig: AliasConfigDTO;
  securityCfg: SecurityConfigDTO;
  updateInfo: ReleaseUpdateDTO | null;

  localAiOnline: boolean;
  aiModels: string[];
  aiModelCaps: AIModelCapabilityDTO[];
  selectedAiModel: string;
  aiPanelMode: AIAssistantMode;
  activeAiSessionId: string;
  aiChatHistory: AIChatMessage[];
  activeChatbotSessionId: string;
  freeChatbotHistory: AIChatMessage[];
  selectedChatbotTurnIndices: number[];
  attachedChatbotExcerpts: ChatbotContextExcerpt[];
  chatbotIncludeDoc: boolean;
  aiUseRag: boolean;
  aiBusy: boolean;
  ragQuery: string;
  ragResults: RAGSearchResult[];

  gateMode: "pin" | "password" | "change-pin";
  overlayMode: "pin" | "password";
}

export function createInitialWorkspaceState(prefs: EditorialPreferences): WorkspaceState {
  return {
    prefs,
    activeView: "home",
    settingsTab: "appearance",
    helpTopic: "overview",

    docs: [],
    activeDoc: null,
    splitCompareDoc: null,
    docBreadcrumbs: [],

    docFilter: "all",
    selectedTagFilter: "",
    searchQuery: "",
    editorMode: "rich",
    sidebarOpen: true,
    inspectorOpen: false,
    inspectorTab: "outline",
    aiStudioOpen: false,
    aiStudioPlacement: "docked",
    aiStudioTab: "chatbot",
    aiHistoryDrawerOpen: false,
    formatBarOpen: true,
    zenMode: false,
    saveState: "saved",

    docVersions: [],
    customDictionary: [],
    driveFiles: [],
    expressInbox: [],
    trustedDevices: [],
    algoReport: null,
    lastProof: null,
    aliasConfig: {
      alias: "@local-operator",
      changeCount: 0,
      penaltyDays: 0,
      lastChangedAt: "",
      nextAllowedAt: "",
      canChangeNow: true,
      remainingHours: 0,
    },
    securityCfg: {
      password_enabled: false,
      vault_pin_enabled: false,
      vault_unlocked: false,
      app_unlocked: true,
      totp_enabled: false,
      recovery_configured: false,
      rsa_fingerprint: "",
      rsa_public_key_pem: "",
      brute_force_locked: false,
      brute_force_retry_sec: 0,
      kdf_spec: "Argon2id (m=64MB, t=3, p=2) + AES-256-GCM",
      backup_codes_left: 0,
    },
    updateInfo: null,

    localAiOnline: false,
    aiModels: ["llama3.2:latest", "qwen2.5:7b", "deepseek-r1:8b"],
    aiModelCaps: [
      { name: "llama3.2:latest", family: "llama3.2", supportsChat: true },
      { name: "qwen2.5:7b", family: "qwen2.5", supportsChat: true },
      { name: "deepseek-r1:8b", family: "deepseek-r1", supportsChat: true },
    ],
    selectedAiModel: "llama3.2:latest",
    aiPanelMode: "editorial",
    activeAiSessionId: "",
    aiChatHistory: [],
    activeChatbotSessionId: "",
    freeChatbotHistory: [],
    selectedChatbotTurnIndices: [],
    attachedChatbotExcerpts: [],
    chatbotIncludeDoc: true,
    aiUseRag: true,
    aiBusy: false,
    ragQuery: "",
    ragResults: [],

    gateMode: "pin",
    overlayMode: "pin",
  };
}
