
export type HexCoord = { q: number; r: number; upgrade?: boolean };

export interface Hex {
  id: string;
  q: number;
  r: number;
  currentLevel: number; 
  maxLevel: number;     
  progress: number;     
  revealed: boolean;
  
  structureType?: 'NONE' | 'BARRIER' | 'MINE' | 'CAPITAL';
  structureHp?: number;
  mineTimer?: number;
  trap?: { active: boolean, potency?: number } | null;
  attackPoint?: number; 
  movePoint?: number; 
}

export enum EntityType {
  PLAYER = 'PLAYER',
  BOT = 'BOT'
}

export enum EntityState {
  IDLE = 'IDLE',
  MOVING = 'MOVING',
  GROWING = 'GROWING',
  LOCKED = 'LOCKED' // Stunned or waiting
}

export type BotGoalType = 'EXPAND' | 'DEFEND' | 'ATTACK' | 'GROWTH';

export interface BotGoal {
  type: BotGoalType;
  targetHexId?: string;
  priority: number;
}

export interface BotMemory {
  lastPlayerPos: HexCoord | null;
  chokePoints: string[]; 
  aggressionFactor: number; 
  currentGoal?: BotGoal; 
  customState?: Record<string, any>; 
}

export interface Entity {
  id: string;
  type: EntityType;
  state: EntityState; // NEW: Explicit FSM State
  
  q: number;
  r: number;
  
  playerLevel: number; 
  coins: number;
  totalCoinsEarned: number;
  moves: number;
  recentUpgrades: string[]; 
  
  movementQueue: HexCoord[]; 
  
  memory?: BotMemory; 
  avatarColor?: string; 
  attackTokens?: number; 
}

// --- EVENT SYSTEM ---
export type GameEventType = 
  | 'LEVEL_UP' 
  | 'SECTOR_ACQUIRED' 
  | 'MOVE_COMPLETE' 
  | 'ERROR' 
  | 'VICTORY' 
  | 'DEFEAT'
  | 'GROWTH_TICK'
  | 'ACTION_DENIED'
  | 'BOT_LOG'; // NEW

export interface GameEvent {
  type: GameEventType;
  entityId?: string;
  message?: string;
  data?: any;
  timestamp: number;
}

export interface BotLogEntry {
  botId: string;
  action: string;
  reason: string;
  target?: string;
  timestamp: number;
}

export interface ToastMessage {
  message: string;
  type: 'error' | 'success' | 'info';
  timestamp: number;
}

export type UIState = 'MENU' | 'GAME' | 'LEADERBOARD';

export interface UserProfile {
  isAuthenticated: boolean;
  isGuest: boolean;
  nickname: string;
  avatarColor: string;
  avatarIcon: string;
}

export interface PendingConfirmation {
  type: 'MOVE_WITH_COINS';
  data: {
    path: HexCoord[];
    costMoves: number;
    costCoins: number;
  };
}

export type WinType = 'WEALTH' | 'DOMINATION';

export interface WinCondition {
  type: WinType;
  target: number;
  label: string;
  botCount: number; 
}

export interface LeaderboardEntry {
  nickname: string;
  avatarColor: string;
  avatarIcon: string;
  maxCoins: number;
  maxLevel: number;
  timestamp: number;
}

export interface GameState {
  uiState: UIState;
  user: UserProfile | null;
  pendingConfirmation: PendingConfirmation | null;
  
  sessionId: string; 
  sessionStartTime: number; 
  winCondition: WinCondition | null;
  grid: Record<string, Hex>; 
  player: Entity;
  bots: Entity[]; 
  currentTurn: number;
  gameStatus: 'PLAYING' | 'GAME_OVER' | 'VICTORY' | 'DEFEAT';
  messageLog: string[];
  botActivityLog: BotLogEntry[]; // NEW: Debug logs for bots
  lastBotActionTime: number; 
  
  // UI Intent State (distinct from Entity FSM)
  isPlayerGrowing: boolean; 
  playerGrowthIntent: 'RECOVER' | 'UPGRADE' | null; 
  
  growingBotIds: string[]; 
  toast: ToastMessage | null;
  
  leaderboard: LeaderboardEntry[];
  hasActiveSession: boolean;
  
  telemetry?: any[]; 
}

// Actions
export type MoveAction = { type: 'MOVE'; path: { q: number; r: number }[]; };
export type UpgradeAction = { type: 'UPGRADE'; coord: { q: number; r: number }; upgradeType?: 'DEFAULT' | 'BARRIER' | 'MINE' | 'CAPITAL'; };
export type BotAction = MoveAction | UpgradeAction;
