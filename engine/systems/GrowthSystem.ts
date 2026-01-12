

import { System } from './System';
import { GameState, GameEvent, EntityState, Entity, EntityType, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { getHexKey } from '../../services/hexUtils';
import { GameEventFactory } from '../events';
import { checkGrowthCondition } from '../../rules/growth';
import { getLevelConfig, GAME_CONFIG } from '../../rules/config';

export class GrowthSystem implements System {
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    const entities = [state.player, ...state.bots];
    const newGrowingBotIds: string[] = [];

    for (const entity of entities) {
      const isGrowing = this.processEntity(entity, state, index, events);
      
      // Update tracking flags for state
      if (isGrowing) {
        if (entity.type === EntityType.PLAYER) {
           state.isPlayerGrowing = true;
        } else {
           newGrowingBotIds.push(entity.id);
        }
      } else {
        if (entity.type === EntityType.PLAYER) {
           state.isPlayerGrowing = false;
        }
      }
    }
    
    state.growingBotIds = newGrowingBotIds;
  }

  private processEntity(entity: Entity, state: SessionState, index: WorldIndex, events: GameEvent[]): boolean {
    const hasUpgradeCmd = entity.movementQueue.length > 0 && entity.movementQueue[0].upgrade;
    
    // Determine Intent
    // For player: intent comes from UI state.
    // For bots: intent comes from having an upgrade command in queue.
    const isUserIntentActive = entity.type === EntityType.PLAYER && state.isPlayerGrowing;
    const userIntentType = entity.type === EntityType.PLAYER ? state.playerGrowthIntent : null;
    
    const shouldBeGrowing = hasUpgradeCmd || (entity.type === EntityType.PLAYER && isUserIntentActive);

    // FSM: Transition out of GROWING if not actively growing
    if (!shouldBeGrowing) {
      if (entity.state === EntityState.GROWING) {
        entity.state = EntityState.IDLE;
      }
      return false;
    }

    // FSM: Transition to GROWING
    entity.state = EntityState.GROWING;
    
    const key = getHexKey(entity.q, entity.r);
    const hex = state.grid[key];
    
    // Safety check: if hex doesn't exist, abort
    if (!hex) {
         if (hasUpgradeCmd) entity.movementQueue.shift();
         entity.state = EntityState.IDLE;
         return false;
    }

    const neighbors = index.getValidNeighbors(entity.q, entity.r).map(h => ({ q: h.q, r: h.r }));
    const occupied = index.getOccupiedHexesList();
    
    const effectiveIntent = entity.type === EntityType.PLAYER ? (userIntentType || 'RECOVER') : (hasUpgradeCmd ? 'UPGRADE' : 'RECOVER');

    const condition = checkGrowthCondition(hex, entity, neighbors, state.grid, occupied);
    
    // Validation Failed
    if (!condition.canGrow) {
      if (hasUpgradeCmd) entity.movementQueue.shift(); 
      entity.state = EntityState.IDLE;
      
      // Notify player why growth stopped
      if (entity.type === EntityType.PLAYER) {
         const msg = condition.reason || "Growth Conditions Not Met";
         state.messageLog.unshift(`[YOU] ${msg}`);
         if (state.messageLog.length > 100) state.messageLog.pop();
         events.push(GameEventFactory.create('ACTION_DENIED', msg, entity.id));
         state.isPlayerGrowing = false; // Force stop in store
      }
      return false;
    }

    // Calculate Growth
    const targetLevel = hex.currentLevel + 1;
    const config = getLevelConfig(targetLevel);
    const needed = config.growthTime;

    // Check Progress
    if (hex.progress + 1 >= needed) {
      // LEVEL UP
      let newMaxLevel = hex.maxLevel;
      let didMaxIncrease = false;
      let newOwnerId = hex.ownerId; 
      const prefix = entity.type === EntityType.PLAYER ? "[YOU]" : `[${entity.id}]`;

      if (targetLevel > hex.maxLevel) {
        newMaxLevel = targetLevel;
        didMaxIncrease = true;
        entity.playerLevel = Math.max(entity.playerLevel, targetLevel);

        if (targetLevel === 1) {
             // ACQUISITION
             newOwnerId = entity.id;
             
             // Cycle Management: Add to queue
             const q = [...entity.recentUpgrades, hex.id];
             if (q.length > GAME_CONFIG.UPGRADE_LOCK_QUEUE_SIZE) q.shift();
             entity.recentUpgrades = q;
             
             const msg = `${prefix} Sector L1 Acquired`;
             state.messageLog.unshift(msg);
             if (state.messageLog.length > 100) state.messageLog.pop();
             events.push(GameEventFactory.create('SECTOR_ACQUIRED', msg, entity.id));
        } else {
             // LEVEL UP
             // Optional: Reset queue on Rank Up? Currently keeping it simple.
             const msg = `${prefix} Reached Rank L${targetLevel}`;
             state.messageLog.unshift(msg);
             if (state.messageLog.length > 100) state.messageLog.pop();
             events.push(GameEventFactory.create('LEVEL_UP', msg, entity.id));
        }
      }

      // Rewards
      entity.coins += config.income;
      entity.totalCoinsEarned += config.income;
      entity.moves += 1;
      
      // Update Hex
      state.grid[key] = { 
          ...hex, 
          currentLevel: targetLevel, 
          maxLevel: newMaxLevel, 
          progress: 0,
          ownerId: newOwnerId
      };
      
      // Intent Check: Should we stop?
      // Default rule: Stop if we hit the new max level (one step at a time).
      let shouldContinue = targetLevel < newMaxLevel;
      
      // Special Case: If we were just Recovering (Repairing) and intent is UPGRADE,
      // check if we can immediately start the next level.
      if (!shouldContinue && effectiveIntent === 'UPGRADE' && !didMaxIncrease) {
          const nextCheck = checkGrowthCondition(
             state.grid[key],
             entity, neighbors, state.grid, occupied
          );
          if (nextCheck.canGrow) shouldContinue = true;
      }

      if (!shouldContinue) {
         if (hasUpgradeCmd) entity.movementQueue.shift();
         entity.state = EntityState.IDLE;
         return false;
      }
      
      return true;

    } else {
      // Tick Progress
      state.grid[key] = { ...hex, progress: hex.progress + 1 };
      return true;
    }
  }
}