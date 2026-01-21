






// Game Configuration and Constants

export const GAME_CONFIG = {
  HEX_SIZE: 35,
  INITIAL_MOVES: 0,
  INITIAL_COINS: 0,
  EXCHANGE_RATE_COINS_PER_MOVE: 2,
  BOT_ACTION_INTERVAL_MS: 1000,
  L1_HEX_MAX_DURABILITY: 6, // Increased from 3
  
  // Movement & Animation Speeds
  MOVEMENT_ANIMATION_DURATION: 0.6, // Seconds (Visual Tween)
  MOVEMENT_LOGIC_INTERVAL_MS: 600,  // Milliseconds (Logic Throttle - must match or exceed animation)

  LEVELS: {
    0: { cost: 0,  growthTime: 5,  income: 1,   reqRank: 0 },
    1: { cost: 0,  growthTime: 10, income: 5,   reqRank: 0 },
    2: { cost: 0,  growthTime: 15, income: 10,  reqRank: 1 }, 
    3: { cost: 0,  growthTime: 20, income: 25,  reqRank: 2 },
    4: { cost: 0,  growthTime: 25, income: 50,  reqRank: 3 },
    5: { cost: 0,  growthTime: 30, income: 100, reqRank: 4 },
    6: { cost: 0,  growthTime: 35, income: 200, reqRank: 5 },
    7: { cost: 0,  growthTime: 40, income: 400, reqRank: 6 },
    8: { cost: 0,  growthTime: 50, income: 800, reqRank: 7 },
    9: { cost: 0,  growthTime: 60, income: 1500, reqRank: 8 },
  } as Record<number, { cost: number, growthTime: number, income: number, reqRank: number }>,

  STRUCTURES: {
    MINE: { cost: 50, incomePerTick: 1, maxHp: 20 },
    BARRIER: { cost: 20, hpPerLevel: 10 },
    CAPITAL: { cost: 500, defenseBonus: 2 }
  }
};

export const DIFFICULTY_SETTINGS = {
  EASY: { queueSize: 1 },
  MEDIUM: { queueSize: 2 },
  HARD: { queueSize: 3 }
};

// Resource & Computation Guards
export const SAFETY_CONFIG = {
  MAX_LOG_SIZE: 50,             
  MAX_PATH_LENGTH: 20,          
  MAX_SEARCH_ITERATIONS: 1000,  
  MAX_MOVEMENT_QUEUE: 25        
};

// Re-export specific constants for ease of use in UI components
export const HEX_SIZE = GAME_CONFIG.HEX_SIZE;
export const EXCHANGE_RATE_COINS_PER_MOVE = GAME_CONFIG.EXCHANGE_RATE_COINS_PER_MOVE;

export const getLevelConfig = (level: number) => {
  return GAME_CONFIG.LEVELS[level] || { 
    cost: 0, 
    growthTime: 5 + (level * 5), 
    income: Math.pow(level, 2), 
    reqRank: level - 1 
  };
};