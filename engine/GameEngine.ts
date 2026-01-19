
import { GameState, GameAction, GameEvent, ValidationResult, SessionState, EntityState } from '../types';
import { WorldIndex } from './WorldIndex';
import { System } from './systems/System';
import { MovementSystem } from './systems/MovementSystem';
import { GrowthSystem } from './systems/GrowthSystem';
import { AiSystem } from './systems/AiSystem';
import { VictorySystem } from './systems/VictorySystem';
import { ActionProcessor } from './ActionProcessor';
import { SAFETY_CONFIG } from '../rules/config';

export interface TickResult {
  state: SessionState;
  events: GameEvent[];
}

/**
 * GameEngine - Architecture Refactor
 * Orchestrates Systems and holds the authoritative state for a single game session.
 * Uses an instance of ActionProcessor to handle command validation and application.
 * State is treated as immutable between ticks/actions.
 */
export class GameEngine {
  // Fix: Properties are nullable to handle destruction lifecycle safely without 'as any' hacks.
  private _state: SessionState | null;
  private _index: WorldIndex | null;
  private _systems: System[];
  private _actionProcessor: ActionProcessor | null;

  constructor(initialState: SessionState) {
    // Initial deep copy is acceptable for setup
    this._state = JSON.parse(JSON.stringify(initialState));
    this._state!.stateVersion = this._state!.stateVersion || 0;
    
    this._index = new WorldIndex(this._state!.grid, [this._state!.player, ...this._state!.bots]);
    this._actionProcessor = new ActionProcessor();
    
    this._systems = [
      new GrowthSystem(),
      new AiSystem(this._actionProcessor!),
      new MovementSystem(),
      new VictorySystem()
    ];
  }

  public get state(): SessionState | null {
    return this._state;
  }

  /**
   * Optimized State Cloning
   * Replaces JSON.parse(JSON.stringify) with structural shallow copying.
   * PERFORMANCE FIX: We copy `grid` by REFERENCE. 
   * Systems MUST adhere to Copy-On-Write pattern when modifying grid cells.
   * i.e. state.grid = { ...state.grid, [key]: newHex }
   */
  private cloneState(source: SessionState): SessionState {
    return {
      ...source,
      // 1. Copy Grid by Reference (Instant).
      // If a system needs to change a hex, it must clone the grid container first (COW).
      grid: source.grid, 
      
      // 2. Clone Entities (Player & Bots) - Always fresh objects to track mutations like position/coins
      player: {
        ...source.player,
        movementQueue: [...source.player.movementQueue],
        recentUpgrades: [...source.player.recentUpgrades],
        memory: source.player.memory ? { ...source.player.memory } : undefined
      },
      bots: source.bots.map(b => ({
        ...b,
        movementQueue: [...b.movementQueue],
        recentUpgrades: [...b.recentUpgrades],
        memory: b.memory ? { ...b.memory } : undefined
      })),

      // 3. Clone Arrays
      messageLog: source.messageLog.map(l => ({ ...l })), // Deep clone logs to prevent mutation issues
      botActivityLog: source.botActivityLog.map(l => ({ ...l })),
      growingBotIds: [...source.growingBotIds],
      telemetry: source.telemetry ? [...source.telemetry] : undefined
    };
  }

  /**
   * Sync Player Intent (Growth/Upgrade Mode) from UI
   */
  public setPlayerIntent(isGrowing: boolean, intent: 'RECOVER' | 'UPGRADE' | null) {
      if (!this._state) return;
      const nextState = this.cloneState(this._state);
      nextState.isPlayerGrowing = isGrowing;
      nextState.playerGrowthIntent = intent;
      nextState.stateVersion++;
      this._state = nextState;
  }

  /**
   * External Action Entry Point (UI)
   * Creates a temporary state copy, applies the action, and commits it on success.
   */
  public applyAction(actorId: string, action: GameAction): ValidationResult {
    if (!this._state || !this._index || !this._actionProcessor) return { ok: false, reason: "Engine Destroyed" };

    const nextState = this.cloneState(this._state);
    
    // CRITICAL FIX: Update index to point to NEW entity objects in nextState
    // This ensures that when ActionProcessor checks conditions (like coins), it sees the fresh data.
    this._index.syncState(nextState);

    const result = this._actionProcessor.applyAction(nextState, this._index, actorId, action);
    
    if (result.ok) {
        nextState.stateVersion++;
        this._state = nextState;
    } else {
        // If action failed, we discard nextState. 
        // NOTE: The index currently points to the discarded nextState entities.
        // This is safe because the next time applyAction/processTick is called,
        // we will immediately call syncState() again with a fresh clone of the valid this._state.
    }

    return result;
  }
  
  /**
   * Main Simulation Loop
   * Creates a temporary state copy, runs all systems on it, sanitizes it, and then commits it.
   */
  public processTick(): TickResult {
    if (!this._state || !this._index) return { state: {} as any, events: [] };

    const nextState = this.cloneState(this._state);
    
    // CRITICAL FIX: Update index to point to NEW entity objects in nextState
    // Systems (AiSystem, MovementSystem) will now read/write to the correct object references via Index lookups.
    this._index.syncState(nextState);

    const tickEvents: GameEvent[] = [];

    for (const system of this._systems) {
        system.update(nextState, this._index, tickEvents);
    }

    // MEMORY PROTECTION: Enforce strict limits before committing state
    this.enforceSafetyLimits(nextState);

    nextState.stateVersion++;
    this._state = nextState;

    return {
        state: this._state,
        events: tickEvents
    };
  }

  /**
   * Prevents state bloat by truncating logs and queues.
   * Keeps cloning fast and UI responsive.
   */
  private enforceSafetyLimits(state: SessionState) {
      if (state.messageLog.length > SAFETY_CONFIG.MAX_LOG_SIZE) {
          state.messageLog = state.messageLog.slice(0, SAFETY_CONFIG.MAX_LOG_SIZE);
      }
      if (state.botActivityLog.length > SAFETY_CONFIG.MAX_LOG_SIZE) {
          state.botActivityLog = state.botActivityLog.slice(0, SAFETY_CONFIG.MAX_LOG_SIZE);
      }
      if (state.telemetry && state.telemetry.length > SAFETY_CONFIG.MAX_LOG_SIZE) {
          state.telemetry = state.telemetry.slice(0, SAFETY_CONFIG.MAX_LOG_SIZE);
      }

      // Cap movement queues to prevent infinite walking loops
      const entities = [state.player, ...state.bots];
      for (const ent of entities) {
          if (ent.movementQueue.length > SAFETY_CONFIG.MAX_MOVEMENT_QUEUE) {
              ent.movementQueue = ent.movementQueue.slice(0, SAFETY_CONFIG.MAX_MOVEMENT_QUEUE);
              // If we chopped the queue, force state to idle to prevent ghost movement
              ent.state = EntityState.IDLE; 
          }
      }
  }

  /**
   * Hard Reset / Cleanup
   */
  public destroy() {
    this._systems = [];
    this._index = null;
    this._state = null;
    this._actionProcessor = null;
  }
}
