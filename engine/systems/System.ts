

import { GameState, GameEvent, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';

export interface System {
  /**
   * Updates the game state based on the system's logic.
   * @param state The mutable game state.
   * @param index The spatial index for queries.
   * @param events A list to push new game events into.
   */
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void;
}