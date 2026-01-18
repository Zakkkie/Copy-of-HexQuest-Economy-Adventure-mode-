import { System } from './System';
import { GameState, GameEvent, EntityState, EntityType, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { calculateBotMove } from '../../bot/calculateBotMove';
import { ActionProcessor } from '../ActionProcessor';
import { GAME_CONFIG } from '../../rules/config';
import { getHexKey } from '../../services/hexUtils';

export class AiSystem implements System {
  private actionProcessor: ActionProcessor;

  constructor(actionProcessor: ActionProcessor) {
    this.actionProcessor = actionProcessor;
  }

  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    const now = Date.now();
    
    if (now - state.lastBotActionTime < GAME_CONFIG.BOT_ACTION_INTERVAL_MS) {
      return;
    }

    index.syncGrid(state.grid);
    
    const tickObstacles = index.getOccupiedHexesList();
    const tickReservedKeys = new Set<string>();

    const shuffledBots = [...state.bots].sort(() => Math.random() - 0.5);

    for (const bot of shuffledBots) {
      if (bot.state !== EntityState.IDLE) continue;
      
      const aiResult = calculateBotMove(
        bot, 
        state.grid, 
        state.player, 
        state.winCondition, 
        tickObstacles, 
        index, 
        state.stateVersion,
        state.difficulty,
        tickReservedKeys 
      );

      // PERSIST MEMORY (Crucial for Master Goal logic)
      if (aiResult.memory) {
          bot.memory = aiResult.memory;
      }

      state.botActivityLog.unshift({
          botId: bot.id,
          action: aiResult.action ? aiResult.action.type : 'WAIT',
          reason: aiResult.debug,
          timestamp: now,
          target: aiResult.action && aiResult.action.type === 'MOVE' 
              ? `${aiResult.action.path[aiResult.action.path.length-1].q},${aiResult.action.path[aiResult.action.path.length-1].r}`
              : undefined
      });
      if (state.botActivityLog.length > 50) state.botActivityLog.pop();

      if (aiResult.action && aiResult.action.type !== 'WAIT') {
         // The `state` object passed here is the mutable copy from the GameEngine tick.
         const res = this.actionProcessor.applyAction(state, index, bot.id, aiResult.action);
         if (!res.ok) {
             events.push({
                 type: 'ERROR',
                 message: `Bot ${bot.id} action failed: ${res.reason}`,
                 timestamp: now
             });
             // If action failed, maybe reset memory/goal to force rethink next tick?
             if (bot.memory) {
                 bot.memory.lastActionFailed = true;
                 bot.memory.stuckCounter = (bot.memory.stuckCounter || 0) + 1;
             }
         } else {
             if (aiResult.action.type === 'MOVE') {
                 const target = aiResult.action.path[aiResult.action.path.length - 1];
                 tickReservedKeys.add(getHexKey(target.q, target.r));
             }
             // Reset stuck counter on success
             if (bot.memory) bot.memory.stuckCounter = 0;
         }
      }
    }

    state.lastBotActionTime = now;
  }
}