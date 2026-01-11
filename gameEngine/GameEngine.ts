
import { GameState, BotAction, Entity, Hex, HexCoord, EntityType, GameEvent, EntityState, BotLogEntry } from '../types';
import { getHexKey, getNeighbors } from '../services/hexUtils';
import { WorldIndex } from './WorldIndex';
import { GAME_CONFIG } from './config';
import { calculateBotMove } from './ai';
import { GameEventFactory } from './events';
import { MovementSystem } from './systems/MovementSystem';
import { GrowthSystem } from './systems/GrowthSystem';

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * GameEngine - Central Coordinator
 * Orchestrates the ECS-lite pipeline: Input -> Systems -> State Update -> Events
 */
export class GameEngine {
  
  public static processTick(state: GameState): TickResult {
    const now = Date.now();
    const events: GameEvent[] = [];
    
    // 0. Snapshot Mutable State (Shallow copies where necessary for performance)
    let grid = state.grid; 
    let player = { ...state.player };
    let bots = state.bots.map(b => ({ ...b }));
    let growingBotIds: string[] = [];
    let botLogs: BotLogEntry[] = [...state.botActivityLog];

    // 1. Build Index (Spatial Hash)
    const index = new WorldIndex(grid, [player, ...bots]);

    // 2. SYSTEM: Player Pipeline
    // A. Growth
    const playerGrowthRes = GrowthSystem.update(
      player, grid, index, state.isPlayerGrowing, state.playerGrowthIntent, events
    );
    grid = playerGrowthRes.grid;
    player = playerGrowthRes.entity;
    const isPlayerGrowing = playerGrowthRes.isStillGrowing;

    // B. Movement (Only if not growing)
    if (!isPlayerGrowing) {
        const moveRes = MovementSystem.update(player, grid, index, events);
        grid = moveRes.grid;
        player = moveRes.entity;
    }

    // 3. SYSTEM: Bot Pipeline
    let lastBotActionTime = state.lastBotActionTime;
    
    // AI Loop
    bots = bots.map(bot => {
      let b = bot;

      // A. Bot Growth
      const isBotGrowingPrev = state.growingBotIds.includes(b.id);
      // Bots don't have manual intent, logic is inferred from queue/state
      const botGrowthRes = GrowthSystem.update(b, grid, index, isBotGrowingPrev, null, events);
      grid = botGrowthRes.grid;
      b = botGrowthRes.entity;

      if (botGrowthRes.isStillGrowing) {
        growingBotIds.push(b.id);
      } else {
        // B. Bot AI Decision (Only if IDLE)
        if (now - lastBotActionTime > GAME_CONFIG.BOT_ACTION_INTERVAL_MS && b.state === EntityState.IDLE) {
           // Decide
           const obstacles = index.getOccupiedHexesList();
           const result = calculateBotMove(b, grid, player, state.winCondition, obstacles, index);
           
           // LOG DECISION
           botLogs.unshift({
               botId: b.id,
               action: result.action ? result.action.type : 'WAIT',
               reason: result.debug,
               timestamp: now,
               target: result.action && result.action.type === 'MOVE' 
                  ? `${result.action.path[result.action.path.length-1].q},${result.action.path[result.action.path.length-1].r}`
                  : undefined
           });
           
           if (result.action) {
              if (result.action.type === 'MOVE') b.movementQueue = result.action.path;
              if (result.action.type === 'UPGRADE') b.movementQueue = [{ q: b.q, r: b.r, upgrade: true }];
           } else {
              // Idle Income
              b.coins += 1; 
           }
           lastBotActionTime = now;
        }

        // C. Bot Movement
        const moveRes = MovementSystem.update(b, grid, index, events);
        grid = moveRes.grid;
        b = moveRes.entity;
      }
      return b;
    });

    // Trim Logs
    if (botLogs.length > 50) botLogs = botLogs.slice(0, 50);

    // 4. SYSTEM: Victory Check
    const gameStatus = this.checkVictory(player, bots, state.winCondition, state.gameStatus);
    if (gameStatus !== state.gameStatus) {
       if (gameStatus === 'VICTORY') events.push(GameEventFactory.create('VICTORY', 'Mission Accomplished'));
       if (gameStatus === 'DEFEAT') events.push(GameEventFactory.create('DEFEAT', 'Mission Failed'));
    }

    // 5. Construct Result
    return {
      state: {
        ...state,
        grid,
        player,
        bots,
        growingBotIds,
        isPlayerGrowing,
        gameStatus,
        lastBotActionTime,
        botActivityLog: botLogs
      },
      events
    };
  }

  public static applyAction(state: GameState, actorId: string, action: BotAction): GameState {
    const newState = { ...state, player: { ...state.player }, bots: [...state.bots] };
    
    // Locate Actor
    let actor: Entity | undefined = newState.player.id === actorId ? newState.player : newState.bots.find(b => b.id === actorId);
    if (!actor) return state;

    if (actor.state === EntityState.GROWING && action.type === 'MOVE') {
        actor.state = EntityState.IDLE;
    }

    switch (action.type) {
      case 'MOVE':
        actor.movementQueue = action.path;
        break;

      case 'UPGRADE':
        actor.movementQueue = [{ q: action.coord.q, r: action.coord.r, upgrade: true }];
        break;
    }

    return newState;
  }

  private static checkVictory(player: Entity, bots: Entity[], condition: any, currentStatus: any) {
    if (!condition) return 'PLAYING';
    
    const pWin = (condition.type === 'WEALTH' && player.totalCoinsEarned >= condition.target) ||
                 (condition.type === 'DOMINATION' && player.playerLevel >= condition.target);
    
    if (pWin) return 'VICTORY';
    
    const bWin = bots.some(b => 
       (condition.type === 'WEALTH' && b.totalCoinsEarned >= condition.target) ||
       (condition.type === 'DOMINATION' && b.playerLevel >= condition.target)
    );

    if (bWin) return 'DEFEAT';

    return currentStatus;
  }
}
