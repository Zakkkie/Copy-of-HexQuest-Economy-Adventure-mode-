
import { Entity, EntityState, Hex, HexCoord, GameEvent } from '../../types';
import { getHexKey, getNeighbors } from '../../services/hexUtils';
import { GameEventFactory } from '../events';
import { WorldIndex } from '../WorldIndex';

export class MovementSystem {
  static update(
    entity: Entity, 
    grid: Record<string, Hex>, 
    index: WorldIndex,
    events: GameEvent[]
  ): { entity: Entity, grid: Record<string, Hex> } {
    
    // FSM Check: Can only move if IDLE or MOVING
    if (entity.state !== EntityState.IDLE && entity.state !== EntityState.MOVING) {
      return { entity, grid };
    }

    if (entity.movementQueue.length === 0) {
      // Transition to IDLE if queue empty
      if (entity.state === EntityState.MOVING) {
         entity.state = EntityState.IDLE;
         events.push(GameEventFactory.create('MOVE_COMPLETE', undefined, entity.id));
      }
      return { entity, grid };
    }

    // Process Next Step
    const nextStep = entity.movementQueue[0];

    // SAFETY: If the next step is actually an UPGRADE command (which targets self), ignore it in movement system.
    // It should have been handled by GrowthSystem. If it's here, it might be stale or blocked.
    if (nextStep.upgrade) {
      return { entity, grid };
    }

    // Check Blockage
    if (index.isOccupied(nextStep.q, nextStep.r)) {
      // Check if it's NOT us (though nextStep should generally not be us for a move)
      if (nextStep.q !== entity.q || nextStep.r !== entity.r) {
          // Collision! Clear queue and stop.
          entity.movementQueue = [];
          entity.state = EntityState.IDLE;
          
          // Debugging info
          const blockerId = index.getEntityAt(nextStep.q, nextStep.r)?.id || 'UNKNOWN';
          events.push(GameEventFactory.create(
              'ACTION_DENIED', 
              `Path Blocked by ${blockerId}`, 
              entity.id
          ));
          return { entity, grid };
      }
    }

    // Apply Movement
    entity.state = EntityState.MOVING;
    entity.movementQueue.shift();

    // Reset old tile visibility/state
    const oldKey = getHexKey(entity.q, entity.r);
    const newGrid = { ...grid };
    
    // We don't necessarily reset level to 0 if we move off it, that was old logic (Exploration Mode).
    // In this economy mode, hexes retain levels.
    // But we might want to reset 'progress' if we leave?
    if (newGrid[oldKey]) {
       // Optional: newGrid[oldKey] = { ...newGrid[oldKey], progress: 0 };
    }

    // Update Position
    entity.q = nextStep.q;
    entity.r = nextStep.r;

    // Reveal Fog of War
    const neighbors = getNeighbors(entity.q, entity.r);
    [...neighbors, { q: entity.q, r: entity.r }].forEach(n => {
      const k = getHexKey(n.q, n.r);
      if (!newGrid[k]) {
        newGrid[k] = { 
          id: k, q: n.q, r: n.r, 
          currentLevel: 0, maxLevel: 0, progress: 0, 
          revealed: true 
        };
      }
    });

    return { entity, grid: newGrid };
  }
}
