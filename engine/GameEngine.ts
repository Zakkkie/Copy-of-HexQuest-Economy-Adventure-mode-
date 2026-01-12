

import { GameState, GameAction, GameEvent, ValidationResult, SessionState } from '../types';
import { WorldIndex } from './WorldIndex';
import { System } from './systems/System';
import { MovementSystem } from './systems/MovementSystem';
import { GrowthSystem } from './systems/GrowthSystem';
import { AiSystem } from './systems/AiSystem';
import { VictorySystem } from './systems/VictorySystem';
import { ActionProcessor } from './ActionProcessor';

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
  private _state: SessionState;
  private _index: WorldIndex;
  private _systems: System[];
  private _actionProcessor: ActionProcessor;

  constructor(initialState: SessionState) {
    this._state = JSON.parse(JSON.stringify(initialState));
    this._state.stateVersion = this._state.stateVersion || 0;
    
    this._index = new WorldIndex(this._state.grid, [this._state.player, ...this._state.bots]);
    this._actionProcessor = new ActionProcessor();
    
    this._systems = [
      new GrowthSystem(),
      new AiSystem(this._actionProcessor),
      new MovementSystem(),
      new VictorySystem()
    ];
  }

  public get state(): SessionState {
    return this._state;
  }

  /**
   * Sync Player Intent (Growth/Upgrade Mode) from UI
   */
  public setPlayerIntent(isGrowing: boolean, intent: 'RECOVER' | 'UPGRADE' | null) {
      if (!this._state) return;
      // This is a direct, simple state change not requiring full transactional logic
      this._state.isPlayerGrowing = isGrowing;
      this._state.playerGrowthIntent = intent;
      this._state.stateVersion++;
  }

  /**
   * External Action Entry Point (UI)
   * Creates a temporary state copy, applies the action, and commits it on success.
   */
  public applyAction(actorId: string, action: GameAction): ValidationResult {
    if (!this._state) return { ok: false, reason: "Engine Destroyed" };

    const nextState = JSON.parse(JSON.stringify(this._state));
    const result = this._actionProcessor.applyAction(nextState, this._index, actorId, action);
    
    if (result.ok) {
        nextState.stateVersion++;
        this._state = nextState;
    }

    return result;
  }
  
  /**
   * Main Simulation Loop
   * Creates a temporary state copy, runs all systems on it, and then commits it.
   */
  public processTick(): TickResult {
    if (!this._state) return { state: {} as any, events: [] };

    const nextState = JSON.parse(JSON.stringify(this._state));
    const tickEvents: GameEvent[] = [];

    for (const system of this._systems) {
        system.update(nextState, this._index, tickEvents);
    }

    nextState.stateVersion++;
    this._state = nextState;

    return {
        state: this._state,
        events: tickEvents
    };
  }

  /**
   * Hard Reset / Cleanup
   */
  public destroy() {
    this._systems = [];
    this._index = null as any;
    this._state = null as any;
    this._actionProcessor = null as any;
  }
}