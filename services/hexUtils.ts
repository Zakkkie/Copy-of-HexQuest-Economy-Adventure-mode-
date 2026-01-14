

import { Hex, HexCoord } from '../types';
import { GAME_CONFIG, getLevelConfig, SAFETY_CONFIG } from '../rules/config';

export const getHexKey = (q: number, r: number): string => `${q},${r}`;
export const getCoordinatesFromKey = (key: string): HexCoord => {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
};

export const hexToPixel = (q: number, r: number, rotationDegrees: number = 0): { x: number, y: number } => {
  const rawX = GAME_CONFIG.HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
  const rawY = GAME_CONFIG.HEX_SIZE * (3 / 2 * r);
  const angleRad = (rotationDegrees * Math.PI) / 180;
  return { 
    x: rawX * Math.cos(angleRad) - rawY * Math.sin(angleRad), 
    y: (rawX * Math.sin(angleRad) + rawY * Math.cos(angleRad)) * 0.8 
  };
};

export const cubeDistance = (a: HexCoord, b: HexCoord): number => {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
};

export const getNeighbors = (q: number, r: number): HexCoord[] => {
  const directions = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
  return directions.map(d => ({ q: q + d.q, r: r + d.r }));
};

export const calculateReward = (level: number) => {
    const cfg = getLevelConfig(level);
    return { coins: cfg.income, moves: 1 };
};

export const getSecondsToGrow = (level: number) => getLevelConfig(level).growthTime;

export { checkGrowthCondition } from '../rules/growth';

// A* Pathfinding (Optimized & Protected)
export const findPath = (start: HexCoord, end: HexCoord, grid: Record<string, Hex>, rank: number, obstacles: HexCoord[]): HexCoord[] | null => {
  const startKey = getHexKey(start.q, start.r);
  const endKey = getHexKey(end.q, end.r);
  if (startKey === endKey) return [];
  
  // Quick pre-check for distance to avoid running A* on impossible long paths
  if (cubeDistance(start, end) > SAFETY_CONFIG.MAX_PATH_LENGTH) return null;

  // O(1) Lookup
  const obsKeys = new Set(obstacles.map(o => getHexKey(o.q, o.r)));
  if (obsKeys.has(endKey)) return null;

  // G-Score: Cost from start
  const gScore = new Map<string, number>();
  gScore.set(startKey, 0);

  // F-Score: Cost from start + Heuristic to end
  const fScore = new Map<string, number>();
  fScore.set(startKey, cubeDistance(start, end));

  const prev: Record<string, HexCoord | null> = { [startKey]: null };
  // openSet is used as a Priority Queue
  const openSet: { k: string, f: number }[] = [{ k: startKey, f: fScore.get(startKey)! }];
  const closedSet = new Set<string>();

  let iter = 0;
  while (openSet.length > 0) {
    // Safety guard: Processor Protection
    if (iter++ > SAFETY_CONFIG.MAX_SEARCH_ITERATIONS) return null; 
    
    // --- PERFORMANCE OPTIMIZATION ---
    // Linear scan O(n) for lowest F is faster than sorting for small sets
    let lowestIndex = 0;
    for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
            lowestIndex = i;
        }
    }
    const current = openSet.splice(lowestIndex, 1)[0];
    const currentKey = current.k;
    
    // Safety guard: Max path length during exploration
    if ((gScore.get(currentKey) || 0) > SAFETY_CONFIG.MAX_PATH_LENGTH) continue;

    if (currentKey === endKey) {
        // Reconstruct Path by backtracking
        const path: HexCoord[] = [];
        let curr: HexCoord | null = end;
        while (curr && getHexKey(curr.q, curr.r) !== startKey) {
            path.unshift(curr);
            const pKey = getHexKey(curr.q, curr.r);
            curr = prev[pKey];
        }
        return path;
    }

    closedSet.add(currentKey);
    const currC = getCoordinatesFromKey(currentKey);
    const currHex = grid[currentKey];
    const currL = currHex ? currHex.maxLevel : 0;

    for (const n of getNeighbors(currC.q, currC.r)) {
        const nKey = getHexKey(n.q, n.r);
        if (closedSet.has(nKey)) continue;
        if (obsKeys.has(nKey)) continue;

        const neighborHex = grid[nKey];
        
        // Rules Check
        if (neighborHex && neighborHex.maxLevel > rank) continue; // Rank limit
        const nextL = neighborHex ? neighborHex.maxLevel : 0;
        if (Math.abs(currL - nextL) > 1) continue; // Height limit (Jump 1)

        // Cost Calculation
        // Base cost 1, rough terrain (L2+) costs more (Game Rule)
        const moveCost = (neighborHex && neighborHex.maxLevel >= 2) ? neighborHex.maxLevel : 1;
        const tentativeG = gScore.get(currentKey)! + moveCost;

        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
            prev[nKey] = currC;
            gScore.set(nKey, tentativeG);
            const f = tentativeG + cubeDistance(n, end); // Heuristic
            fScore.set(nKey, f);
            
            if (!openSet.some(x => x.k === nKey)) {
                openSet.push({ k: nKey, f });
            } else {
                // Update priority
                const item = openSet.find(x => x.k === nKey);
                if (item) item.f = f;
            }
        }
    }
  }
  // No path was found
  return null;
};