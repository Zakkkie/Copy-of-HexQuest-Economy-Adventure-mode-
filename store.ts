







import { create } from 'zustand';
import { GameState, Entity, Hex, EntityType, UIState, WinCondition, LeaderboardEntry, EntityState, MoveAction, RechargeAction, SessionState, LogEntry } from './types.ts';
import { GAME_CONFIG } from './rules/config.ts';
import { getHexKey, getNeighbors, findPath } from './services/hexUtils.ts';
import { GameEngine } from './engine/GameEngine.ts';
import { checkGrowthCondition } from './rules/growth.ts';

const MOCK_USER_DB: Record<string, { password: string; avatarColor: string; avatarIcon: string }> = {};
const BOT_PALETTE = ['#ef4444', '#f97316', '#a855f7', '#ec4899']; 
const LEADERBOARD_STORAGE_KEY = 'hexquest_leaderboard_v3'; // Incremented version

// Helper to load persisted leaderboard
const loadLeaderboard = (): LeaderboardEntry[] => {
  try {
    const stored = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load leaderboard", e);
    return [];
  }
};

interface AuthResponse { success: boolean; message?: string; }

interface GameStore extends GameState {
  session: SessionState | null;

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

// Module-level singleton to hold the mutable engine instance outside of React's state
let engine: GameEngine | null = null;

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
      avatarColor: BOT_PALETTE[i % BOT_PALETTE.length],
      recoveredCurrentHex: false
    });
  }
  
  const initialLog: LogEntry = {
    id: 'init-0',
    text: 'System Online. Mission Initialized.',
    type: 'INFO',
    source: 'SYSTEM',
    timestamp: Date.now()
  };

  return {
    stateVersion: 0,
    sessionId: Math.random().toString(36).substring(2, 15),
    sessionStartTime: Date.now(),
    winCondition,
    difficulty: winCondition.difficulty,
    grid: initialGrid,
    player: {
      id: 'player-1', type: EntityType.PLAYER, state: EntityState.IDLE, q: 0, r: 0,
      playerLevel: 0, coins: GAME_CONFIG.INITIAL_COINS, moves: GAME_CONFIG.INITIAL_MOVES,
      totalCoinsEarned: 0, recentUpgrades: [], movementQueue: [],
      recoveredCurrentHex: false
    },
    bots,
    currentTurn: 0,
    messageLog: [initialLog],
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
  leaderboard: loadLeaderboard(),
  hasActiveSession: false,
  
  // Reactive snapshot of the engine's state
  session: null,
  
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
      engine = new GameEngine(initialSessionState); 
      set({ session: engine.state, hasActiveSession: true, uiState: 'GAME' });
  },

  abandonSession: () => {
      if (engine) {
          engine.destroy();
          engine = null;
          set({ session: null, hasActiveSession: false, uiState: 'MENU' });
      }
  },
  
  showToast: (message, type) => set({ toast: { message, type, timestamp: Date.now() } }),
  hideToast: () => set({ toast: null }),

  // Player Actions (delegated to engine)
  togglePlayerGrowth: (intent: 'RECOVER' | 'UPGRADE' = 'RECOVER') => {
      if (!engine) return;
      const { session } = get();
      if (!session) return;

      if (session.player.state === EntityState.MOVING) return;
      
      const isCurrentlyGrowing = session.isPlayerGrowing;
      // Note: Logic allows toggling ON 'RECOVER' even if already growing, to switch modes if implemented,
      // but primarily toggles on/off.
      engine.setPlayerIntent(!isCurrentlyGrowing, isCurrentlyGrowing ? null : intent);
      set({ session: engine.state });
  },

  rechargeMove: () => {
      if (!engine) return;

      const action: RechargeAction = { type: 'RECHARGE_MOVE', stateVersion: engine.state.stateVersion };
      const res = engine.applyAction(engine.state.player.id, action);
      if (res.ok) {
        set({ session: engine.state });
      } else {
        set({ toast: { message: res.reason || "Recharge Failed", type: 'error', timestamp: Date.now() } });
      }
  },

  movePlayer: (tq, tr) => {
      if (!engine) return;
      const { session } = get();
      if (!session) return;

      if (session.player.state === EntityState.MOVING) return;
      
      const obstacles = session.bots.map(b => ({ q: b.q, r: b.r }));
      const path = findPath({ q: session.player.q, r: session.player.r }, { q: tq, r: tr }, session.grid, session.player.playerLevel, obstacles);
      
      if (!path) {
        set({ toast: { message: "Path Blocked", type: 'error', timestamp: Date.now() } });
        return;
      }

      let totalMoveCost = 0;
      for (const step of path) {
        const hex = session.grid[getHexKey(step.q, step.r)];
        totalMoveCost += (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
      }

      const costMoves = Math.min(session.player.moves, totalMoveCost);
      const costCoins = (totalMoveCost - costMoves) * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

      if (session.player.coins < costCoins) {
        set({ toast: { message: `Need ${costCoins} credits`, type: 'error', timestamp: Date.now() } });
        return;
      }
      if (costCoins > 0) {
        set({ pendingConfirmation: { type: 'MOVE_WITH_COINS', data: { path, costMoves, costCoins } } });
        return;
      }

      const action: MoveAction = { type: 'MOVE', path, stateVersion: session.stateVersion };
      const res = engine.applyAction(session.player.id, action);
      if (res.ok) {
        set({ session: engine.state });
      } else {
        set({ toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() } });
      }
  },

  confirmPendingAction: () => {
      if (!engine) return;
      const { pendingConfirmation, session } = get();
      if (!pendingConfirmation || !session) return;

      const { path } = pendingConfirmation.data;
      const action: MoveAction = { type: 'MOVE', path, stateVersion: session.stateVersion };
      
      const res = engine.applyAction(session.player.id, action);
      if (res.ok) {
        set({ session: engine.state, pendingConfirmation: null });
      } else {
        set({ toast: { message: res.reason || "Error", type: 'error', timestamp: Date.now() }, pendingConfirmation: null });
      }
  },

  cancelPendingAction: () => set({ pendingConfirmation: null }),

  // MAIN LOOP
  tick: () => {
      if (!engine || engine.state.gameStatus !== 'PLAYING') return;
      
      const result = engine.processTick();
      let newToast = get().toast;
      let leaderboardUpdated = false;
      const currentLeaderboard = [...get().leaderboard];
      
      // PROCESS EVENTS
      if (result.events.length > 0) {
          
          // 1. Error Handling & Toasts
          const error = result.events.find(e => e.type === 'ACTION_DENIED' || e.type === 'ERROR');
          if (error) {
              // Push error to the console log if it isn't already there
              // Note: Systems might have already pushed to messageLog, but 'ERROR' events 
              // from engine-level checks (like AiSystem failure) might be raw.
              // We'll trust that the engine state now contains the logs, but we still trigger UI effects.
              
              if (error.entityId === engine.state.player.id) {
                 newToast = { message: error.message || 'Error', type: 'error', timestamp: Date.now() };
              }

              // Also ensure it is logged if it came from system level not handling it
              // (This is a safety catch)
              const alreadyLogged = result.state.messageLog.some(l => l.timestamp === error.timestamp && l.text === error.message);
              if (!alreadyLogged && error.message) {
                  result.state.messageLog.unshift({
                      id: `err-${Date.now()}-${Math.random()}`,
                      text: error.message,
                      type: 'ERROR',
                      source: error.entityId || 'SYSTEM',
                      timestamp: Date.now()
                  });
              }
          }
          
          // 2. Recovery Toast
          const recovery = result.events.find(e => e.type === 'RECOVERY_USED' && e.entityId === engine.state.player.id);
          if (recovery) {
             newToast = { message: recovery.message || 'Supplies Recovered', type: 'success', timestamp: Date.now() };
          }

          // 3. Leaderboard
          const leaderboardEvent = result.events.find(e => e.type === 'LEADERBOARD_UPDATE');
          if (leaderboardEvent && leaderboardEvent.data?.entry) {
              const engineStats = leaderboardEvent.data.entry as LeaderboardEntry;
              const user = get().user;
              
              const newEntry: LeaderboardEntry = {
                  nickname: user?.nickname || 'Unknown Commander',
                  avatarColor: user?.avatarColor || '#3b82f6',
                  avatarIcon: user?.avatarIcon || 'user',
                  maxCoins: engineStats.maxCoins,
                  maxLevel: engineStats.maxLevel,
                  difficulty: engineStats.difficulty || 'MEDIUM', 
                  timestamp: Date.now()
              };

              const existingIndex = currentLeaderboard.findIndex(e => e.nickname === newEntry.nickname && e.difficulty === newEntry.difficulty);
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
                  localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(currentLeaderboard));
              }
          }
      }

      set(state => ({ 
          session: result.state,
          toast: newToast,
          leaderboard: leaderboardUpdated ? currentLeaderboard : state.leaderboard,
      }));
  }
}));