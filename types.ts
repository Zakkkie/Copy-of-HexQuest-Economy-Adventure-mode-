



export type HexCoord = { q: number; r: number; upgrade?: boolean };

// Read-only view of a Hex for the Bot (Architecture Requirement)
export interface HexView {
  id: string;
  q: number;
  r: number;
  currentLevel: number;
  maxLevel: number;
  structureType?: 'NONE' | 'BARRIER' | 'MINE' | 'CAPITAL';
  ownerId?: string; 
}

// Full State Hex
export interface Hex extends HexView {
  progress: number;
  revealed: boolean;
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
  LOCKED = 'LOCKED'
}

export type BotGoalType = 'EXPAND' | 'DEFEND' | 'ATTACK' | 'GROWTH' | 'IDLE' | 'PREPARE_CYCLE';

export interface BotGoal {
  type: BotGoalType;
  targetHexId?: string;
  targetQ?: number;
  targetR?: number;
  priority: number;
  expiresAt: number; 
}

export interface BotMemory {
  lastPlayerPos: HexCoord | null;
  currentGoal: BotGoal | null;
  stuckCounter: number;
  lastActionFailed?: boolean;
  failReason?: string;
}

export interface Entity {
  id: string;
  type: EntityType;
  state: EntityState;
  
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

export type GameEventType = 
  | 'LEVEL_UP' 
  | 'SECTOR_ACQUIRED' 
  | 'MOVE_COMPLETE' 
  | 'ERROR' 
  | 'VICTORY' 
  | 'DEFEAT'
  | 'GROWTH_TICK'
  | 'ACTION_DENIED'
  | 'BOT_LOG'
  | 'LEADERBOARD_UPDATE';

export interface GameEvent {
  type: GameEventType;
  entityId?: string;
  message?: string;
  data?: Record<string, unknown>;
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

// Authoritative state for a single game session, managed by GameEngine
export interface SessionState {
  stateVersion: number;
  sessionId: string; 
  sessionStartTime: number; 
  winCondition: WinCondition | null;
  grid: Record<string, Hex>; 
  player: Entity;
  bots: Entity[]; 
  currentTurn: number;
  gameStatus: 'PLAYING' | 'GAME_OVER' | 'VICTORY' | 'DEFEAT';
  messageLog: string[];
  botActivityLog: BotLogEntry[];
  lastBotActionTime: number; 
  isPlayerGrowing: boolean; 
  playerGrowthIntent: 'RECOVER' | 'UPGRADE' | null; 
  growingBotIds: string[]; 
  telemetry?: GameEvent[]; 
}

// State for the entire application, managed by Zustand
export interface GameState {
  uiState: UIState;
  user: UserProfile | null;
  toast: ToastMessage | null;
  pendingConfirmation: PendingConfirmation | null;
  
  // Cross-session state
  leaderboard: LeaderboardEntry[];
  hasActiveSession: boolean;
}

export type MoveAction = { type: 'MOVE'; path: { q: number; r: number }[]; stateVersion?: number };
export type UpgradeAction = { type: 'UPGRADE'; coord: { q: number; r: number }; upgradeType?: 'DEFAULT' | 'BARRIER' | 'MINE' | 'CAPITAL'; stateVersion?: number };
export type WaitAction = { type: 'WAIT'; stateVersion?: number };
export type RechargeAction = { type: 'RECHARGE_MOVE'; stateVersion?: number };

// FIX: Added missing BotAction type, which is a subset of actions the AI can take.
export type BotAction = MoveAction | UpgradeAction | WaitAction;
export type GameAction = BotAction | RechargeAction;

// Validates result of logic before execution (Architecture Requirement)
export interface ValidationResult {
    ok: boolean;
    reason?: string;
}