
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

/**
 * Min-Heap Priority Queue implementation for O(log n) retrievals
 */
class PriorityQueue<T> {
  private _heap: { node: T; weight: number }[] = [];

  get length(): number {
    return this._heap.length;
  }

  push(node: T, weight: number): void {
    this._heap.push({ node, weight });
    this._bubbleUp();
  }

  pop(): T | undefined {
    if (this.length === 0) return undefined;
    const top = this._heap[0];
    const bottom = this._heap.pop();
    if (this._heap.length > 0 && bottom) {
      this._heap[0] = bottom;
      this._sinkDown();
    }
    return top.node;
  }

  private _bubbleUp(): void {
    let index = this._heap.length - 1;
    const element = this._heap[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this._heap[parentIndex];
      if (element.weight >= parent.weight) break;
      this._heap[parentIndex] = element;
      this._heap[index] = parent;
      index = parentIndex;
    }
  }

  private _sinkDown(): void {
    let index = 0;
    const length = this._heap.length;
    const element = this._heap[0];
    while (true) {
      const leftChildIdx = 2 * index + 1;
      const rightChildIdx = 2 * index + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIdx < length) {
        leftChild = this._heap[leftChildIdx];
        if (leftChild.weight < element.weight) {
          swap = leftChildIdx;
        }
      }

      if (rightChildIdx < length) {
        rightChild = this._heap[rightChildIdx];
        if (
          (swap === null && rightChild.weight < element.weight) ||
          (swap !== null && leftChild && rightChild.weight < leftChild.weight)
        ) {
          swap = rightChildIdx;
        }
      }

      if (swap === null) break;
      this._heap[index] = this._heap[swap];
      this._heap[swap] = element;
      index = swap;
    }
  }
}

/**
 * Optimized A* Pathfinding using Min-Heap
 */
export const findPath = (
  start: HexCoord, 
  end: HexCoord, 
  grid: Record<string, Hex>, 
  rank: number, 
  obstacles: HexCoord[]
): HexCoord[] | null => {
  const startKey = getHexKey(start.q, start.r);
  const endKey = getHexKey(end.q, end.r);
  
  // 1. Immediate checks
  if (startKey === endKey) return [];
  
  // Quick pre-check distance to avoid searching impossible paths
  if (cubeDistance(start, end) > SAFETY_CONFIG.MAX_PATH_LENGTH) return null;

  // O(1) Obstacle Lookup
  const obsKeys = new Set(obstacles.map(o => getHexKey(o.q, o.r)));
  if (obsKeys.has(endKey)) return null;

  // 2. Setup Data Structures
  const openSet = new PriorityQueue<string>();
  const cameFrom = new Map<string, HexCoord>();
  const gScore = new Map<string, number>();

  // Initialize
  gScore.set(startKey, 0);
  openSet.push(startKey, cubeDistance(start, end));

  let iterations = 0;

  // 3. Main Loop
  while (openSet.length > 0) {
    // Safety Break
    if (iterations++ > SAFETY_CONFIG.MAX_SEARCH_ITERATIONS) return null;

    const currentKey = openSet.pop()!;
    
    // Safety: Path length check during exploration
    if ((gScore.get(currentKey) || 0) > SAFETY_CONFIG.MAX_PATH_LENGTH) continue;

    if (currentKey === endKey) {
      // Reconstruct Path
      const path: HexCoord[] = [];
      let currKey = endKey;
      while (currKey !== startKey) {
        const coords = getCoordinatesFromKey(currKey);
        path.unshift(coords);
        const parent = cameFrom.get(currKey);
        if (!parent) break; // Should not happen if path exists
        currKey = getHexKey(parent.q, parent.r);
      }
      return path;
    }

    const currentCoord = getCoordinatesFromKey(currentKey);
    const currentHex = grid[currentKey];
    const currentLevel = currentHex ? currentHex.maxLevel : 0;
    
    // Evaluate Neighbors
    const neighbors = getNeighbors(currentCoord.q, currentCoord.r);
    
    for (const neighbor of neighbors) {
      const nKey = getHexKey(neighbor.q, neighbor.r);
      
      if (obsKeys.has(nKey)) continue;

      const neighborHex = grid[nKey];
      
      // -- Game Rules --
      // 1. Rank Check: Cannot enter hex higher than player rank
      if (neighborHex && neighborHex.maxLevel > rank) continue; 
      
      // 2. Height/Jump Check: Cannot jump more than 1 level difference
      const nextLevel = neighborHex ? neighborHex.maxLevel : 0;
      if (Math.abs(currentLevel - nextLevel) > 1) continue;

      // -- Cost Calculation --
      // Base cost 1. Rough terrain (L2+) costs more.
      const moveCost = (neighborHex && neighborHex.maxLevel >= 2) ? neighborHex.maxLevel : 1;
      const tentativeG = (gScore.get(currentKey) ?? Infinity) + moveCost;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentCoord);
        gScore.set(nKey, tentativeG);
        
        const fScore = tentativeG + cubeDistance(neighbor, end);
        openSet.push(nKey, fScore);
      }
    }
  }

  // No path found
  return null;
};
