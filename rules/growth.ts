


import { Hex, Entity, HexCoord } from '../types';

export type GrowthCheckResult = {
  canGrow: boolean;
  reason?: string;
};

export function checkGrowthCondition(
  hex: Hex | null, 
  entity: Entity,
  neighbors: HexCoord[],
  grid: Record<string, Hex>,
  occupiedHexes: HexCoord[] = [],
  requiredQueueSize: number = 3
): GrowthCheckResult {
  if (!hex) return { canGrow: false, reason: 'Invalid Hex' };

  const currentLevel = Number(hex.currentLevel || 0);
  const targetLevel = currentLevel + 1;

  if (hex.maxLevel >= 99) {
    return { canGrow: false, reason: 'MAX LEVEL' };
  }

  // RECOVERY RULE: If current level is below max level (damaged/decayed), allow free growth
  if (targetLevel <= hex.maxLevel) {
     return { canGrow: true };
  }

  // CRITICAL: ACQUISITION RULE (Level 0 -> 1)
  // Always allow taking control of a neutral/empty sector if it's not maxed out.
  // This bypasses Cycle Lock and Staircase rules which are for vertical growth.
  if (targetLevel === 1) {
      return { canGrow: true };
  }

  // CYCLE LOCK RULE: Must have gathered enough L1 sectors (momentum) to upgrade to L2+
  // targetLevel > 1 means we are upgrading FROM L1 or higher.
  if (targetLevel > 1) {
    if (entity.recentUpgrades.length < requiredQueueSize) {
      return { 
        canGrow: false, 
        reason: `CYCLE INCOMPLETE (${entity.recentUpgrades.length}/${requiredQueueSize})` 
      };
    }
  }

  // RANK LIMIT RULE
  if (entity.playerLevel < targetLevel - 1) {
    return { 
      canGrow: false, 
      reason: `RANK TOO LOW (NEED L${targetLevel - 1})` 
    };
  }

  // STAIRCASE SUPPORT RULE
  if (targetLevel > 1) {
    const supports = neighbors.filter(n => {
       const neighborHex = grid[`${n.q},${n.r}`];
       // Strict Equality: Neighbors must be exactly the same maxLevel as current hex to support climb.
       return neighborHex && neighborHex.maxLevel === hex.maxLevel;
    });

    if (supports.length < 2) {
      return {
        canGrow: false, 
        reason: `NEED 2 SUPPORTS (EXACTLY L${hex.maxLevel})`
      };
    }

    // Occupancy Check: Max 1 support can be occupied by units
    // Note: The player attempting to grow does NOT count as blocking support because they are on the target hex, not the support hex.
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