
import { System } from './System';
import { GameState, GameEvent, EntityType } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { GameEventFactory } from '../events';

export class VictorySystem implements System {
  update(state: GameState, index: WorldIndex, events: GameEvent[]): void {
    if (state.gameStatus === 'VICTORY' || state.gameStatus === 'DEFEAT' || !state.winCondition) {
        return;
    }

    const { type, target } = state.winCondition;
    
    // Check Player Win
    const pWin = (type === 'WEALTH' && state.player.totalCoinsEarned >= target) ||
                 (type === 'DOMINATION' && state.player.playerLevel >= target);
    
    if (pWin) {
        state.gameStatus = 'VICTORY';
        events.push(GameEventFactory.create('VICTORY', 'Mission Accomplished'));
        return;
    }

    // Check Bot Win
    const bWin = state.bots.some(b => 
       (type === 'WEALTH' && b.totalCoinsEarned >= target) ||
       (type === 'DOMINATION' && b.playerLevel >= target)
    );

    if (bWin) {
        state.gameStatus = 'DEFEAT';
        events.push(GameEventFactory.create('DEFEAT', 'Mission Failed: Rival completed objective'));
    }
  }
}
