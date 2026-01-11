
import { calculateBotMove } from '../bot/calculateBotMove';
import { WorldIndex } from '../engine/WorldIndex';
import { Entity, Hex, WinCondition, BotAction } from '../types';

export type AIWorkerRequest = {
    grid: Record<string, Hex>;
    bots: Entity[];
    player: Entity;
    winCondition: WinCondition | null;
    stateVersion: number;
};

export type AIWorkerResponse = {
    results: { botId: string; result: { action: BotAction | null; debug: string } }[];
    stateVersion: number;
};

const ctx: Worker = self as any;

ctx.onmessage = (e: MessageEvent<AIWorkerRequest>) => {
  const { grid, bots, player, winCondition, stateVersion } = e.data;
  
  // Rehydrate Index
  // WorldIndex uses maps that are lost in JSON serialization, so we rebuild it.
  const index = new WorldIndex(grid, [player, ...bots]);
  const obstacles = index.getOccupiedHexesList();

  const results = bots.map((bot) => {
    const result = calculateBotMove(bot, grid, player, winCondition, obstacles, index, stateVersion);
    return { botId: bot.id, result };
  });

  ctx.postMessage({ results, stateVersion } as AIWorkerResponse);
};
