
import { System } from './System';
import { GameState, GameEvent, EntityState, EntityType } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { calculateBotMove } from '../../bot/calculateBotMove';
import { ActionProcessor } from '../ActionProcessor';
import { GAME_CONFIG } from '../../rules/config';
import { getHexKey } from '../../services/hexUtils';

export class AiSystem implements System {
  update(state: GameState, index: WorldIndex, events: GameEvent[]): void {
    const now = Date.now();
    
    // Rate Limit
    if (now - state.lastBotActionTime < GAME_CONFIG.BOT_ACTION_INTERVAL_MS) {
      return;
    }

    // Sync WorldIndex for AI queries
    index.syncGrid(state.grid);
    
    // Track hexes claimed by bots in this specific tick to prevent swarming
    const tickObstacles = index.getOccupiedHexesList();
    const tickReservedKeys = new Set<string>();

    let actionTaken = false;

    // Shuffle bots to prevent priority bias
    const shuffledBots = [...state.bots].sort(() => Math.random() - 0.5);

    for (const bot of shuffledBots) {
      if (bot.state !== EntityState.IDLE) continue;

      // Add reserved keys to obstacles for this bot's view
      // We convert reserved keys back to coordinates simply by checking collision inside calculateBotMove logic
      // Ideally we would pass reservedKeys to calculateBotMove, but for now we append to obstacles list
      // Note: This is an approximation. A true reservation system would be deeper, but this stops 99% of overlaps.
      const currentObstacles = [...tickObstacles];
      
      // Inject reserved hexes as virtual obstacles
      // We don't have q,r easily from key without parsing, so we just pass the key set and handle it in AI or 
      // rely on the AI checking index.isOccupied.
      // Better approach: We rely on the ActionProcessor to set the Queue, and we check the Queue? 
      // No, Queue is set instantly. 
      
      const aiResult = calculateBotMove(
        bot, 
        state.grid, 
        state.player, 
        state.winCondition, 
        currentObstacles, 
        index, 
        state.stateVersion,
        tickReservedKeys 
      );

      // Log decision
      if (Math.random() < 0.1) { // Log throttling
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
      }

      // Execute
      if (aiResult.action && aiResult.action.type !== 'WAIT') {
         const res = ActionProcessor.applyAction(state, index, bot.id, aiResult.action);
         if (!res.ok) {
             events.push({
                 type: 'ERROR',
                 message: `Bot ${bot.id} action failed: ${res.reason}`,
                 timestamp: now
             });
         } else {
             actionTaken = true;
             // Reserve the target hex if it's a move
             if (aiResult.action.type === 'MOVE') {
                 const target = aiResult.action.path[aiResult.action.path.length - 1];
                 tickReservedKeys.add(getHexKey(target.q, target.r));
             }
         }
      } else {
         // Passive income if waiting
         bot.coins += 1;
      }
    }

    state.lastBotActionTime = now;
  }
}
