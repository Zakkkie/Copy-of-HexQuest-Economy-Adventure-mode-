
import { Hex, HexCoord } from '../types';
import { GAME_CONFIG, getLevelConfig } from '../gameEngine/config';

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

export { checkGrowthCondition } from '../gameEngine/growth';

// Pathfinding
export const findPath = (start: HexCoord, end: HexCoord, grid: Record<string, Hex>, rank: number, obstacles: HexCoord[]): HexCoord[] | null => {
  const startKey = getHexKey(start.q, start.r);
  const endKey = getHexKey(end.q, end.r);
  if (startKey === endKey) return null;
  const obsKeys = new Set(obstacles.map(o => getHexKey(o.q, o.r)));
  if (obsKeys.has(endKey)) return null;

  const dists: Record<string, number> = { [startKey]: 0 };
  const prev: Record<string, HexCoord | null> = { [startKey]: null };
  const queue: { k: string, p: number }[] = [{ k: startKey, p: 0 }];

  let iter = 0;
  while (queue.length > 0) {
    if (iter++ > 3000) return null;
    queue.sort((a, b) => a.p - b.p);
    const { k } = queue.shift()!;
    if (k === endKey) {
        const path: HexCoord[] = [];
        let curr: HexCoord | null = end;
        while (curr && getHexKey(curr.q, curr.r) !== startKey) {
            path.unshift(curr);
            curr = prev[getHexKey(curr.q, curr.r)];
        }
        return path;
    }
    const currC = getCoordinatesFromKey(k);
    const currL = grid[k] ? grid[k].maxLevel : 0;
    
    for (const n of getNeighbors(currC.q, currC.r)) {
        const nKey = getHexKey(n.q, n.r);
        if (obsKeys.has(nKey)) continue;
        const hex = grid[nKey];
        if (hex && hex.maxLevel > rank) continue;
        const nextL = hex ? hex.maxLevel : 0;
        if (Math.abs(currL - nextL) > 1) continue;

        const cost = (hex && hex.maxLevel >= 2) ? hex.maxLevel : 1;
        const newD = dists[k] + cost;
        if (!(nKey in dists) || newD < dists[nKey]) {
            dists[nKey] = newD;
            prev[nKey] = currC;
            queue.push({ k: nKey, p: newD });
        }
    }
  }
  return null;
};
