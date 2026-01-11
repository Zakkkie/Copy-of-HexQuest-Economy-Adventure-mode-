
import { GameEvent, GameEventType } from '../types';

export class GameEventFactory {
  static create(type: GameEventType, message?: string, entityId?: string, data?: any): GameEvent {
    return {
      type,
      message,
      entityId,
      data,
      timestamp: Date.now()
    };
  }
}
