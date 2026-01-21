


import { System } from './System';
import { GameState, GameEvent, EntityState, Entity, SessionState, Hex, EntityType } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { getHexKey, getNeighbors } from '../../services/hexUtils';
import { GameEventFactory } from '../events';
import { GAME_CONFIG } from '../../rules/config';

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

    // 1. Completion Check (Cleanup if queue was cleared externally)
    if (entity.movementQueue.length === 0) {
      if (entity.state === EntityState.MOVING) {
         entity.state = EntityState.IDLE;
         // Reset ability usage when arriving at destination
         entity.recoveredCurrentHex = false;
         events.push(GameEventFactory.create('MOVE_COMPLETE', undefined, entity.id));
      }
      return;
    }

    // --- ANIMATION THROTTLE ---
    // If the entity is currently moving, ensure we wait for the animation to finish
    // before logically teleporting to the next hex.
    const now = Date.now();
    if (entity.state === EntityState.MOVING) {
        const lastMove = entity.lastMoveTime || 0;
        if (now - lastMove < GAME_CONFIG.MOVEMENT_LOGIC_INTERVAL_MS) {
            return; // Wait for animation to complete
        }
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
          
          // Log collision as warning
          state.messageLog.unshift({
             id: `col-${Date.now()}-${entity.id}`,
             text: msg,
             type: 'WARN',
             source: entity.id,
             timestamp: Date.now()
          });
          
          events.push(GameEventFactory.create('ACTION_DENIED', msg, entity.id));
          return;
      }
    }

    // 3. Execute Move
    entity.movementQueue.shift();

    const oldQ = entity.q;
    const oldR = entity.r;
    const oldHexKey = getHexKey(oldQ, oldR);
    
    // Update Entity Position
    entity.q = nextStep.q;
    entity.r = nextStep.r;
    entity.lastMoveTime = now; // Mark timestamp for throttle

    // Update World Index immediately so subsequent entities see the new position
    index.updateEntityPosition(entity.id, oldQ, oldR, entity.q, entity.r);

    // --- HEX COLLAPSE LOGIC (ON EXIT) ---
    // Check the hex we just LEFT. If it was broken (durability <= 0), collapse it now.
    const oldHex = state.grid[oldHexKey];
    if (oldHex && oldHex.maxLevel === 1 && oldHex.structureType !== 'VOID') {
        const d = oldHex.durability !== undefined ? oldHex.durability : 3;
        if (d <= 0) {
             // COLLAPSE!
             const collapsedHex: Hex = {
                ...oldHex,
                maxLevel: 0,
                currentLevel: 0,
                progress: 0,
                ownerId: undefined,
                durability: 0,
                structureType: 'VOID' // Mark as hole
            };
            
            state.grid = { ...state.grid, [oldHexKey]: collapsedHex };
            
            events.push(GameEventFactory.create('HEX_COLLAPSE', undefined, entity.id, { q: oldHex.q, r: oldHex.r }));
            
            // Only log significant events to avoid spam
            if (entity.type === EntityType.PLAYER) {
                state.messageLog.unshift({
                    id: `collapse-${Date.now()}`,
                    text: `Sector Collapsed Behind You!`,
                    type: 'WARN',
                    source: 'SYSTEM',
                    timestamp: Date.now()
                });
            }
        }
    }

    // --- HEX DAMAGE LOGIC (ON ENTRY) ---
    // Damage the new hex we just stepped ON.
    const newHexKey = getHexKey(entity.q, entity.r);
    const newHex = state.grid[newHexKey];
    
    if (newHex && newHex.maxLevel === 1 && newHex.structureType !== 'VOID') {
        const currentDurability = newHex.durability !== undefined ? newHex.durability : 3;
        const newDurability = currentDurability - 1;
        
        // Update durability
        state.grid = { ...state.grid, [newHexKey]: { ...newHex, durability: newDurability } };

        // Visual/Audio Feedback if it just broke (reached 0), but DON'T collapse yet
        if (newDurability <= 0 && currentDurability > 0) {
             // Visual only, sound handled elsewhere
        }
    }

    // Fog of War / Exploration (Copy-On-Write Optimization)
    const neighbors = getNeighbors(entity.q, entity.r);
    const updates: Record<string, Hex> = {};
    
    [...neighbors, { q: entity.q, r: entity.r }].forEach(n => {
      const k = getHexKey(n.q, n.r);
      // We must read from state.grid here in case it was just modified by collapse logic
      const hex = state.grid[k];
      
      if (!hex) {
        // Create new hex
        updates[k] = { 
          id: k, q: n.q, r: n.r, 
          currentLevel: 0, maxLevel: 0, progress: 0, 
          revealed: true 
        };
      } else if (!hex.revealed) {
        // Update existing hex only if not revealed
        updates[k] = { ...hex, revealed: true };
      }
    });

    // BATCH UPDATE
    if (Object.keys(updates).length > 0) {
        state.grid = { ...state.grid, ...updates };
    }

    // 4. Update State Immediately
    const hasMoreMoves = entity.movementQueue.length > 0 && !entity.movementQueue[0].upgrade;
    
    if (!hasMoreMoves) {
        // If no more moves, wait for the final animation to play out before switching to IDLE?
        // Actually, switching to IDLE immediately is fine because the throttle above handles the 'during-move' state.
        // But to prevent immediate action spam, we stay moving until next tick? 
        // No, stay MOVING so the throttle can apply next tick if needed.
        // Actually, we can just set to IDLE.
        entity.state = EntityState.IDLE;
        entity.recoveredCurrentHex = false;
        events.push(GameEventFactory.create('MOVE_COMPLETE', undefined, entity.id));
    } else {
        entity.state = EntityState.MOVING;
    }
  }
}