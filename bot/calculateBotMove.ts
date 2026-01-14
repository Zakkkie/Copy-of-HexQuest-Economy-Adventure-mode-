


import { Entity, Hex, HexCoord, WinCondition, BotAction, Difficulty } from '../types';
import { getLevelConfig, GAME_CONFIG, DIFFICULTY_SETTINGS } from '../rules/config';
import { getHexKey, cubeDistance, findPath, getNeighbors } from '../services/hexUtils';
import { checkGrowthCondition } from '../rules/growth';
import { WorldIndex } from '../engine/WorldIndex';

const WEIGHTS = {
  DISTANCE: 2.0,
  INCOME: 1.5,
  EXPANSION: 2.5,
  RANK_UP: 6.0
};

export interface AiResult {
    action: BotAction | null;
    debug: string;
}

export const calculateBotMove = (
  bot: Entity, 
  grid: Record<string, Hex>, 
  player: Entity,
  winCondition: WinCondition | null,
  obstacles: HexCoord[],
  index: WorldIndex,
  stateVersion: number,
  difficulty: Difficulty,
  reservedHexKeys?: Set<string>
): AiResult => {
  
  const currentHexKey = getHexKey(bot.q, bot.r);
  const currentHex = grid[currentHexKey];
  const neighbors = getNeighbors(bot.q, bot.r);
  const otherUnitObstacles = obstacles.filter(o => o.q !== bot.q || o.r !== bot.r);
  
  // Resolve Queue Size
  const queueSize = DIFFICULTY_SETTINGS[difficulty]?.queueSize || 3;

  // 1. Memory Initialization
  if (!bot.memory) {
    bot.memory = { lastPlayerPos: null, currentGoal: null, stuckCounter: 0 };
  }

  // --- CYCLE MANAGEMENT CHECK ---
  // If we are low on cycle upgrades (L1 sectors), force EXPAND to prevent lock
  const cycleHealth = bot.recentUpgrades.length;
  const needsCycle = cycleHealth < queueSize;

  // --- DEADLOCK RESOLUTION ---
  if (bot.memory.lastActionFailed) {
      if (bot.memory.currentGoal?.type === 'GROWTH') {
           // If growth failed, switch to PREPARE_CYCLE to flush the queue
           bot.memory.currentGoal = {
               type: 'PREPARE_CYCLE',
               priority: 5,
               expiresAt: Date.now() + 10000
           };
      } else {
          bot.memory.currentGoal = null;
      }
  }

  // --- 1. IMMEDIATE ACTION (If safe) ---
  // If standing on a hex that can be upgraded AND we are not in a failed state for it
  if (currentHex && currentHex.progress > 0 && !bot.memory.lastActionFailed) {
     const check = checkGrowthCondition(currentHex, bot, neighbors, grid, otherUnitObstacles, queueSize);
     if (check.canGrow) {
        return { 
            action: { type: 'UPGRADE', coord: { q: bot.q, r: bot.r }, stateVersion },
            debug: `Finishing Job @ ${currentHex.maxLevel}`
        };
     }
  }

  // --- 2. GOAL MANAGEMENT ---
  let goal = bot.memory.currentGoal;
  const now = Date.now();
  
  if (goal) {
     if (now > goal.expiresAt) goal = null;
     else if (goal.targetHexId) {
         const hex = grid[goal.targetHexId];
         // Re-validate goal validity
         if (!hex) goal = null;
         else if (goal.type === 'GROWTH' && hex.maxLevel > bot.playerLevel) goal = null;
         else if (goal.type === 'EXPAND' && index.isOccupied(hex.q, hex.r)) goal = null;
         else if (goal.targetHexId === currentHexKey && goal.type === 'EXPAND') goal = null; 
     }
  }

  // --- 3. GOAL SELECTION (If needed) ---
  if (!goal) {
     // Performance Fix: Limit candidate pool via Index
     const searchRange = bot.memory.lastActionFailed ? 5 : 12; 
     const candidates = index.getHexesInRange({q: bot.q, r: bot.r}, searchRange).filter(h => {
        // Basic filtering
        if (index.isOccupied(h.q, h.r) && h.id !== currentHexKey) return false;
        
        // Check Reserved (from other bots in same tick)
        if (reservedHexKeys && reservedHexKeys.has(h.id) && h.id !== currentHexKey) return false;

        // Strategy filtering
        if (needsCycle || bot.memory?.currentGoal?.type === 'PREPARE_CYCLE') {
            return h.maxLevel <= 1; // Prioritize easy/empty sectors
        }
        
        return true;
     });

     let bestCandidate: Hex | null = null;
     let bestScore = -Infinity;

     // Utility Scoring
     for (const h of candidates) {
        let score = 0;
        const d = cubeDistance(bot, h);
        
        // Heuristic Scoring
        score -= d * WEIGHTS.DISTANCE;

        // Jitter to break symmetry
        score += Math.random() * 2.0; 

        const targetNeighbors = getNeighbors(h.q, h.r);
        const growCheck = checkGrowthCondition(h, bot, targetNeighbors, grid, otherUnitObstacles, queueSize);

        if (growCheck.canGrow) {
           const targetLevel = h.currentLevel + 1;
           const cfg = getLevelConfig(targetLevel);
           
           score += (cfg.income * WEIGHTS.INCOME);
           
           if (targetLevel > h.maxLevel) score += 20 * WEIGHTS.EXPANSION;
           
           if (targetLevel > bot.playerLevel && targetLevel > h.maxLevel) score += 100 * WEIGHTS.RANK_UP;
           
           // Critical: If we need cycle points, massive bonus for L1
           if (needsCycle && targetLevel === 1) {
               score += 500; 
           }

        } else {
           score -= 1000; // Unusable hex
        }

        if (score > bestScore) {
           bestScore = score;
           bestCandidate = h;
        }
     }

     if (bestCandidate && bestScore > -500) {
        bot.memory.currentGoal = {
           type: bestCandidate.maxLevel === 0 ? 'EXPAND' : 'GROWTH',
           targetHexId: bestCandidate.id,
           targetQ: bestCandidate.q,
           targetR: bestCandidate.r,
           priority: 1,
           expiresAt: now + 15000 
        };
        goal = bot.memory.currentGoal;
     }
  }

  // --- 4. EXECUTION ---
  if (goal && goal.targetHexId) {
      const target = grid[goal.targetHexId];
      if (!target) return { action: { type: 'WAIT', stateVersion }, debug: 'Target Vanished' };

      // A. If at target
      if (target.id === currentHexKey) {
           const check = checkGrowthCondition(target, bot, neighbors, grid, otherUnitObstacles, queueSize);
           if (check.canGrow) {
                return { 
                    action: { type: 'UPGRADE', coord: { q: bot.q, r: bot.r }, stateVersion },
                    debug: `Executing ${goal.type} @ L${target.currentLevel}`
                };
           } else {
               // Goal stalled
               bot.memory.currentGoal = null;
               bot.memory.lastActionFailed = true; 
               return { action: { type: 'WAIT', stateVersion }, debug: `Goal Stalled: ${check.reason}` };
           }
      }

      // B. Move towards target
      const path = findPath({q: bot.q, r: bot.r}, {q: target.q, r: target.r}, grid, bot.playerLevel, otherUnitObstacles);
      if (path && path.length > 0) {
          let requiredMoves = 0;
          for (const step of path) {
              const h = grid[getHexKey(step.q, step.r)];
              requiredMoves += (h && h.maxLevel >= 2) ? h.maxLevel : 1;
          }
          const available = bot.moves + (bot.coins / GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE);
          
          if (available >= requiredMoves) {
              return { 
                  action: { type: 'MOVE', path, stateVersion }, 
                  debug: `Moving to ${goal.type} (${target.q},${target.r})` 
              };
          } else {
              return { action: { type: 'WAIT', stateVersion }, debug: 'Saving resources' };
          }
      } else {
          bot.memory.currentGoal = null;
          return { action: { type: 'WAIT', stateVersion }, debug: 'Path blocked' };
      }
  }

  // Fallback: Random Walk
  if (!goal) {
       const randomNeighbors = neighbors.filter(n => !index.isOccupied(n.q, n.r));
       if (randomNeighbors.length > 0) {
           const rnd = randomNeighbors[Math.floor(Math.random() * randomNeighbors.length)];
           if (bot.moves > 5) {
                return { action: { type: 'MOVE', path: [rnd], stateVersion }, debug: 'Wandering' };
           }
       }
  }

  return { action: { type: 'WAIT', stateVersion }, debug: 'Idle' };
};