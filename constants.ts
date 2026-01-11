
import { GAME_CONFIG } from './gameEngine/config';

// Deprecated. See gameEngine/config.ts
export const EXPANSION_K = 3; // Legacy support if needed
export const HEX_SIZE = GAME_CONFIG.HEX_SIZE; 
export const UPGRADE_LOCK_QUEUE_SIZE = GAME_CONFIG.UPGRADE_LOCK_QUEUE_SIZE;
export const EXCHANGE_RATE_COINS_PER_MOVE = GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

// Most logic moved to GAME_CONFIG
export { GAME_CONFIG as CONSTANTS };
