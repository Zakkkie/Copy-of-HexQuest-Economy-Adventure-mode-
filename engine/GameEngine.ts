
import { GameState, BotAction, GameEvent, ValidationResult } from '../types';
import { WorldIndex } from './WorldIndex';
import { System } from './systems/System';
import { MovementSystem } from './systems/MovementSystem';
import { GrowthSystem } from './systems/GrowthSystem';
import { AiSystem } from './systems/AiSystem';
import { VictorySystem } from './systems/VictorySystem';
import { ActionProcessor } from './ActionProcessor';

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

/**
 * GameEngine - Architecture Refactor
 * Orchestrates Systems and holds the authoritative state.
 */
export class GameEngine {
  private _state: GameState;
  private _index: WorldIndex;
  private _systems: System[];

  constructor(initialState: GameState) {
    this._state = JSON.parse(JSON.stringify(initialState));
    this._state.stateVersion = this._state.stateVersion || 0;
    
    // Initialize WorldIndex
    this._index = new WorldIndex(this._state.grid, [this._state.player, ...this._state.bots]);
    
    // Initialize Systems Pipeline
    this._systems = [
      new GrowthSystem(),   // 1. Process Growth/Economy
      new AiSystem(),       // 2. Bot Decisions
      new MovementSystem(), // 3. Execute Movement
      new VictorySystem()   // 4. Check Rules
    ];
  }

  public get state(): GameState {
    return this._state;
  }

  public get index(): WorldIndex {
      return this._index;
  }

  /**
   * Sync Player Intent (Growth/Upgrade Mode) from UI
   */
  public setPlayerIntent(isGrowing: boolean, intent: 'RECOVER' | 'UPGRADE' | null) {
      this._state.isPlayerGrowing = isGrowing;
      this._state.playerGrowthIntent = intent;
      // Increment version to ensure UI reflects this change immediately if needed
      this._state.stateVersion++;
  }

  /**
   * External Action Entry Point (UI)
   * Delegates to ActionProcessor
   */
  public applyAction(actorId: string, action: BotAction): ValidationResult {
    const result = ActionProcessor.applyAction(this._state, this._index, actorId, action);
    
    if (result.ok) {
        // Increment state version on successful external action
        this._state.stateVersion++;
        
        // Log denial if needed (handled by UI toast usually, but we can log to bot log for debugging)
        if (actorId !== this._state.player.id) {
           this._state.botActivityLog.unshift({
               botId: actorId, action: action.type, reason: "Manual Override", timestamp: Date.now()
           });
        }
    } else {
         this._state.botActivityLog.unshift({
            botId: actorId, action: action.type, reason: `DENIED: ${result.reason}`, timestamp: Date.now()
        });
    }

    return result;
  }
  
  /**
   * Main Simulation Loop
   */
  public processTick(): TickResult {
    const tickEvents: GameEvent[] = [];

    // Run Systems
    for (const system of this._systems) {
        system.update(this._state, this._index, tickEvents);
    }

    // Increment version for cycle consistency
    this._state.stateVersion++;

    return {
        state: this._state,
        events: tickEvents
    };
  }
}
