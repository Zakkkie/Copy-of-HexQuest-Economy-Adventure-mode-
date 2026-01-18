import { System } from './System';
import { GameState, GameEvent, EntityType, LeaderboardEntry, SessionState } from '../../types';
import { WorldIndex } from '../WorldIndex';
import { GameEventFactory } from '../events';

export class VictorySystem implements System {
  update(state: SessionState, index: WorldIndex, events: GameEvent[]): void {
    if (state.gameStatus !== 'PLAYING' || !state.winCondition) {
        return;
    }

    const { targetLevel, targetCoins } = state.winCondition;
    let gameOver = false;
    let isVictory = false;
    
    // Check Player Win
    // Composite Condition: Must have BOTH Level AND Coins
    const pWin = (state.player.playerLevel >= targetLevel) && (state.player.totalCoinsEarned >= targetCoins);
    
    if (pWin) {
        state.gameStatus = 'VICTORY';
        const msg = 'Mission Accomplished';
        
        state.messageLog.unshift({
            id: `win-${Date.now()}`,
            text: msg,
            type: 'SUCCESS',
            source: 'SYSTEM',
            timestamp: Date.now()
        });

        events.push(GameEventFactory.create('VICTORY', msg));
        gameOver = true;
        isVictory = true;
    } else {
        // Check Bot Win
        const bWin = state.bots.some(b => 
           (b.playerLevel >= targetLevel) && (b.totalCoinsEarned >= targetCoins)
        );

        if (bWin) {
            state.gameStatus = 'DEFEAT';
            const msg = 'Mission Failed: Rival completed objective';
            
            state.messageLog.unshift({
                id: `lose-${Date.now()}`,
                text: msg,
                type: 'ERROR',
                source: 'SYSTEM',
                timestamp: Date.now()
            });
            
            events.push(GameEventFactory.create('DEFEAT', msg));
            gameOver = true;
        }
    }
    
    if (gameOver) {
        const statsEntry: Partial<LeaderboardEntry> = {
            maxCoins: state.player.totalCoinsEarned,
            maxLevel: state.player.playerLevel,
            difficulty: state.difficulty,
            timestamp: Date.now()
        };
        events.push(GameEventFactory.create(
            'LEADERBOARD_UPDATE', 
            'Stats submitted', 
            state.player.id, 
            { entry: statsEntry }
        ));
    }
  }
}