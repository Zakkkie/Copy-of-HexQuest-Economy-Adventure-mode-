
import { System } from './System';
import { GameState, GameEvent, EntityState, Entity, EntityType, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { getHexKey } from '../../services/hexUtils';
import { GameEventFactory } from '../events';
import { checkGrowthCondition } from '../../rules/growth';
import { getLevelConfig, GAME_CONFIG, DIFFICULTY_SETTINGS } from '../../rules/config';

export class GrowthSystem implements System {
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    const entities = [state.player, ...state.bots];
    const newGrowingBotIds: string[] = [];

    // Resolve Queue Size from Difficulty
    const queueSize = DIFFICULTY_SETTINGS[state.difficulty]?.queueSize || 3;

    for (const entity of entities) {
      const isGrowing = this.processEntity(entity, state, index, events, queueSize);
      
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

  private processEntity(entity: Entity, state: SessionState, index: WorldIndex, events: GameEvent[], queueSize: number): boolean {
    const hasUpgradeCmd = entity.movementQueue.length > 0 && entity.movementQueue[0].upgrade;
    const queuedIntent = hasUpgradeCmd ? entity.movementQueue[0].intent : null;
    const key = getHexKey(entity.q, entity.r);
    const hex = state.grid[key];
    
    // Determine Intent
    let isUserIntentActive = entity.type === EntityType.PLAYER && state.isPlayerGrowing;
    let userIntentType = entity.type === EntityType.PLAYER ? state.playerGrowthIntent : null;
    
    // --- Auto-Trigger Logic (Player Only) ---
    // Automatically trigger upgrade if it results in a Rank Up (level > playerLevel)
    if (entity.type === EntityType.PLAYER && entity.state === EntityState.IDLE && !isUserIntentActive && !hasUpgradeCmd && hex) {
        const targetLevel = hex.currentLevel + 1;
        // Check if this upgrade is a Rank Up event
        if (targetLevel > entity.playerLevel) {
             const config = getLevelConfig(targetLevel);
             if (entity.coins >= config.cost) {
                 const neighbors = index.getValidNeighbors(entity.q, entity.r).map(h => ({ q: h.q, r: h.r }));
                 const occupied = index.getOccupiedHexesList();
                 const condition = checkGrowthCondition(hex, entity, neighbors, state.grid, occupied, queueSize);
                 
                 if (condition.canGrow) {
                     // Auto-Activate
                     isUserIntentActive = true;
                     userIntentType = 'UPGRADE';
                     
                     // Sync state
                     state.isPlayerGrowing = true;
                     state.playerGrowthIntent = 'UPGRADE';
                 }
             }
        }
    }
    // ----------------------------------------

    const shouldBeGrowing = hasUpgradeCmd || (entity.type === EntityType.PLAYER && isUserIntentActive);

    // FSM: Transition out of GROWING if not actively growing
    if (!shouldBeGrowing) {
      if (entity.state === EntityState.GROWING) {
        entity.state = EntityState.IDLE;
        // Reset progress if we stopped mid-way? 
        // Strategy: We keep progress on the hex to allow pausing/resuming, 
        // BUT if the intent flips (Upgrade <-> Recover), we must handle that reset.
        // For now, we rely on the check below to reset if needed.
      }
      return false;
    }

    // FSM: Transition to GROWING
    entity.state = EntityState.GROWING;
    
    // Safety check
    if (!hex) {
         if (hasUpgradeCmd) entity.movementQueue.shift();
         entity.state = EntityState.IDLE;
         return false;
    }

    // Determine Effective Intent
    let effectiveIntent: 'UPGRADE' | 'RECOVER' = 'RECOVER';
    
    if (entity.type === EntityType.PLAYER) {
        effectiveIntent = userIntentType || 'RECOVER';
    } else {
        // Bots: Use queued intent if available, otherwise default to UPGRADE unless queue logic forces otherwise
        effectiveIntent = queuedIntent || 'UPGRADE';
    }

    // === BRANCH 1: RECOVERY ACTION (Timed) ===
    if (effectiveIntent === 'RECOVER') {
        if (entity.recoveredCurrentHex) {
             // Already done for this visit/turn
             if (entity.type === EntityType.PLAYER) {
                // Stop automatically
                state.isPlayerGrowing = false;
             }
             if (hasUpgradeCmd) entity.movementQueue.shift();
             entity.state = EntityState.IDLE;
             return false;
        }

        const config = getLevelConfig(hex.maxLevel); // Recovery time depends on current max level
        const needed = config.growthTime;

        if (hex.progress + 1 >= needed) {
            // FINISH RECOVERY
            const coinReward = (hex.maxLevel || 0) * 5 + 5; // Base + Scale
            entity.moves += 1;
            entity.coins += coinReward;
            entity.totalCoinsEarned += coinReward;
            entity.recoveredCurrentHex = true; // Mark used

            const prefix = entity.type === EntityType.PLAYER ? "[YOU]" : `[${entity.id}]`;
            const msg = `${prefix} Recovered 1 Move + ${coinReward} Credits`;
            
            state.messageLog.unshift({
                id: `rec-${Date.now()}-${entity.id}`,
                text: msg,
                type: 'SUCCESS',
                source: entity.id,
                timestamp: Date.now()
            });
            
            events.push(GameEventFactory.create('RECOVERY_USED', msg, entity.id));
            
            // Reset Progress and Stop (Copy-On-Write)
            state.grid = { ...state.grid, [key]: { ...hex, progress: 0 } };
            
            // For Player, toggle off. For Bot, they will rethink next tick.
            if (entity.type === EntityType.PLAYER) {
                 state.isPlayerGrowing = false;
            }
            if (hasUpgradeCmd) entity.movementQueue.shift();
            entity.state = EntityState.IDLE;
            return false;
        } else {
            // Tick Progress (Copy-On-Write)
            state.grid = { ...state.grid, [key]: { ...hex, progress: hex.progress + 1 } };
            return true;
        }
    }

    // === BRANCH 2: UPGRADE ACTION (Timed) ===

    const neighbors = index.getValidNeighbors(entity.q, entity.r).map(h => ({ q: h.q, r: h.r }));
    const occupied = index.getOccupiedHexesList();
    
    const condition = checkGrowthCondition(hex, entity, neighbors, state.grid, occupied, queueSize);
    
    // Validation Failed
    if (!condition.canGrow) {
      if (hasUpgradeCmd) entity.movementQueue.shift(); 
      entity.state = EntityState.IDLE;
      
      // Notify player
      if (entity.type === EntityType.PLAYER) {
         const msg = condition.reason || "Growth Conditions Not Met";
         state.messageLog.unshift({
             id: `denied-${Date.now()}`,
             text: `Growth Failed: ${msg}`,
             type: 'WARN',
             source: 'SYSTEM',
             timestamp: Date.now()
         });
         
         events.push(GameEventFactory.create('ACTION_DENIED', msg, entity.id));
         state.isPlayerGrowing = false; 
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
        
        // DEDUCT UPGRADE COST
        entity.coins -= config.cost;

        if (targetLevel === 1) {
             // ACQUISITION
             newOwnerId = entity.id;
             
             // Cycle Management
             const q = [...entity.recentUpgrades, hex.id];
             if (q.length > queueSize) q.shift(); 
             entity.recentUpgrades = q;
             
             const msg = `${prefix} Sector L1 Acquired (Cost: ${config.cost})`;
             state.messageLog.unshift({
                id: `acq-${Date.now()}-${entity.id}`,
                text: msg,
                type: 'SUCCESS',
                source: entity.id,
                timestamp: Date.now()
             });
             
             events.push(GameEventFactory.create('SECTOR_ACQUIRED', msg, entity.id));
        } else {
             // LEVEL UP
             const msg = `${prefix} Reached Rank L${targetLevel} (Cost: ${config.cost})`;
             
             state.messageLog.unshift({
                id: `lvl-${Date.now()}-${entity.id}`,
                text: msg,
                type: 'SUCCESS',
                source: entity.id,
                timestamp: Date.now()
             });

             events.push(GameEventFactory.create('LEVEL_UP', msg, entity.id));

             // CONSUME CYCLE POINTS
             entity.recentUpgrades = [];
        }
      }

      // Rewards
      entity.coins += config.income;
      entity.totalCoinsEarned += config.income;
      entity.moves += 1;
      
      // Update Hex (Copy-On-Write)
      state.grid = { 
          ...state.grid, 
          [key]: { 
              ...hex, 
              currentLevel: targetLevel, 
              maxLevel: newMaxLevel, 
              progress: 0,
              ownerId: newOwnerId
          }
      };
      
      let shouldContinue = targetLevel < newMaxLevel;
      
      if (!shouldContinue && effectiveIntent === 'UPGRADE' && !didMaxIncrease) {
          const nextCheck = checkGrowthCondition(
             state.grid[key],
             entity, neighbors, state.grid, occupied, queueSize
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
      // Tick Progress (Copy-On-Write)
      state.grid = { ...state.grid, [key]: { ...hex, progress: hex.progress + 1 } };
      return true;
    }
  }
}
