import { System } from './System';
import { GameState, GameEvent, EntityState, Entity, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { getHexKey, getNeighbors } from '../../services/hexUtils';
import { GameEventFactory } from '../events';

export class MovementSystem implements System {
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    const entities = [state.player, ...state.bots];

    for (const entity of entities) {
      this.processEntity(entity, state, index, events);
    }
  }

  private processEntity(entity: Entity, state: SessionState, index: WorldIndex, events: GameEvent[]) {
    // FSM Guard: Only IDLE or MOVING allowed
    if (entity.state !== EntityState.IDLE && entity.state !== EntityState.MOVING) {
      return;
    }

    // 1. Completion Check
    if (entity.movementQueue.length === 0) {
      if (entity.state === EntityState.MOVING) {
         entity.state = EntityState.IDLE;
         events.push(GameEventFactory.create('MOVE_COMPLETE', undefined, entity.id));
      }
      return;
    }

    const nextStep = entity.movementQueue[0];

    // Special Flag: Upgrade is not a move, but handled by GrowthSystem
    if (nextStep.upgrade) {
      return; 
    }

    // 2. Collision Check
    // If next step occupied (by another unit), stop.
    if (index.isOccupied(nextStep.q, nextStep.r)) {
      if (nextStep.q !== entity.q || nextStep.r !== entity.r) {
          entity.movementQueue = []; // Cancel path
          entity.state = EntityState.IDLE;
          
          const blockerId = index.getEntityAt(nextStep.q, nextStep.r)?.id || 'UNKNOWN';
          const msg = `Path Blocked by ${blockerId}`;
          const formattedMsg = `[${entity.id}] ${msg}`;
          state.messageLog.unshift(formattedMsg);
          if (state.messageLog.length > 100) state.messageLog.pop();
          
          events.push(GameEventFactory.create('ACTION_DENIED', msg, entity.id));
          return;
      }
    }

    // 3. Execute Move
    entity.state = EntityState.MOVING;
    entity.movementQueue.shift();

    const oldQ = entity.q;
    const oldR = entity.r;
    
    // Update Entity Position
    entity.q = nextStep.q;
    entity.r = nextStep.r;

    // Update World Index immediately so subsequent entities see the new position
    index.updateEntityPosition(entity.id, oldQ, oldR, entity.q, entity.r);

    // Fog of War / Exploration
    const neighbors = getNeighbors(entity.q, entity.r);
    [...neighbors, { q: entity.q, r: entity.r }].forEach(n => {
      const k = getHexKey(n.q, n.r);
      if (!state.grid[k]) {
        state.grid[k] = { 
          id: k, q: n.q, r: n.r, 
          currentLevel: 0, maxLevel: 0, progress: 0, 
          revealed: true 
        };
      } else {
        // IMMUTABLE UPDATE: Create new hex object instead of mutating existing one
        // This is critical for the new GameEngine.cloneState() optimization.
        state.grid[k] = { ...state.grid[k], revealed: true };
      }
    });
  }
}