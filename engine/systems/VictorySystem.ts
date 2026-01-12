

import { System } from './System';
import { GameState, GameEvent, EntityType, LeaderboardEntry, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { GameEventFactory } from '../events';

export class VictorySystem implements System {
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    if (state.gameStatus !== 'PLAYING' || !state.winCondition) {
        return;
    }

    const { type, target } = state.winCondition;
    let gameOver = false;
    let isVictory = false;
    
    // Check Player Win
    const pWin = (type === 'WEALTH' && state.player.totalCoinsEarned >= target) ||
                 (type === 'DOMINATION' && state.player.playerLevel >= target);
    
    if (pWin) {
        state.gameStatus = 'VICTORY';
        const msg = 'Mission Accomplished';
        state.messageLog.unshift(`[SYSTEM] ${msg}`);
        if (state.messageLog.length > 100) state.messageLog.pop();
        events.push(GameEventFactory.create('VICTORY', msg));
        gameOver = true;
        isVictory = true;
    } else {
        // Check Bot Win only if player hasn't won
        const bWin = state.bots.some(b => 
           (type === 'WEALTH' && b.totalCoinsEarned >= target) ||
           (type === 'DOMINATION' && b.playerLevel >= target)
        );

        if (bWin) {
            state.gameStatus = 'DEFEAT';
            const msg = 'Mission Failed: Rival completed objective';
            state.messageLog.unshift(`[SYSTEM] ${msg}`);
            if (state.messageLog.length > 100) state.messageLog.pop();
            events.push(GameEventFactory.create('DEFEAT', msg));
            gameOver = true;
        }
    }
    
    // If game ended, emit an event for the store to handle the leaderboard update.
    // This decouples engine state from persistent UI state.
    if (gameOver) {
        const newEntry: LeaderboardEntry = {
            nickname: 'Player', // Nickname will be sourced from UI state by the store
            avatarColor: '#3b82f6', // Placeholder
            avatarIcon: 'user', // Placeholder
            maxCoins: state.player.totalCoinsEarned,
            maxLevel: state.player.playerLevel,
            timestamp: Date.now()
        };
        events.push(GameEventFactory.create(
            'LEADERBOARD_UPDATE', 
            'Player score submitted', 
            state.player.id, 
            { entry: newEntry }
        ));
    }
  }
}