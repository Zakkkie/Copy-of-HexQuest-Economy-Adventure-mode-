import { create } from 'zustand';
import { GameState, Entity, Hex, EntityType, UIState, WinCondition, LeaderboardEntry, EntityState } from './types.ts';
import { GAME_CONFIG } from './rules/config.ts';
import { getHexKey, getNeighbors, findPath } from './services/hexUtils.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { checkGrowthCondition } from './rules/growth.ts';

const MOCK_USER_DB: Record<string, { password: string; avatarColor: string; avatarIcon: string }> = {};
const BOT_PALETTE = ['#ef4444', '#f97316', '#a855f7', '#ec4899']; 
let MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { nickname: 'SENTINEL_AI', avatarColor: '#ef4444', avatarIcon: 'bot', maxCoins: 2500, maxLevel: 12, timestamp: Date.now() - 100000 },
];

interface AuthResponse { success: boolean; message?: string; }

interface GameActions {
  setUIState: (state: UIState) => void;
  loginAsGuest: (n: string, c: string, i: string) => void;
  registerUser: (n: string, p: string, c: string, i: string) => AuthResponse;
  loginUser: (n: string, p: string) => AuthResponse;
  logout: () => void;
  startNewGame: (win: WinCondition) => void;
  abandonSession: () => void;
  togglePlayerGrowth: (intent?: 'RECOVER' | 'UPGRADE') => void;
  rechargeMove: () => void;
  movePlayer: (q: number, r: number) => void;
  confirmPendingAction: () => void;
  cancelPendingAction: () => void;
  processMovementStep: () => void;
  tick: () => void;
  showToast: (msg: string, type: 'error' | 'success' | 'info') => void;
  hideToast: () => void;
}

type GameStore = GameState & GameActions;

// --- INITIAL DATA GENERATION ---
const createInitialHex = (q: number, r: number, startLevel = 0): Hex => ({
  id: getHexKey(q, r), q, r, currentLevel: 0, maxLevel: startLevel, progress: 0, revealed: true
});

const generateInitialGameData = (winCondition: WinCondition | null) => {
  const startHex = createInitialHex(0, 0, 0);
  const initialGrid: Record<string, Hex> = { [getHexKey(0,0)]: startHex };
  getNeighbors(0, 0).forEach(n => { initialGrid[getHexKey(n.q, n.r)] = createInitialHex(n.q, n.r, 0); });
  
  const botCount = winCondition?.botCount || 1;
  const bots: Entity[] = [];
  const spawnPoints = [{ q: 0, r: -2 }, { q: 2, r: -2 }, { q: 2, r: 0 }, { q: 0, r: 2 }, { q: -2, r: 2 }, { q: -2, r: 0 }];

  for (let i = 0; i < Math.min(botCount, spawnPoints.length); i++) {
    const sp = spawnPoints[i];
    if (!initialGrid[getHexKey(sp.q, sp.r)]) {
        initialGrid[getHexKey(sp.q, sp.r)] = createInitialHex(sp.q, sp.r, 0);
        getNeighbors(sp.q, sp.r).forEach(n => {
            const k = getHexKey(n.q, n.r);
            if (!initialGrid[k]) initialGrid[k] = createInitialHex(n.q, n.r, 0);
        });
    }
    bots.push({
      id: `bot-${i+1}`, type: EntityType.BOT, state: EntityState.IDLE, q: sp.q, r: sp.r,
      playerLevel: 0, coins: GAME_CONFIG.INITIAL_COINS, moves: GAME_CONFIG.INITIAL_MOVES,
      totalCoinsEarned: 0, recentUpgrades: [], movementQueue: [],
      memory: { lastPlayerPos: null, currentGoal: null, stuckCounter: 0 },
      avatarColor: BOT_PALETTE[i % BOT_PALETTE.length]
    });
  }
  
  return {
    stateVersion: 0, // Init Version
    sessionId: Math.random().toString(36).substring(2, 15),
    sessionStartTime: Date.now(),
    winCondition,
    grid: initialGrid,
    player: {
      id: 'player-1', type: EntityType.PLAYER, state: EntityState.IDLE, q: 0, r: 0,
      playerLevel: 0, coins: GAME_CONFIG.INITIAL_COINS, moves: GAME_CONFIG.INITIAL_MOVES,
      totalCoinsEarned: 0, recentUpgrades: [], movementQueue: []
    } as Entity,
    bots,
    currentTurn: 0,
    messageLog: ['System Online.'],
    botActivityLog: [], 
    gameStatus: 'PLAYING' as const,
    pendingConfirmation: null,
    isPlayerGrowing: false,
    playerGrowthIntent: null,
    growingBotIds: [],
    lastBotActionTime: Date.now(),
    toast: null,
    leaderboard: [...MOCK_LEADERBOARD],
    hasActiveSession: false,
    telemetry: []
  };
};

// --- ENGINE INSTANCE ---
let engine: GameEngine | null = null;

export const useGameStore = create<GameStore>((set, get) => ({
  uiState: 'MENU',
  user: null,
  ...generateInitialGameData(null),
  
  setUIState: (uiState) => set({ uiState }),
  
  // Auth
  loginAsGuest: (nickname, avatarColor, avatarIcon) => set({ user: { isAuthenticated: true, isGuest: true, nickname, avatarColor, avatarIcon } }),
  registerUser: (nickname, password, avatarColor, avatarIcon) => { MOCK_USER_DB[nickname] = { password, avatarColor, avatarIcon }; set({ user: { isAuthenticated: true, isGuest: false, nickname, avatarColor, avatarIcon } }); return { success: true }; },
  loginUser: (nickname, password) => { const r = MOCK_USER_DB[nickname]; if (!r || r.password !== password) return { success: false }; set({ user: { isAuthenticated: true, isGuest: false, nickname, avatarColor: r.avatarColor, avatarIcon: r.avatarIcon } }); return { success: true }; },
  logout: () => set({ ...generateInitialGameData(null), user: null, uiState: 'MENU', hasActiveSession: false }),

  // Game Lifecycle
  startNewGame: (winCondition) => {
      const initialData = generateInitialGameData(winCondition);
      const currentUser = get().user;
      const fullState: GameState = {
        ...initialData,
        user: currentUser,
        uiState: 'GAME'
      };
      engine = new GameEngine(fullState); 
      set({ ...initialData, user: currentUser, hasActiveSession: true, uiState: 'GAME' });
  },

  abandonSession: () => {
      engine = null;
      set((state) => ({ ...generateInitialGameData(null), user: state.user, uiState: 'MENU', hasActiveSession: false, gameStatus: 'GAME_OVER' }));
  },
  
  showToast: (message, type) => set({ toast: { message, type, timestamp: Date.now() } }),
  hideToast: () => set({ toast: null }),

  // Player Actions
  togglePlayerGrowth: (intent: 'RECOVER' | 'UPGRADE' = 'RECOVER') => set(state => {
      if (state.uiState !== 'GAME' || state.player.movementQueue.length > 0) return state;
      
      // Toggle Off
      if (state.isPlayerGrowing) {
          // Sync with Engine
          if (engine) engine.setPlayerIntent(false, null);
          return { isPlayerGrowing: false, playerGrowthIntent: null };
      }

      // Validation
      const hex = state.grid[getHexKey(state.player.q, state.player.r)];
      const neighbors = getNeighbors(state.player.q, state.player.r);
      const others = state.bots.map(b => ({ q: b.q, r: b.r }));
      const check = checkGrowthCondition(hex, state.player, neighbors, state.grid, others);

      if (!check.canGrow && intent === 'UPGRADE') return { toast: { message: check.reason || "Denied", type: 'error', timestamp: Date.now() } };
      
      // Toggle On - Sync with Engine
      if (engine) engine.setPlayerIntent(true, intent);
      return { isPlayerGrowing: true, playerGrowthIntent: intent };
  }),

  rechargeMove: () => set(state => {
      if (state.player.coins < GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE) return state;
      return { player: { ...state.player, coins: state.player.coins - GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE, moves: state.player.moves + 1 } };
  }),

  movePlayer: (tq, tr) => set(state => {
      if (state.player.movementQueue.length > 0) return state;
      
      const obstacles = state.bots.map(b => ({ q: b.q, r: b.r }));
      const path = findPath({ q: state.player.q, r: state.player.r }, { q: tq, r: tr }, state.grid, state.player.playerLevel, obstacles);
      
      if (!path) return { toast: { message: "Path Blocked", type: 'error', timestamp: Date.now() } };

      let totalMoveCost = 0;
      for (const step of path) {
        const hex = state.grid[getHexKey(step.q, step.r)];
        totalMoveCost += (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
      }

      const costMoves = Math.min(state.player.moves, totalMoveCost);
      const costCoins = (totalMoveCost - costMoves) * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

      if (state.player.coins < costCoins) return { toast: { message: `Need ${totalMoveCost} moves`, type: 'error', timestamp: Date.now() } };
      if (costCoins > 0) return { pendingConfirmation: { type: 'MOVE_WITH_COINS', data: { path, costMoves, costCoins } } };

      if (!engine) return state;
      
      // Pass stateVersion for safety (optional for synchronous UI actions but good practice)
      const res = engine.applyAction(state.player.id, { type: 'MOVE', path, stateVersion: state.stateVersion });
      
      if (!res.ok) return { toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() } };

      const syncedState = engine.state;
      return { 
          player: { ...syncedState.player }, 
          moves: syncedState.player.moves, // Explicit sync
          isPlayerGrowing: false, 
          playerGrowthIntent: null,
          grid: syncedState.grid,
          stateVersion: syncedState.stateVersion
      };
  }),

  confirmPendingAction: () => set(state => {
      if (!state.pendingConfirmation || !engine) return state;
      const { path } = state.pendingConfirmation.data;
      
      const res = engine.applyAction(state.player.id, { type: 'MOVE', path, stateVersion: state.stateVersion });
      if (!res.ok) return { toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() }, pendingConfirmation: null };

      const syncedState = engine.state;
      return { 
          player: syncedState.player, 
          pendingConfirmation: null, 
          isPlayerGrowing: false, 
          playerGrowthIntent: null,
          grid: syncedState.grid,
          stateVersion: syncedState.stateVersion
      };
  }),

  cancelPendingAction: () => set({ pendingConfirmation: null }),

  processMovementStep: () => set(state => {
      // Visual interpolation only, Logic handled in Tick
      return state;
  }),

  // MAIN LOOP
  tick: () => set(state => {
      if (state.uiState !== 'GAME' || state.gameStatus !== 'PLAYING' || !engine) return state;
      
      const result = engine.processTick();
      
      let newLog = state.messageLog;
      let newToast = state.toast;
      
      if (result.events.length > 0) {
          const logMessages = result.events
             .filter(e => e.message && e.type !== 'BOT_LOG') 
             .map(e => e.message as string);
          
          if (logMessages.length > 0) {
              newLog = [...logMessages.reverse(), ...state.messageLog].slice(0, 50);
          }
          
          const error = result.events.find(e => e.type === 'ACTION_DENIED' || e.type === 'ERROR');
          if (error && error.entityId === state.player.id) {
              newToast = { message: error.message || 'Error', type: 'error', timestamp: Date.now() };
          }
      }

      // Sync Store with Engine State
      return { ...result.state, messageLog: newLog, toast: newToast };
  })
}));