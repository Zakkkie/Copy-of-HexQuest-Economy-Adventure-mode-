import { GameState, GameAction, EntityType, EntityState, ValidationResult, SessionState } from '../types';
import { WorldIndex } from './WorldIndex';
import { getHexKey } from '../services/hexUtils';
import { checkGrowthCondition } from '../rules/growth';
import { GAME_CONFIG, SAFETY_CONFIG, DIFFICULTY_SETTINGS } from '../rules/config';

/**
 * ActionProcessor is now a STATELESS service.
 * It operates on the state object passed into its methods.
 */
export class ActionProcessor {
  constructor() {}
  
  public validateAction(state: SessionState, index: WorldIndex, actorId: string, action: GameAction): ValidationResult {
    const actor = state.player.id === actorId ? state.player : state.bots.find(b => b.id === actorId);
    if (!actor) return { ok: false, reason: 'Entity not found' };

    if (action.stateVersion !== undefined && action.stateVersion !== state.stateVersion) {
         return { ok: false, reason: `STALE STATE (v${action.stateVersion} vs v${state.stateVersion})` };
    }

    if (actor.state === EntityState.LOCKED) return { ok: false, reason: 'Actor Locked' };
    if (actor.state === EntityState.MOVING && action.type === 'MOVE') return { ok: false, reason: 'Already moving' };

    switch (action.type) {
        case 'UPGRADE': {
            const key = getHexKey(action.coord.q, action.coord.r);
            const hex = state.grid[key];
            if (!hex) return { ok: false, reason: 'Invalid Coord' };

            // Special Case: RECOVER intent on owned hex is always allowed (skips growth rules)
            if (action.intent === 'RECOVER') {
                if (hex.ownerId === actor.id) {
                    return { ok: true };
                } else {
                    return { ok: false, reason: 'Cannot recover neutral/hostile hex' };
                }
            }

            const neighbors = index.getValidNeighbors(action.coord.q, action.coord.r).map(h => ({q:h.q, r:h.r}));
            const occupied = index.getOccupiedHexesList();
            
            // Resolve Queue Size
            const queueSize = DIFFICULTY_SETTINGS[state.difficulty]?.queueSize || 3;

            const check = checkGrowthCondition(hex, actor, neighbors, state.grid, occupied, queueSize);
            if (!check.canGrow) return { ok: false, reason: check.reason };
            break;
        }
        case 'MOVE': {
            if (action.path.length === 0) return { ok: false, reason: 'Empty Path' };
            
            // SECURITY CHECK: Path Length Limit
            if (action.path.length > SAFETY_CONFIG.MAX_PATH_LENGTH) {
                return { ok: false, reason: 'Path too long (Safety Limit)' };
            }

            const destination = action.path[action.path.length - 1];
            const entityAtDest = index.getEntityAt(destination.q, destination.r);
            if (entityAtDest && entityAtDest.id !== actor.id) {
                return { ok: false, reason: `Destination (${destination.q},${destination.r}) is occupied by ${entityAtDest.id}` };
            }

            let totalMoveCost = 0;
            for (const step of action.path) {
                const hex = state.grid[getHexKey(step.q, step.r)];
                totalMoveCost += (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
            }
            
            // Logic: Calculate move deficit. If we don't have enough moves, we pay in coins.
            const movesDeficit = Math.max(0, totalMoveCost - actor.moves);
            const costCoins = movesDeficit * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

            if (actor.coins < costCoins) {
                return { ok: false, reason: `Insufficient credits. Need ${costCoins}, have ${actor.coins}.` };
            }
            break;
        }
        case 'RECHARGE_MOVE': {
            if (actor.coins < GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE) {
                return { ok: false, reason: 'Insufficient credits for recharge.' };
            }
            break;
        }
    }

    return { ok: true };
  }

  /**
   * Applies an action by MUTATING the passed-in state object.
   * This is safe because the GameEngine provides a deep copy.
   */
  public applyAction(state: SessionState, index: WorldIndex, actorId: string, action: GameAction): ValidationResult {
    const validation = this.validateAction(state, index, actorId, action);
    const actor = state.player.id === actorId ? state.player : state.bots.find(b => b.id === actorId);
    
    if (!validation.ok) {
        if (actor && actor.type === EntityType.BOT) {
            if (!actor.memory) actor.memory = { lastPlayerPos: null, currentGoal: null, stuckCounter: 0 };
            actor.memory.lastActionFailed = true;
            actor.memory.failReason = validation.reason;
        }
        return validation;
    }

    if (!actor) return { ok: false, reason: 'Actor vanished' };

    if (actor.memory) {
        actor.memory.lastActionFailed = false;
        actor.memory.failReason = undefined;
    }

    if (actor.state === EntityState.GROWING && action.type === 'MOVE') {
        actor.state = EntityState.IDLE;
        if (actor.id === state.player.id) {
            state.isPlayerGrowing = false;
            state.playerGrowthIntent = null;
        }
    }

    switch (action.type) {
      case 'MOVE': {
        let totalMoveCost = 0;
        for (const step of action.path) {
            const hex = state.grid[getHexKey(step.q, step.r)];
            totalMoveCost += (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
        }

        // Apply simplified cost logic
        const movesDeficit = Math.max(0, totalMoveCost - actor.moves);
        const costCoins = movesDeficit * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;
        const costMoves = totalMoveCost - movesDeficit;

        actor.moves -= costMoves;
        actor.coins -= costCoins;
        
        actor.movementQueue = action.path;
        break;
      }
      case 'UPGRADE':
        actor.movementQueue = [{ q: action.coord.q, r: action.coord.r, upgrade: true, intent: action.intent }];
        break;
      case 'RECHARGE_MOVE':
        actor.coins -= GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;
        actor.moves += 1;
        break;
      case 'WAIT':
        break;
    }
    
    return { ok: true };
  }
}