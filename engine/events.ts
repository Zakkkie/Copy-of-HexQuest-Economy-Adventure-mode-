
import { GameEvent, GameEventType } from '../types';

export class GameEventFactory {
  static create(type: GameEventType, message?: string, entityId?: string, data?: Record<string, unknown>): GameEvent {
    return {
      type,
      message,
      entityId,
      data,
      timestamp: Date.now()
    };
  }
}
