
import { Entity, EntityState, Hex, HexCoord, GameEvent, EntityType } from '../../types';
import { getHexKey } from '../../services/hexUtils';
import { GameEventFactory } from '../events';
import { WorldIndex } from '../WorldIndex';
import { checkGrowthCondition } from '../growth';
import { getLevelConfig, GAME_CONFIG } from '../config';

export class GrowthSystem {
  static update(
    entity: Entity,
    grid: Record<string, Hex>,
    index: WorldIndex,
    isUserIntentActive: boolean, // Only relevant for Player
    userIntentType: 'RECOVER' | 'UPGRADE' | null,
    events: GameEvent[]
  ): { entity: Entity, grid: Record<string, Hex>, isStillGrowing: boolean } {

    // 1. Determine Desired State
    // Check if there is an Upgrade Command in queue (Bot or Queued Player Action)
    const hasUpgradeCmd = entity.movementQueue.length > 0 && entity.movementQueue[0].upgrade;
    
    // Decide if we SHOULD be growing
    const shouldBeGrowing = hasUpgradeCmd || (entity.type === EntityType.PLAYER && isUserIntentActive);

    if (!shouldBeGrowing) {
      if (entity.state === EntityState.GROWING) {
        entity.state = EntityState.IDLE;
      }
      return { entity, grid, isStillGrowing: false };
    }

    // 2. Transition FSM
    entity.state = EntityState.GROWING;
    
    // 3. Validate Conditions
    const key = getHexKey(entity.q, entity.r);
    const hex = grid[key];
    const neighbors = index.getValidNeighbors(entity.q, entity.r).map(h => ({ q: h.q, r: h.r }));
    const occupied = index.getOccupiedHexesList();
    
    // Resolve Intent: Player explicit intent OR 'UPGRADE' for queued actions OR 'RECOVER' default
    const effectiveIntent = entity.type === EntityType.PLAYER ? userIntentType : (hasUpgradeCmd ? 'UPGRADE' : 'RECOVER');

    const condition = checkGrowthCondition(hex, entity, neighbors, grid, occupied);
    
    if (!hex || !condition.canGrow) {
      // Failed to grow
      if (hasUpgradeCmd) entity.movementQueue.shift(); // Clear blocked command
      entity.state = EntityState.IDLE;
      if (entity.type === EntityType.PLAYER) {
         events.push(GameEventFactory.create('ACTION_DENIED', condition.reason, entity.id));
      }
      return { entity, grid, isStillGrowing: false };
    }

    // 4. Apply Progress Tick
    const targetLevel = hex.currentLevel + 1;
    const config = getLevelConfig(targetLevel);
    const needed = config.growthTime;
    const newGrid = { ...grid };

    if (hex.progress + 1 >= needed) {
      // --- LEVEL UP LOGIC ---
      let newMaxLevel = hex.maxLevel;
      let didMaxIncrease = false;
      const prefix = entity.type === EntityType.PLAYER ? "[YOU]" : `[${entity.id}]`;

      if (targetLevel > hex.maxLevel) {
        newMaxLevel = targetLevel;
        didMaxIncrease = true;
        entity.playerLevel = Math.max(entity.playerLevel, targetLevel);

        if (targetLevel === 1) {
             const q = [...entity.recentUpgrades, hex.id];
             if (q.length > GAME_CONFIG.UPGRADE_LOCK_QUEUE_SIZE) q.shift();
             entity.recentUpgrades = q;
             events.push(GameEventFactory.create('SECTOR_ACQUIRED', `${prefix} Sector L1 Acquired`, entity.id));
        } else {
             entity.recentUpgrades = [];
             events.push(GameEventFactory.create('LEVEL_UP', `${prefix} Reached Rank L${targetLevel}`, entity.id));
        }
      }

      // Rewards
      entity.coins += config.income;
      entity.totalCoinsEarned += config.income;
      entity.moves += 1;
      
      newGrid[key] = { ...hex, currentLevel: targetLevel, maxLevel: newMaxLevel, progress: 0 };
      
      // 5. Continuity Check
      // Should we continue growing? 
      // Yes if: We are recovering (Target < Max) OR We are Upgrading and can do next level
      let shouldContinue = targetLevel < newMaxLevel;
      
      if (!shouldContinue && effectiveIntent === 'UPGRADE' && !didMaxIncrease) {
          // Check if we can proceed to next level immediately
          const nextCheck = checkGrowthCondition(
             { ...hex, currentLevel: targetLevel, maxLevel: newMaxLevel },
             entity, neighbors, newGrid, occupied
          );
          if (nextCheck.canGrow) shouldContinue = true;
      }

      if (!shouldContinue) {
         if (hasUpgradeCmd) entity.movementQueue.shift();
         entity.state = EntityState.IDLE;
         return { entity, grid: newGrid, isStillGrowing: false };
      }
      
      return { entity, grid: newGrid, isStillGrowing: true };

    } else {
      // --- TICK LOGIC ---
      newGrid[key] = { ...hex, progress: hex.progress + 1 };
      // events.push(GameEventFactory.create('GROWTH_TICK', undefined, entity.id)); // Too spammy for log, but good for audio
      return { entity, grid: newGrid, isStillGrowing: true };
    }
  }
}
