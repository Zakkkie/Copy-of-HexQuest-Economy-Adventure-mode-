
import { Hex, Entity, HexCoord } from '../types';
import { getHexKey, getNeighbors, cubeDistance } from '../services/hexUtils';

/**
 * WorldIndex optimizes queries that otherwise require iterating over the entire grid.
 * It is reconstructed or updated when the game state changes significantly.
 */
export class WorldIndex {
  private grid: Record<string, Hex>;
  private entities: Map<string, Entity> = new Map(); // ID -> Entity
  
  // Indices
  private occupiedHexes: Map<string, string> = new Map(); // HexKey -> EntityID
  private structureLocations: Map<string, string[]> = new Map(); // Type -> HexIDs[]
  private hexesByOwner: Map<string, Set<string>> = new Map(); // OwnerID -> Set<HexIDs>
  
  constructor(grid: Record<string, Hex>, entities: Entity[]) {
    this.grid = grid;
    this.initEntities(entities);
    this.build();
  }

  // --- Synchronization ---

  /**
   * CRITICAL: Updates internal references to match the current simulation state.
   * Call this immediately after cloning state in GameEngine to prevent
   * systems from reading stale entity data (coins, moves, state) via the index.
   */
  public syncState(state: { grid: Record<string, Hex>; player: Entity; bots: Entity[] }) {
      this.grid = state.grid;
      
      // Update Entity Map with NEW object references
      this.entities.clear();
      const allEntities = [state.player, ...state.bots];
      for (const e of allEntities) {
          this.entities.set(e.id, e);
      }
      
      // Note: We do NOT need to rebuild occupiedHexes here if this is called 
      // at the start of a tick/action, because positions (q,r) haven't changed 
      // relative to the index's knowledge yet. MovementSystem handles spatial updates.
      // However, we MUST rebuild if the grid structure changed drastically (rare).
  }

  public syncGrid(grid: Record<string, Hex>) {
      this.grid = grid;
  }

  private initEntities(entities: Entity[]) {
      this.entities.clear();
      entities.forEach(e => this.entities.set(e.id, e));
  }

  // Full Rebuild (Fallback)
  public rebuild(grid: Record<string, Hex>, entities: Entity[]) {
      this.grid = grid;
      this.initEntities(entities);
      this.build();
  }

  private build() {
    this.occupiedHexes.clear();
    this.structureLocations.clear();
    this.hexesByOwner.clear();

    // 1. Index Entities
    for (const ent of this.entities.values()) {
      this.occupiedHexes.set(getHexKey(ent.q, ent.r), ent.id);
    }
    
    // 2. Index Hexes
    for (const id in this.grid) {
      const hex = this.grid[id];
      this.indexHex(hex);
    }
  }

  private indexHex(hex: Hex) {
      // Structures
      if (hex.structureType && hex.structureType !== 'NONE') {
        const list = this.structureLocations.get(hex.structureType) || [];
        list.push(hex.id);
        this.structureLocations.set(hex.structureType, list);
      }

      // Ownership (inferred or explicit)
      if (hex.ownerId) {
          if (!this.hexesByOwner.has(hex.ownerId)) {
              this.hexesByOwner.set(hex.ownerId, new Set());
          }
          this.hexesByOwner.get(hex.ownerId)?.add(hex.id);
      }
  }

  // --- Incremental Updates ---

  public updateEntityPosition(entityId: string, oldQ: number, oldR: number, newQ: number, newR: number) {
      const oldKey = getHexKey(oldQ, oldR);
      const newKey = getHexKey(newQ, newR);

      // Validate sync
      if (this.occupiedHexes.get(oldKey) === entityId) {
          this.occupiedHexes.delete(oldKey);
      }
      this.occupiedHexes.set(newKey, entityId);
      
      // Update the reference object itself to be safe, though MovementSystem usually does this too.
      const ent = this.entities.get(entityId);
      if (ent) {
          ent.q = newQ;
          ent.r = newR;
      }
  }

  // --- Queries ---

  public isOccupied(q: number, r: number): boolean {
    return this.occupiedHexes.has(getHexKey(q, r));
  }
  
  public getEntityAt(q: number, r: number): Entity | undefined {
      const id = this.occupiedHexes.get(getHexKey(q, r));
      return id ? this.entities.get(id) : undefined;
  }

  public getOccupiedHexesList(): HexCoord[] {
    const coords: HexCoord[] = [];
    for (const ent of this.entities.values()) {
        coords.push({ q: ent.q, r: ent.r });
    }
    return coords;
  }

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
   * Optimized Range Query using BFS
   * Replaces iterating over the entire grid for AI operations.
   */
  public getHexesInRange(center: HexCoord, range: number): Hex[] {
      const results: Hex[] = [];
      const visited = new Set<string>();
      const queue: { q: number, r: number, dist: number }[] = [{ q: center.q, r: center.r, dist: 0 }];
      const startKey = getHexKey(center.q, center.r);
      visited.add(startKey);

      // Include center if it exists
      if (this.grid[startKey]) results.push(this.grid[startKey]);

      let head = 0;
      while(head < queue.length) {
          const { q, r, dist } = queue[head++];
          if (dist >= range) continue;

          const neighbors = getNeighbors(q, r);
          for (const n of neighbors) {
              const key = getHexKey(n.q, n.r);
              if (!visited.has(key)) {
                  visited.add(key);
                  const hex = this.grid[key];
                  if (hex) {
                      results.push(hex);
                      queue.push({ q: n.q, r: n.r, dist: dist + 1 });
                  }
              }
          }
      }
      return results;
  }
}
