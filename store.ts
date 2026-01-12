

import { create } from 'zustand';
import { GameState, Entity, Hex, EntityType, UIState, WinCondition, LeaderboardEntry, EntityState, MoveAction, RechargeAction, SessionState } from './types.ts';
import { GAME_CONFIG } from './rules/config.ts';
import { getHexKey, getNeighbors, findPath } from './services/hexUtils.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { checkGrowthCondition } from './rules/growth.ts';

const MOCK_USER_DB: Record<string, { password: string; avatarColor: string; avatarIcon: string }> = {};
const BOT_PALETTE = ['#ef4444', '#f97316', '#a855f7', '#ec4899']; 
const INITIAL_LEADERBOARD: LeaderboardEntry[] = [
  { nickname: 'SENTINEL_AI', avatarColor: '#ef4444', avatarIcon: 'bot', maxCoins: 2500, maxLevel: 12, timestamp: Date.now() - 100000 },
];

interface AuthResponse { success: boolean; message?: string; }

interface GameStore extends GameState {
  engine: GameEngine | null;
  engineVersion: number;

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
  tick: () => void;
  showToast: (msg: string, type: 'error' | 'success' | 'info') => void;
  hideToast: () => void;
}

// Generates the data for a NEW game session. UI state is not part of this.
const createInitialSessionData = (winCondition: WinCondition): SessionState => {
  const startHex = { id: getHexKey(0,0), q:0, r:0, currentLevel: 0, maxLevel: 0, progress: 0, revealed: true };
  const initialGrid: Record<string, Hex> = { [getHexKey(0,0)]: startHex };
  getNeighbors(0, 0).forEach(n => { initialGrid[getHexKey(n.q, n.r)] = { id: getHexKey(n.q,n.r), q:n.q, r:n.r, currentLevel:0, maxLevel:0, progress:0, revealed:true }; });
  
  const botCount = winCondition.botCount || 1;
  const bots: Entity[] = [];
  const spawnPoints = [{ q: 0, r: -2 }, { q: 2, r: -2 }, { q: 2, r: 0 }, { q: 0, r: 2 }, { q: -2, r: 2 }, { q: -2, r: 0 }];

  for (let i = 0; i < Math.min(botCount, spawnPoints.length); i++) {
    const sp = spawnPoints[i];
    if (!initialGrid[getHexKey(sp.q, sp.r)]) {
        initialGrid[getHexKey(sp.q, sp.r)] = { id: getHexKey(sp.q,sp.r), q:sp.q, r:sp.r, currentLevel:0, maxLevel:0, progress:0, revealed:true };
        getNeighbors(sp.q, sp.r).forEach(n => {
            const k = getHexKey(n.q, n.r);
            if (!initialGrid[k]) initialGrid[k] = { id:k, q:n.q, r:n.r, currentLevel:0, maxLevel:0, progress:0, revealed:true };
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
    stateVersion: 0,
    sessionId: Math.random().toString(36).substring(2, 15),
    sessionStartTime: Date.now(),
    winCondition,
    grid: initialGrid,
    player: {
      id: 'player-1', type: EntityType.PLAYER, state: EntityState.IDLE, q: 0, r: 0,
      playerLevel: 0, coins: GAME_CONFIG.INITIAL_COINS, moves: GAME_CONFIG.INITIAL_MOVES,
      totalCoinsEarned: 0, recentUpgrades: [], movementQueue: [],
    },
    bots,
    currentTurn: 0,
    messageLog: ['System Online.'],
    botActivityLog: [], 
    gameStatus: 'PLAYING',
    lastBotActionTime: Date.now(),
    isPlayerGrowing: false,
    playerGrowthIntent: null,
    growingBotIds: [],
    telemetry: []
  };
};

export const useGameStore = create<GameStore>((set, get) => ({
  // UI and Cross-Session State
  uiState: 'MENU',
  user: null,
  toast: null,
  pendingConfirmation: null,
  leaderboard: [...INITIAL_LEADERBOARD],
  hasActiveSession: false,
  
  // Engine State
  engine: null,
  engineVersion: 0,
  
  setUIState: (uiState) => set({ uiState }),
  
  // Auth
  loginAsGuest: (nickname, avatarColor, avatarIcon) => set({ user: { isAuthenticated: true, isGuest: true, nickname, avatarColor, avatarIcon } }),
  registerUser: (nickname, password, avatarColor, avatarIcon) => { MOCK_USER_DB[nickname] = { password, avatarColor, avatarIcon }; set({ user: { isAuthenticated: true, isGuest: false, nickname, avatarColor, avatarIcon } }); return { success: true }; },
  loginUser: (nickname, password) => { const r = MOCK_USER_DB[nickname]; if (!r || r.password !== password) return { success: false }; set({ user: { isAuthenticated: true, isGuest: false, nickname, avatarColor: r.avatarColor, avatarIcon: r.avatarIcon } }); return { success: true }; },
  logout: () => {
    get().abandonSession();
    set({ user: null });
  },

  // Game Lifecycle
  startNewGame: (winCondition) => {
      get().abandonSession(); // Ensure old engine is destroyed
      const initialSessionState = createInitialSessionData(winCondition);
      const newEngine = new GameEngine(initialSessionState); 
      set({ engine: newEngine, hasActiveSession: true, uiState: 'GAME', engineVersion: 1 });
  },

  abandonSession: () => {
      const engine = get().engine;
      if (engine) {
          engine.destroy();
          set({ engine: null, hasActiveSession: false, uiState: 'MENU' });
      }
  },
  
  showToast: (message, type) => set({ toast: { message, type, timestamp: Date.now() } }),
  hideToast: () => set({ toast: null }),

  // Player Actions (delegated to engine)
  togglePlayerGrowth: (intent: 'RECOVER' | 'UPGRADE' = 'RECOVER') => {
      const { engine } = get();
      if (!engine) return;
      const { state } = engine;

      // FIX: The `state.uiState` check was incorrect as uiState is not on the engine's session state.
      // Removed the check. The moving check is the only one needed.
      if (state.player.state === EntityState.MOVING) return;
      
      const isCurrentlyGrowing = state.isPlayerGrowing;
      engine.setPlayerIntent(!isCurrentlyGrowing, isCurrentlyGrowing ? null : intent);

      set(s => ({ engineVersion: s.engineVersion + 1 }));
  },

  rechargeMove: () => {
      const { engine } = get();
      if (!engine) return;

      const action: RechargeAction = { type: 'RECHARGE_MOVE', stateVersion: engine.state.stateVersion };
      const res = engine.applyAction(engine.state.player.id, action);
      if (res.ok) {
        set(s => ({ engineVersion: s.engineVersion + 1 }));
      } else {
        set({ toast: { message: res.reason || "Recharge Failed", type: 'error', timestamp: Date.now() } });
      }
  },

  movePlayer: (tq, tr) => {
      const { engine } = get();
      if (!engine) return;
      const { state } = engine;

      if (state.player.state === EntityState.MOVING) return;
      
      const obstacles = state.bots.map(b => ({ q: b.q, r: b.r }));
      const path = findPath({ q: state.player.q, r: state.player.r }, { q: tq, r: tr }, state.grid, state.player.playerLevel, obstacles);
      
      if (!path) {
        set({ toast: { message: "Path Blocked", type: 'error', timestamp: Date.now() } });
        return;
      }

      let totalMoveCost = 0;
      for (const step of path) {
        const hex = state.grid[getHexKey(step.q, step.r)];
        totalMoveCost += (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
      }

      const costMoves = Math.min(state.player.moves, totalMoveCost);
      const costCoins = (totalMoveCost - costMoves) * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

      if (state.player.coins < costCoins) {
        set({ toast: { message: `Need ${costCoins} credits`, type: 'error', timestamp: Date.now() } });
        return;
      }
      if (costCoins > 0) {
        set({ pendingConfirmation: { type: 'MOVE_WITH_COINS', data: { path, costMoves, costCoins } } });
        return;
      }

      const action: MoveAction = { type: 'MOVE', path, stateVersion: state.stateVersion };
      const res = engine.applyAction(state.player.id, action);
      if (res.ok) {
        set(s => ({ engineVersion: s.engineVersion + 1, isPlayerGrowing: false, playerGrowthIntent: null }));
      } else {
        set({ toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() } });
      }
  },

  confirmPendingAction: () => {
      const { engine, pendingConfirmation } = get();
      if (!engine || !pendingConfirmation) return;

      const { path } = pendingConfirmation.data;
      const action: MoveAction = { type: 'MOVE', path, stateVersion: engine.state.stateVersion };
      
      const res = engine.applyAction(engine.state.player.id, action);
      if (res.ok) {
        set(s => ({ engineVersion: s.engineVersion + 1, pendingConfirmation: null, isPlayerGrowing: false, playerGrowthIntent: null }));
      } else {
        set({ toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() }, pendingConfirmation: null });
      }
  },

  cancelPendingAction: () => set({ pendingConfirmation: null }),

  // MAIN LOOP
  tick: () => {
      const { engine } = get();
      if (!engine || engine.state.gameStatus !== 'PLAYING') return;
      
      const result = engine.processTick();
      let newToast = get().toast;
      let leaderboardUpdated = false;
      
      if (result.events.length > 0) {
          const error = result.events.find(e => e.type === 'ACTION_DENIED' || e.type === 'ERROR');
          if (error && error.entityId === engine.state.player.id) {
              newToast = { message: error.message || 'Error', type: 'error', timestamp: Date.now() };
          }

          const leaderboardEvent = result.events.find(e => e.type === 'LEADERBOARD_UPDATE');
          if (leaderboardEvent && leaderboardEvent.data?.entry) {
              const newEntry = leaderboardEvent.data.entry as LeaderboardEntry;
              const currentLeaderboard = get().leaderboard;

              const existingIndex = currentLeaderboard.findIndex(e => e.nickname === newEntry.nickname);
              let shouldUpdate = false;

              if (existingIndex > -1) {
                  const existing = currentLeaderboard[existingIndex];
                  const existingScore = existing.maxCoins + existing.maxLevel * 100;
                  const newScore = newEntry.maxCoins + newEntry.maxLevel * 100;
                  if (newScore > existingScore) {
                      currentLeaderboard[existingIndex] = newEntry;
                      shouldUpdate = true;
                  }
              } else {
                  currentLeaderboard.push(newEntry);
                  shouldUpdate = true;
              }

              if (shouldUpdate) {
                  currentLeaderboard.sort((a, b) => {
                      const scoreA = a.maxCoins + (a.maxLevel * 100);
                      const scoreB = b.maxCoins + (b.maxLevel * 100);
                      return scoreB - scoreA;
                  });
                  leaderboardUpdated = true;
              }
          }
      }

      set(state => ({ 
          engineVersion: state.engineVersion + 1,
          toast: newToast,
          leaderboard: leaderboardUpdated ? [...state.leaderboard] : state.leaderboard,
      }));
  }
}));