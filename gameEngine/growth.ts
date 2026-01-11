
import { Hex, Entity, HexCoord } from '../types';
import { UPGRADE_LOCK_QUEUE_SIZE } from '../constants';

export type GrowthCheckResult = {
  canGrow: boolean;
  reason?: string;
};

/**
 * Isolated Growth Logic
 * Evaluates if a specific entity can upgrade a specific hex.
 */
export function checkGrowthCondition(
  hex: Hex | null, 
  entity: Entity,
  neighbors: HexCoord[],
  grid: Record<string, Hex>,
  occupiedHexes: HexCoord[] = []
): GrowthCheckResult {
  if (!hex) return { canGrow: false, reason: 'Invalid Hex' };

  const targetLevel = Number(hex.currentLevel) + 1;

  // 1. Cap Check (can't go beyond 99 for now)
  if (hex.maxLevel >= 99) {
    return { canGrow: false, reason: 'MAX LEVEL' };
  }

  // If we are recovering (current < max), it's generally allowed unless structure prevents it
  if (targetLevel <= hex.maxLevel) {
     return { canGrow: true };
  }

  // --- NEW LEVEL (UPGRADE) CHECKS ---

  // 2. Cycle Lock
  if (entity.recentUpgrades.length < UPGRADE_LOCK_QUEUE_SIZE && targetLevel > 1) {
    return { 
      canGrow: false, 
      reason: `CYCLE INCOMPLETE (${entity.recentUpgrades.length}/${UPGRADE_LOCK_QUEUE_SIZE})` 
    };
  }

  // 3. Global Rank Limit
  if (entity.playerLevel < targetLevel - 1) {
    return { 
      canGrow: false, 
      reason: `RANK TOO LOW (NEED L${targetLevel - 1})` 
    };
  }

  // 4. Support Structure (Staircase Rule)
  // L2+ requires support from L(current) neighbors.
  if (targetLevel > 1) {
    const supports = neighbors.filter(n => {
       const neighborHex = grid[`${n.q},${n.r}`];
       // Strict Equality: Neighbors must be exactly the same maxLevel as current hex to support climb.
       // Higher level neighbors do NOT count (User Feedback: "Works only with hexes of one level, not more").
       return neighborHex && neighborHex.maxLevel === hex.maxLevel;
    });

    if (supports.length < 2) {
      return {
        canGrow: false,
        reason: `NEED 2 SUPPORTS (EXACTLY L${hex.maxLevel})`
      };
    }

    // Occupancy Check: Max 1 support can be occupied by units
    const occupiedSupportCount = supports.filter(s => 
        occupiedHexes.some(o => o.q === s.q && o.r === s.r)
    ).length;

    if (occupiedSupportCount > 1) {
        return {
            canGrow: false,
            reason: "SUPPORTS BLOCKED"
        };
    }
  }

  return { canGrow: true };
}

export default checkGrowthCondition;
