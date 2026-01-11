
import { Entity, Hex, HexCoord, WinCondition, BotAction, BotGoal } from '../types';
import { GAME_CONFIG, getLevelConfig } from './config';
import { getHexKey, cubeDistance, findPath, getNeighbors } from '../services/hexUtils';
import { checkGrowthCondition } from './growth';
import { WorldIndex } from './WorldIndex';

const WEIGHTS = {
  DISTANCE: 2.0,
  INCOME: 1.5,
  EXPANSION: 2.0,
  RANK_UP: 5.0
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
  index: WorldIndex
): AiResult => {
  
  const currentHexKey = getHexKey(bot.q, bot.r);
  const currentHex = grid[currentHexKey];
  const neighbors = getNeighbors(bot.q, bot.r);
  
  // Remove self from obstacles for logic checks (pathfinding usually handles start node, but safe to filter)
  const otherUnitObstacles = obstacles.filter(o => o.q !== bot.q || o.r !== bot.r);
  
  let reason = "IDLE";

  // 1. Persistence / Immediate Opportunity
  if (currentHex && currentHex.progress > 0) {
     const check = checkGrowthCondition(currentHex, bot, neighbors, grid, otherUnitObstacles);
     if (check.canGrow) {
        return { 
            action: { type: 'UPGRADE', coord: { q: bot.q, r: bot.r } },
            debug: `Finishing Job @ ${currentHex.maxLevel}`
        };
     } else {
        reason = `Cannot Finish: ${check.reason}`;
     }
  }
  
  // 2. Resource Calculation
  const totalMovePower = bot.moves + Math.floor(bot.coins / GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE);
  const searchRadius = Math.min(totalMovePower, 6); 

  let bestScore = -Infinity;
  let bestTarget: Hex | null = null;
  let evaluated = 0;
  
  // 3. Scan Candidates
  // OPTIMIZATION: Only scan hexes in `grid` for now.
  for (const key in grid) {
     const hex = grid[key];
     
     // Skip if occupied by another unit
     if (index.isOccupied(hex.q, hex.r) && key !== currentHexKey) continue;

     const dist = cubeDistance(bot, {q: hex.q, r: hex.r});
     if (dist > searchRadius) continue;
     
     evaluated++;

     // --- SCORING ---
     let score = 0;

     // A. Distance Penalty
     score -= (dist * WEIGHTS.DISTANCE);

     // B. Growth Analysis
     const targetNeighbors = getNeighbors(hex.q, hex.r);
     const growCheck = checkGrowthCondition(hex, bot, targetNeighbors, grid, otherUnitObstacles);

     if (growCheck.canGrow) {
         const targetLevel = hex.currentLevel + 1;
         const cfg = getLevelConfig(targetLevel);
         let incomeScore = cfg.income * WEIGHTS.INCOME;
         if (cfg.growthTime > 0) incomeScore = incomeScore / (cfg.growthTime / 5);
         score += incomeScore;

         if (winCondition?.type === 'WEALTH') score += incomeScore * 2; 
         else if (winCondition?.type === 'DOMINATION') {
             if (targetLevel > hex.maxLevel) {
                 score += 50; 
                 if (targetLevel > bot.playerLevel) score += 100 * WEIGHTS.RANK_UP;
             }
             score += (targetLevel * 10);
         } else {
             if (targetLevel > bot.playerLevel && targetLevel > hex.maxLevel) score += 50;
         }

     } else {
         if (hex.maxLevel === 0) score += 10 * WEIGHTS.EXPANSION;
         else score -= 20;
     }

     if (score > bestScore) {
         bestScore = score;
         bestTarget = hex;
     }
  }

  // 4. Decision Execution
  if (bestTarget) {
      if (bestTarget.id === currentHexKey) {
           const check = checkGrowthCondition(bestTarget, bot, neighbors, grid, otherUnitObstacles);
           if (check.canGrow) {
                return { 
                    action: { type: 'UPGRADE', coord: { q: bot.q, r: bot.r } },
                    debug: `Upgrading Here to L${bestTarget.currentLevel + 1}`
                };
           } else {
               return { action: null, debug: `Wanted Upgrade, Denied: ${check.reason}` };
           }
      } 
      else {
          const path = findPath({q: bot.q, r: bot.r}, {q: bestTarget.q, r: bestTarget.r}, grid, bot.playerLevel, otherUnitObstacles);
          
          if (path && path.length > 0) {
              let requiredMoves = 0;
              for (const step of path) {
                  const h = grid[getHexKey(step.q, step.r)];
                  requiredMoves += (h && h.maxLevel >= 2) ? h.maxLevel : 1;
              }

              const availableMoveValue = bot.moves + (bot.coins / GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE);
              
              if (availableMoveValue >= requiredMoves) {
                  return { 
                      action: { type: 'MOVE', path },
                      debug: `Moving to ${bestTarget.q},${bestTarget.r} (Score: ${Math.round(bestScore)})`
                  };
              } else {
                  return { action: null, debug: `Path Too Expensive (${requiredMoves} vs ${availableMoveValue})` };
              }
          } else {
               return { action: null, debug: `No Path to Target` };
          }
      }
  }

  return { action: null, debug: `Scanning ${evaluated} hexes. No good target. ${reason}` };
};
