
import { Entity, Hex, HexCoord, WinCondition, BotAction, Difficulty, BotMemory } from '../types';
import { getLevelConfig, GAME_CONFIG, DIFFICULTY_SETTINGS } from '../rules/config';
import { getHexKey, cubeDistance, findPath, getNeighbors } from '../services/hexUtils';
import { checkGrowthCondition } from '../rules/growth';
import { WorldIndex } from '../engine/WorldIndex';

export interface AiResult {
    action: BotAction | null;
    debug: string;
    memory: BotMemory;
}

// PERFORMANCE CONFIGURATION
// Radius 25 = ~2000 hexes. Radius 12 = ~470 hexes.
// Reducing this drastically lowers CPU usage per bot tick.
const SCAN_RADIUS = 12; 
const CONTEXT_RADIUS = 15;

/**
 * AI V12: "The Survivor"
 * 
 * Improvements:
 * - Anti-Stuck Mechanism: Detects repeated failures/waits and forces a random move (or suicide attack) to break loops.
 * - Self-Aware Idleness: Increments stuckCounter internally when deciding to WAIT due to lack of options.
 * - Optimized Scanning: Reduced search radius for better mobile performance.
 */
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
  const queueSize = DIFFICULTY_SETTINGS[difficulty]?.queueSize || 3;
  const otherUnitObstacles = obstacles.filter(o => o.q !== bot.q || o.r !== bot.r);
  
  // Clone memory
  const nextMemory: BotMemory = bot.memory ? { ...bot.memory } : {
      lastPlayerPos: null,
      currentGoal: null,
      masterGoalId: null,
      stuckCounter: 0
  };

  // === 0. PANIC MODE (Anti-Stuck) ===
  // If we have failed or waited 3 times in a row, force a move to break the loop.
  if (nextMemory.stuckCounter >= 3) {
      const neighbors = getNeighbors(bot.q, bot.r);
      
      // Find valid escape routes (exists, rank ok, not blocked)
      const escapeRoutes = neighbors.filter(n => {
          const k = getHexKey(n.q, n.r);
          const h = grid[k];
          if (!h) return false;
          if (h.maxLevel > bot.playerLevel) return false;
          if (otherUnitObstacles.some(o => o.q === n.q && o.r === n.r)) return false;
          return true;
      });

      if (escapeRoutes.length > 0) {
          // Priority: Attack Player if adjacent (Suicide Run)
          const attackMove = escapeRoutes.find(n => n.q === player.q && n.r === player.r);
          const target = attackMove || escapeRoutes[Math.floor(Math.random() * escapeRoutes.length)];
          
          // CRITICAL FIX: Affordability Check
          // Calculate cost before attempting move to avoid infinite error loops in Engine
          const targetHex = grid[getHexKey(target.q, target.r)];
          const moveCost = (targetHex && targetHex.maxLevel >= 2) ? targetHex.maxLevel : 1;
          const maxPossibleMoves = bot.moves + Math.floor(bot.coins / GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE);

          if (maxPossibleMoves < moveCost) {
             // We are trapped and broke. Just wait and reset counter to stop spamming.
             return { 
                 action: { type: 'WAIT', stateVersion }, 
                 debug: 'PANIC: BROKE', 
                 memory: { ...nextMemory, stuckCounter: 0 } 
             };
          }

          return {
              action: { type: 'MOVE', path: [target], stateVersion },
              debug: attackMove ? 'PANIC: ATTACK!' : 'PANIC: WANDER',
              memory: { ...nextMemory, stuckCounter: 0, masterGoalId: null }
          };
      }
      // If we are completely trapped and stuck, we just have to wait, but reset counter to avoid infinite processing overhead
      return { 
          action: { type: 'WAIT', stateVersion }, 
          debug: 'PANIC: TRAPPED', 
          memory: { ...nextMemory, stuckCounter: 0 } 
      };
  }

  // --- Helpers ---

  const calculatePathCost = (path: HexCoord[]) => {
      let moves = 0;
      for (const p of path) {
           const h = grid[getHexKey(p.q, p.r)];
           const cost = (h && h.maxLevel >= 2) ? h.maxLevel : 1;
           moves += cost;
      }
      const deficit = Math.max(0, moves - bot.moves);
      const coins = deficit * GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;
      return { moves, coins };
  };

  const getRecoveryFallback = (reason: string): AiResult => {
       // 1. If we are on an owned hex that needs recovery, do it.
       const curHex = grid[currentHexKey];
       if (curHex && curHex.ownerId === bot.id && !bot.recoveredCurrentHex) {
            return {
                action: { type: 'UPGRADE', coord: {q:bot.q, r:bot.r}, intent: 'RECOVER', stateVersion },
                debug: `Recovering Here (${reason})`,
                memory: { ...nextMemory, stuckCounter: 0 }
            };
       }

       // 2. Find nearest farmable hex
       const candidates = index.getHexesInRange({q:bot.q, r:bot.r}, CONTEXT_RADIUS)
          .filter(h => h.ownerId === bot.id && (h.id !== currentHexKey || !bot.recoveredCurrentHex))
          .filter(h => !reservedHexKeys?.has(h.id));
       
       candidates.sort((a,b) => {
           const distA = cubeDistance(bot, a);
           const distB = cubeDistance(bot, b);
           if (Math.abs(distA - distB) < 2) return b.maxLevel - a.maxLevel;
           return distA - distB;
       });
       
       // FAILURE CASE 1: No farms available
       if (candidates.length === 0) {
           return { 
               action: { type: 'WAIT', stateVersion }, 
               debug: 'Bankrupt (No Farms)', 
               memory: { ...nextMemory, stuckCounter: nextMemory.stuckCounter + 1 } 
           };
       }

       // 3. Try top candidates (Anti-block logic)
       // Iterate through top 3 candidates to find a reachable one.
       // This fixes "Tunnel Vision" where a bot would stare at a blocked best-candidate forever.
       for (const candidate of candidates.slice(0, 3)) {
           const path = findPath(
               {q:bot.q, r:bot.r}, 
               {q:candidate.q, r:candidate.r}, 
               grid, 
               bot.playerLevel, 
               otherUnitObstacles
           );
           
           if (path) {
               const cost = calculatePathCost(path);
               // We only move if we can afford it.
               if (bot.coins >= cost.coins) {
                   return { 
                       action: { type: 'MOVE', path, stateVersion }, 
                       debug: `Moving to Farm (${reason})`, 
                       memory: { ...nextMemory, stuckCounter: 0 } 
                   };
               }
           }
       }
       
       // FAILURE CASE 2: No reachable farms or too poor
       return { 
           action: { type: 'WAIT', stateVersion }, 
           debug: 'Trapped & Broke', 
           memory: { ...nextMemory, stuckCounter: nextMemory.stuckCounter + 1 } 
       };
  };

  // --- Core Evaluation Function ---
  // Returns result if a valid move is found, null if this specific goal path is blocked/invalid
  const evaluateGoal = (candidateMasterHex: Hex): AiResult | null => {
      // 1. Validate Candidate
      if (candidateMasterHex.maxLevel >= 99) return null;
      if (candidateMasterHex.ownerId && candidateMasterHex.ownerId !== bot.id) return null; // We lost it
      
      let targetHex: Hex | null = null;
      let strategy = 'IDLE';

      // 2. Determine Strategy
      if (!candidateMasterHex.ownerId) {
          strategy = 'EXPAND_MASTER';
          targetHex = candidateMasterHex;
      } else {
          const targetLevel = candidateMasterHex.currentLevel + 1;
          
          // Constraints
          const rankOk = bot.playerLevel >= targetLevel - 1;
          const inQueue = bot.recentUpgrades.includes(candidateMasterHex.id);
          const queueFull = bot.recentUpgrades.length >= queueSize;
          
          const cycleOk = targetLevel === 1 || (queueFull && !inQueue);
          
          let supportOk = true;
          if (targetLevel > 1) {
              const neighbors = getNeighbors(candidateMasterHex.q, candidateMasterHex.r);
              const validSupports = neighbors
                 .map(n => grid[getHexKey(n.q, n.r)])
                 .filter(h => h && h.maxLevel === candidateMasterHex.maxLevel);
              if (validSupports.length < 2) supportOk = false;
          }

          if (!rankOk) strategy = 'GRIND_RANK';
          else if (!cycleOk) strategy = 'FARM_CYCLE'; // Need to farm points (L0->L1)
          else if (!supportOk) strategy = 'BUILD_SUPPORT';
          else {
              strategy = 'EXECUTE_MASTER';
              targetHex = candidateMasterHex;
          }
      }

      // 3. Sub-Goal Resolution
      if (strategy === 'GRIND_RANK') {
          const grindCandidates = index.getHexesInRange({q:bot.q, r:bot.r}, CONTEXT_RADIUS)
              .filter(h => h.ownerId === bot.id && h.id !== candidateMasterHex.id && h.maxLevel <= bot.playerLevel)
              .sort((a,b) => b.maxLevel - a.maxLevel);
          if (grindCandidates.length > 0) targetHex = grindCandidates[0];
          else strategy = 'EXPAND_DEFAULT';
      }

      if (strategy === 'FARM_CYCLE' || strategy === 'EXPAND_DEFAULT') {
           const empties = index.getHexesInRange({q:bot.q, r:bot.r}, CONTEXT_RADIUS)
              .filter(h => !h.ownerId && h.maxLevel === 0 && !reservedHexKeys?.has(h.id));
           
           empties.sort((a,b) => {
               const distA = cubeDistance(bot, a);
               const distB = cubeDistance(bot, b);
               if (Math.abs(distA - distB) < 3) {
                   const nA = getNeighbors(a.q, a.r).filter(n => grid[getHexKey(n.q, n.r)]?.ownerId === bot.id).length;
                   const nB = getNeighbors(b.q, b.r).filter(n => grid[getHexKey(n.q, n.r)]?.ownerId === bot.id).length;
                   return nB - nA;
               }
               return distA - distB;
           });
           
           if (empties.length > 0) {
             targetHex = empties[0];
           } else {
             return null; 
           }
      }

      if (strategy === 'BUILD_SUPPORT') {
          const neighbors = getNeighbors(candidateMasterHex.q, candidateMasterHex.r);
          const supportCandidates = neighbors.map(n => grid[getHexKey(n.q, n.r)])
              .filter(h => h && h.maxLevel < candidateMasterHex.maxLevel && !reservedHexKeys?.has(h.id));
          
          supportCandidates.sort((a,b) => {
              const oA = a.ownerId === bot.id ? 1 : 0;
              const oB = b.ownerId === bot.id ? 1 : 0;
              if (oA !== oB) return oB - oA;
              return b.maxLevel - a.maxLevel;
          });

          if (supportCandidates.length > 0) targetHex = supportCandidates[0];
          else return null; // Unsupportable
      }

      if (!targetHex) return null;

      // 4. Execution Check
      if (targetHex.id === currentHexKey) {
          const nextLvl = targetHex.currentLevel + 1;
          const cfg = getLevelConfig(nextLvl);
          
          if (bot.coins < cfg.cost) return null; 
          
          const occupied = index.getOccupiedHexesList();
          const nbs = getNeighbors(bot.q, bot.r);
          const check = checkGrowthCondition(targetHex, bot, nbs, grid, occupied, queueSize);
          
          if (check.canGrow) {
              return {
                  action: { type: 'UPGRADE', coord: {q:bot.q, r:bot.r}, intent: 'UPGRADE', stateVersion },
                  debug: `${strategy} -> L${nextLvl}`,
                  memory: { ...nextMemory, masterGoalId: candidateMasterHex.id, stuckCounter: 0 }
              };
          } else {
               return null;
          }
      }

      // 5. Pathfinding
      const path = findPath({q:bot.q, r:bot.r}, {q:targetHex.q, r:targetHex.r}, grid, bot.playerLevel, otherUnitObstacles);
      if (!path) return null; // Path blocked

      const travel = calculatePathCost(path);
      
      // === COST ANALYSIS ===
      if (bot.coins >= travel.coins) {
          // WEALTHY: Move normally
          return {
              action: { type: 'MOVE', path, stateVersion },
              debug: `Move > ${strategy}`,
              memory: { ...nextMemory, masterGoalId: candidateMasterHex.id, stuckCounter: 0 }
          };
      } else {
          // POOR: Inchworm Strategy
          // A. Priority: Recover on current hex to fund the journey
          const curHex = grid[currentHexKey];
          const canRecoverHere = curHex && curHex.ownerId === bot.id && !bot.recoveredCurrentHex;
          
          if (canRecoverHere) {
               return {
                    action: { type: 'UPGRADE', coord: {q:bot.q, r:bot.r}, intent: 'RECOVER', stateVersion },
                    debug: `Fund Trip > ${strategy}`,
                    memory: { ...nextMemory, masterGoalId: candidateMasterHex.id, stuckCounter: 0 }
               };
          }
          
          // B. If already recovered (or unable), try to move just 1 step closer
          const nextStep = path[0];
          const singleStepPath = [nextStep];
          const stepCost = calculatePathCost(singleStepPath);
          
          if (bot.coins >= stepCost.coins) {
               return {
                   action: { type: 'MOVE', path: singleStepPath, stateVersion },
                   debug: `Creep > ${strategy}`,
                   memory: { ...nextMemory, masterGoalId: candidateMasterHex.id, stuckCounter: 0 }
               };
          }
          
          // C. Stuck: Can't afford full trip, can't recover here, can't even move 1 step.
          // This will fall through to null, eventually hitting getRecoveryFallback which will log the stuck state.
          return null;
      }
  };

  // --- Main Logic ---

  // 1. Try Existing Master Goal
  if (nextMemory.masterGoalId) {
      const existingMaster = grid[nextMemory.masterGoalId];
      if (existingMaster) {
          const result = evaluateGoal(existingMaster);
          if (result) return result;
      }
      nextMemory.masterGoalId = null;
  }

  // 2. Context Analysis for Scoring
  const ownedHexes = index.getHexesInRange({q:bot.q, r:bot.r}, CONTEXT_RADIUS).filter(h => h.ownerId === bot.id);
  const isEarlyGame = ownedHexes.length < 5;
  const distToPlayer = cubeDistance(bot, player);
  const isThreatened = distToPlayer < 8;

  // 3. Generate New Candidates
  const candidates = index.getHexesInRange({q:bot.q, r:bot.r}, SCAN_RADIUS);
  const potentialGoals: { hex: Hex, score: number }[] = [];

  for (const h of candidates) {
      if (h.maxLevel >= 99) continue;
      
      const isBlocked = otherUnitObstacles.some(o => o.q === h.q && o.r === h.r);
      if (isBlocked && h.id !== currentHexKey) continue;

      let score = 100;

      // --- RNG VARIATION ---
      // Fix for bots clustering in the same direction early game.
      if (isEarlyGame) {
          score += (Math.random() - 0.5) * 30;
      }
      
      const dist = cubeDistance(bot, h);
      score -= dist * 4;

      const nextLvl = h.currentLevel + 1;
      const config = getLevelConfig(nextLvl);

      const affordabilty = (bot.coins - config.cost);
      if (affordabilty < 0) score -= 50; 
      else score += Math.min(20, affordabilty / 10);

      const nbs = getNeighbors(h.q, h.r);
      const ownedNeighborCount = nbs.filter(n => grid[getHexKey(n.q, n.r)]?.ownerId === bot.id).length;

      if (h.ownerId === bot.id) {
            score += 20; 
            score += h.maxLevel * 10; 
            if (bot.recentUpgrades.includes(h.id)) score -= 15;
            if (isThreatened && cubeDistance(h, player) < 5) score += 40; 
            if (bot.recentUpgrades.length >= queueSize) score += 20;

      } else if (!h.ownerId) {
            score += ownedNeighborCount * 8; 
            if (isEarlyGame) score += 60; 
            else score -= 5; 
            if (ownedNeighborCount === 0) score -= 15;
            if (isThreatened && cubeDistance(h, player) < 5) score += 20;
            if (bot.recentUpgrades.length < queueSize) score += 50;
      } else {
            continue; 
      }
      potentialGoals.push({ hex: h, score });
  }

  // Sort by Score
  potentialGoals.sort((a,b) => b.score - a.score);

  // 4. Iterate Candidates
  for (let i = 0; i < Math.min(potentialGoals.length, 5); i++) {
      const result = evaluateGoal(potentialGoals[i].hex);
      if (result) return result;
  }

  // 5. Fallback
  return getRecoveryFallback('No Reachable Targets');
};
