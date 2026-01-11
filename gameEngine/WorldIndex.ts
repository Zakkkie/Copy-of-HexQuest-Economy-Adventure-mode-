
import { Hex, Entity, HexCoord } from '../types';
import { getHexKey, getNeighbors, cubeDistance } from '../services/hexUtils';

/**
 * WorldIndex optimizes queries that otherwise require iterating over the entire grid.
 * It is reconstructed or updated when the game state changes significantly.
 */
export class WorldIndex {
  private grid: Record<string, Hex>;
  private entities: Entity[];
  
  // Indices
  private hexesByOwner: Map<string, string[]> = new Map(); // OwnerID -> HexIDs[]
  private occupiedHexes: Map<string, Entity> = new Map(); // HexKey -> Entity
  private structureLocations: Map<string, string[]> = new Map(); // Type -> HexIDs[]
  
  constructor(grid: Record<string, Hex>, entities: Entity[]) {
    this.grid = grid;
    this.entities = entities;
    this.build();
  }

  private build() {
    this.occupiedHexes.clear();
    this.hexesByOwner.clear();
    this.structureLocations.clear();

    // Index Entities
    for (const ent of this.entities) {
      this.occupiedHexes.set(getHexKey(ent.q, ent.r), ent);
    }
    
    // For structures:
    for (const id in this.grid) {
      const hex = this.grid[id];
      if (hex.structureType && hex.structureType !== 'NONE') {
        const list = this.structureLocations.get(hex.structureType) || [];
        list.push(id);
        this.structureLocations.set(hex.structureType, list);
      }
    }
  }

  public isOccupied(q: number, r: number): boolean {
    return this.occupiedHexes.has(getHexKey(q, r));
  }
  
  public getEntityAt(q: number, r: number): Entity | undefined {
      return this.occupiedHexes.get(getHexKey(q, r));
  }

  public getOccupiedHexesList(): HexCoord[] {
    return this.entities.map(e => ({ q: e.q, r: e.r }));
  }

  /**
   * Returns neighbor hexes that exist in the grid.
   */
  public getValidNeighbors(q: number, r: number): Hex[] {
    const neighbors = getNeighbors(q, r);
    const valid: Hex[] = [];
    for (const n of neighbors) {
      const hex = this.grid[getHexKey(n.q, n.r)];
      if (hex) valid.push(hex);
    }
    return valid;
  }

  /**
   * Fast "can I move here" check ignoring cost, just topology/occupancy.
   */
  public isPassable(q: number, r: number, rank: number): boolean {
    const key = getHexKey(q, r);
    if (this.occupiedHexes.has(key)) return false;
    
    const hex = this.grid[key];
    if (!hex) return true; // Empty void is usually passable to Create L0
    
    return hex.maxLevel <= rank;
  }

  public findNearestInterest(start: HexCoord, predicate: (h: Hex) => boolean, maxRange: number = 10): Hex | null {
    // BFS
    const visited = new Set<string>();
    const queue: { coord: HexCoord, dist: number }[] = [{ coord: start, dist: 0 }];
    visited.add(getHexKey(start.q, start.r));

    while(queue.length > 0) {
      const { coord, dist } = queue.shift()!;
      if (dist > maxRange) continue;

      const key = getHexKey(coord.q, coord.r);
      const hex = this.grid[key];
      
      if (hex && predicate(hex)) {
        return hex;
      }

      const neighbors = getNeighbors(coord.q, coord.r);
      for (const n of neighbors) {
        const nKey = getHexKey(n.q, n.r);
        if (!visited.has(nKey)) {
          visited.add(nKey);
          queue.push({ coord: n, dist: dist + 1 });
        }
      }
    }
    return null;
  }
}
