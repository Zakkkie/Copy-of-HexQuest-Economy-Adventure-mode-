
import { GameState, BotAction, EntityType, EntityState, ValidationResult } from '../types';
import { WorldIndex } from './WorldIndex';
import { getHexKey } from '../services/hexUtils';
import { checkGrowthCondition } from '../rules/growth';

export class ActionProcessor {
  
  static validateAction(state: GameState, index: WorldIndex, actorId: string, action: BotAction): ValidationResult {
    const actor = state.player.id === actorId ? state.player : state.bots.find(b => b.id === actorId);
    if (!actor) return { ok: false, reason: 'Entity not found' };

    // 1. Race Condition Check
    if (action.stateVersion !== undefined && action.stateVersion !== state.stateVersion) {
         return { ok: false, reason: `STALE STATE (v${action.stateVersion} vs v${state.stateVersion})` };
    }

    // 2. Resource / Status Checks
    if (actor.state === EntityState.LOCKED) return { ok: false, reason: 'Actor Locked' };

    // 3. Specific Action Rules
    if (action.type === 'UPGRADE') {
       const key = getHexKey(action.coord.q, action.coord.r);
       const hex = state.grid[key];
       if (!hex) return { ok: false, reason: 'Invalid Coord' };

       const neighbors = index.getValidNeighbors(action.coord.q, action.coord.r).map(h => ({q:h.q, r:h.r}));
       const occupied = index.getOccupiedHexesList();
       
       const check = checkGrowthCondition(hex, actor, neighbors, state.grid, occupied);
       if (!check.canGrow) return { ok: false, reason: check.reason };
    }

    if (action.type === 'MOVE') {
        if (action.path.length === 0) return { ok: false, reason: 'Empty Path' };
    }

    return { ok: true };
  }

  static applyAction(state: GameState, index: WorldIndex, actorId: string, action: BotAction): ValidationResult {
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

    // Clear Fail State
    if (actor.memory) {
        actor.memory.lastActionFailed = false;
        actor.memory.failReason = undefined;
    }

    // Interrupt Growing
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
        
      case 'WAIT':
        // No-op, just consumes a tick decision
        break;
    }
    
    return { ok: true };
  }
}
