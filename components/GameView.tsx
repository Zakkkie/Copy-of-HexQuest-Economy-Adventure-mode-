import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import Konva from 'konva';
import { useGameStore } from '../store.ts';
import { getHexKey, getNeighbors, getSecondsToGrow, hexToPixel, findPath } from '../services/hexUtils.ts';
import { checkGrowthCondition } from '../rules/growth.ts';
import Hexagon from './Hexagon.tsx'; 
import Unit from './Unit.tsx';
import Background from './Background.tsx';
import { 
  AlertCircle, Pause, Play, Trophy, Coins, Footprints, AlertTriangle, LogOut,
  Crown, Target, TrendingUp, ChevronDown, ChevronUp, Shield, MapPin,
  RotateCcw, RotateCw, CheckCircle2, ChevronsUp, Lock, Bot, Activity
} from 'lucide-react';
import { EXCHANGE_RATE_COINS_PER_MOVE, DIFFICULTY_SETTINGS } from '../rules/config.ts';
import { Hex, EntityType, EntityState } from '../types.ts';

const VIEWPORT_PADDING = 300; 

// Render Item Type for Z-Sorting
type RenderItem = 
  | { type: 'HEX'; id: string; depth: number; q: number; r: number }
  | { type: 'UNIT'; id: string; depth: number; q: number; r: number; isPlayer: boolean }
  | { type: 'CONN'; id: string; depth: number; points: number[]; color: string; dash: number[]; opacity: number };

const GameView: React.FC = () => {
  // --- STATE SELECTION ---
  const session = useGameStore(state => state.session);
  const { user, toast, pendingConfirmation, setUIState, hideToast, showToast, abandonSession, tick, movePlayer, togglePlayerGrowth, confirmPendingAction, cancelPendingAction } = useGameStore();

  if (!session) return null;
  const { grid, player, bots, winCondition, gameStatus, messageLog, botActivityLog, isPlayerGrowing, playerGrowthIntent, sessionStartTime, difficulty } = session;
  
  const queueSize = DIFFICULTY_SETTINGS[difficulty]?.queueSize || 3;

  // Dimensions
  const [dimensions, setDimensions] = useState({ 
    width: window.innerWidth, 
    height: window.innerHeight 
  });

  // Viewport
  const [viewState, setViewState] = useState({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    scale: 1
  });

  // Camera Rotation (Degrees)
  const [cameraRotation, setCameraRotation] = useState(0);
  const targetRotationRef = useRef(0); 

  // Mouse Interaction Refs
  const isRotating = useRef(false);
  const lastMouseX = useRef(0);

  // Movement Tracking for Z-Index Stabilization
  const movementTracker = useRef<Record<string, { lastQ: number; lastR: number; fromQ: number; fromR: number; startTime: number }>>({});

  // UI Local State
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [isRankingsOpen, setIsRankingsOpen] = useState(window.innerWidth >= 768);
  const [activeTab, setActiveTab] = useState<'LOGS' | 'BOTS'>('LOGS');
  const [hoveredHexId, setHoveredHexId] = useState<string | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const botLogsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log panels
  useEffect(() => {
    if (logsContainerRef.current && activeTab === 'LOGS') {
        logsContainerRef.current.scrollTop = 0; 
    }
    if (botLogsContainerRef.current && activeTab === 'BOTS') {
        botLogsContainerRef.current.scrollTop = 0;
    }
  }, [messageLog, botActivityLog, activeTab]);

  // Game Loop (Tick)
  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // Toast Auto-Hide
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(hideToast, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  // Resize Handler
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Derived State - SAFE GUARDS ADDED HERE
  const currentHex = grid[getHexKey(player.q, player.r)];
  const neighbors = useMemo(() => getNeighbors(player.q, player.r), [player.q, player.r]);
  
  // Safe bot filtering to prevent "undefined reading 'q'" crashes
  const safeBots = useMemo(() => (bots || []).filter(b => b && typeof b.q === 'number' && typeof b.r === 'number'), [bots]);
  const botPositions = useMemo(() => safeBots.map(b => ({ q: b.q, r: b.r })), [safeBots]);
  
  const isMoving = player.state === EntityState.MOVING;
  const canRecover = currentHex ? (currentHex.currentLevel < currentHex.maxLevel) : false;

  const growthCondition = useMemo(() => {
    if (!currentHex) return { canGrow: false, reason: 'Invalid Hex' };
    return checkGrowthCondition(currentHex, player, neighbors, grid, botPositions, queueSize);
  }, [currentHex, player, grid, neighbors, botPositions, queueSize]);

  const upgradeCondition = useMemo(() => {
    if (!currentHex) return { canGrow: false, reason: 'Invalid Hex' };
    const simulatedHex = { ...currentHex, currentLevel: Math.max(0, currentHex.maxLevel) };
    return checkGrowthCondition(simulatedHex, player, neighbors, grid, botPositions, queueSize);
  }, [currentHex, player, grid, neighbors, botPositions, queueSize]);

  const canUpgrade = upgradeCondition.canGrow; 

  const timeData = useMemo(() => {
    if (!currentHex) return { totalNeeded: 1, totalDone: 0, percent: 0, mode: 'IDLE' };
    let totalNeeded = 0;
    const isTargetingUpgrade = (playerGrowthIntent === 'UPGRADE') || (!canRecover && canUpgrade);
    const calculationTarget = isTargetingUpgrade ? currentHex.maxLevel + 1 : currentHex.maxLevel;

    for (let l = currentHex.currentLevel + 1; l <= calculationTarget; l++) {
        totalNeeded += getSecondsToGrow(l);
    }
    const currentStepProgress = currentHex.progress;
    const remaining = Math.max(0, totalNeeded - currentStepProgress);
    const percent = totalNeeded > 0 ? ((totalNeeded - remaining) / totalNeeded) * 100 : 0;
    const mode = isTargetingUpgrade ? 'UPGRADE' : 'GROWTH';

    return { totalNeeded, remaining, percent, mode };
  }, [currentHex, isPlayerGrowing, canRecover, canUpgrade, playerGrowthIntent]);

  const handleGrowClick = () => {
    centerOnPlayer(); 
    if (isMoving) return;
    if (!currentHex) return;
    if (!canRecover) {
        if (currentHex.currentLevel === currentHex.maxLevel) {
            showToast("Sector Stable (Use Upgrade)", "info");
        } else {
            showToast("Cannot Recover", "error");
        }
        return;
    }
    togglePlayerGrowth('RECOVER');
  };

  const handleUpgradeClick = () => {
    centerOnPlayer(); 
    if (isMoving) return; 
    if (!currentHex) return;
    if (!canUpgrade) {
        showToast(upgradeCondition.reason || "Conditions not met: Check Rank or Neighbors", "error");
        return;
    }
    togglePlayerGrowth('UPGRADE');
  };

  const tooltipData = useMemo(() => {
    if (!hoveredHexId) return null;
    const hex = grid[hoveredHexId];
    if (!hex) return null;

    const obstacles = safeBots.map(b => ({ q: b.q, r: b.r }));
    const isBlockedByBot = obstacles.some(o => o.q === hex.q && o.r === hex.r);
    const isPlayerPos = hex.q === player.q && hex.r === player.r;
    
    let label: string | null = null;
    let costMoves = 0;
    let costCoins = 0;
    let isReachable = false;
    let moveCost = 0;
    let canAffordCoins = true;
    
    if (isPlayerPos) {
        label = "Current Location";
        isReachable = true;
    } else if (isBlockedByBot) {
        label = "BLOCKED";
    } else {
        const path = findPath({ q: player.q, r: player.r }, { q: hex.q, r: hex.r }, grid, player.playerLevel, obstacles);
        if (path) {
            isReachable = true;
            for (const step of path) {
                const stepHex = grid[getHexKey(step.q, step.r)];
                moveCost += (stepHex && stepHex.maxLevel >= 2) ? stepHex.maxLevel : 1;
            }
            const availableMoves = player.moves;
            const movesToSpend = Math.min(moveCost, availableMoves);
            const deficit = moveCost - movesToSpend;
            const coinsToSpend = deficit * EXCHANGE_RATE_COINS_PER_MOVE;

            costMoves = movesToSpend;
            costCoins = coinsToSpend;
            canAffordCoins = player.coins >= coinsToSpend;
        } else {
            label = "N/A";
        }
    }

    const isLocked = hex.maxLevel > player.playerLevel;
    let statusText = "OK";
    let statusColor = "text-emerald-400";
    let Icon = CheckCircle2;

    if (isLocked) {
        statusText = `REQ L${hex.maxLevel}`;
        statusColor = "text-red-400";
        Icon = Lock;
    } else if (isBlockedByBot) {
        statusText = "OCCUPIED";
        statusColor = "text-amber-400";
        Icon = AlertCircle;
    } else if (isPlayerPos) {
        statusText = "PLAYER";
        statusColor = "text-blue-400";
        Icon = MapPin;
    }

    return { 
        hex, label, costMoves, costCoins, canAffordCoins, isReachable, isLocked, statusText, statusColor, Icon 
    };
  }, [hoveredHexId, grid, player.q, player.r, player.playerLevel, player.moves, player.coins, safeBots]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const seconds = totalSeconds % 60;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const rotateCamera = (direction: 'left' | 'right') => {
      const step = 60;
      const currentSnapped = Math.round(targetRotationRef.current / step) * step;
      const nextTarget = direction === 'left' ? currentSnapped - step : currentSnapped + step;
      targetRotationRef.current = nextTarget;
      
      const startTime = performance.now();
      const startRot = cameraRotation;
      const duration = 300;

      const animate = (time: number) => {
          const elapsed = time - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const ease = 1 - (1 - progress) * (1 - progress);
          const newRot = startRot + (nextTarget - startRot) * ease;
          setCameraRotation(newRot);
          if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
  };

  const centerOnPlayer = useCallback(() => {
    const { x: px, y: py } = hexToPixel(player.q, player.r, cameraRotation);
    setViewState(prev => ({
      ...prev,
      x: (dimensions.width / 2) - (px * prev.scale),
      y: (dimensions.height / 2) - (py * prev.scale)
    }));
  }, [player.q, player.r, dimensions, cameraRotation]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const scaleBy = 1.1;
    const oldScale = viewState.scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - viewState.x) / oldScale,
      y: (pointer.y - viewState.y) / oldScale,
    };
    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.max(0.4, Math.min(newScale, 2.5));
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    setViewState({ x: newPos.x, y: newPos.y, scale: newScale });
  }, [viewState]);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 2) { 
        isRotating.current = true;
        lastMouseX.current = e.evt.clientX;
        const stage = e.target.getStage();
        if (stage) stage.draggable(false);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isRotating.current) {
        const deltaX = e.evt.clientX - lastMouseX.current;
        lastMouseX.current = e.evt.clientX;
        const sensitivity = 0.5;
        setCameraRotation(prev => {
            const newRot = prev + deltaX * sensitivity;
            targetRotationRef.current = newRot; 
            return newRot;
        });
    }
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (isRotating.current) {
        isRotating.current = false;
        const stage = e.target.getStage();
        if (stage) stage.draggable(true);
    }
  };

  const handleMouseLeave = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isRotating.current) {
          isRotating.current = false;
          const stage = e.target.getStage();
          if (stage) stage.draggable(true);
      }
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
     if (!isRotating.current) {
        setViewState(prev => ({ ...prev, x: e.target.x(), y: e.target.y() }));
     }
  };

  const playerNeighborKeys = useMemo(() => {
    return new Set(neighbors.map(n => getHexKey(n.q, n.r)));
  }, [neighbors]);

  const renderList = useMemo(() => {
     const items: RenderItem[] = [];
     const allHexes = Object.values(grid) as Hex[];

     // --- OPTIMIZATION: Viewport Culling ---
     const inverseScale = 1 / viewState.scale;
     const visibleMinX = -viewState.x * inverseScale - VIEWPORT_PADDING;
     const visibleMaxX = (dimensions.width - viewState.x) * inverseScale + VIEWPORT_PADDING;
     const visibleMinY = -viewState.y * inverseScale - VIEWPORT_PADDING;
     const visibleMaxY = (dimensions.height - viewState.y) * inverseScale + VIEWPORT_PADDING;

     for (const hex of allHexes) {
        if (!hex) continue;
        const { x, y } = hexToPixel(hex.q, hex.r, cameraRotation);
        
        if (x < visibleMinX || x > visibleMaxX || y < visibleMinY || y > visibleMaxY) {
            continue; 
        }

        items.push({ type: 'HEX', id: hex.id, depth: y, q: hex.q, r: hex.r });
     }

     // FIX: Safe bot mapping to prevent undefined crashes
     const allUnits = [{ ...player, isPlayer: true }, ...safeBots.map(b => ({ ...b, isPlayer: false }))];
     const now = Date.now();

     for (const u of allUnits) {
         // CRITICAL FIX: Ensure 'q' and 'r' exist
         if (!u || typeof u.q !== 'number' || typeof u.r !== 'number') continue;

         let track = movementTracker.current[u.id];
         if (!track) {
             track = { lastQ: u.q, lastR: u.r, fromQ: u.q, fromR: u.r, startTime: 0 };
             movementTracker.current[u.id] = track;
         }
         
         if (track.lastQ !== u.q || track.lastR !== u.r) {
             track.fromQ = track.lastQ;
             track.fromR = track.lastR;
             track.startTime = now;
             track.lastQ = u.q;
             track.lastR = u.r;
         }

         const currentPixel = hexToPixel(u.q, u.r, cameraRotation);
         
         if (currentPixel.x < visibleMinX || currentPixel.x > visibleMaxX || currentPixel.y < visibleMinY || currentPixel.y > visibleMaxY) {
             continue;
         }

         let sortY = currentPixel.y;
         
         if (now - track.startTime < 350) {
             const fromPixel = hexToPixel(track.fromQ, track.fromR, cameraRotation);
             sortY = Math.max(sortY, fromPixel.y);
         }

         items.push({ type: 'UNIT', id: u.id, depth: sortY + 25, q: u.q, r: u.r, isPlayer: u.isPlayer });
     }

     if (!isMoving) {
        const startHex = grid[getHexKey(player.q, player.r)];
        const startLevel = startHex ? startHex.maxLevel : 0;
        neighbors.forEach(neighbor => {
            const key = getHexKey(neighbor.q, neighbor.r);
            const hex = grid[key];
            const isBot = safeBots.some(b => b.q === neighbor.q && b.r === neighbor.r);
            const isLocked = hex && hex.maxLevel > player.playerLevel;
            const endLevel = hex ? hex.maxLevel : 0;
            const isReachableHeight = Math.abs(startLevel - endLevel) <= 1;

            if (!isBot && isReachableHeight) {
                const start = hexToPixel(player.q, player.r, cameraRotation);
                const end = hexToPixel(neighbor.q, neighbor.r, cameraRotation);
                
                if ((start.x > visibleMinX && start.x < visibleMaxX && start.y > visibleMinY && start.y < visibleMaxY) ||
                    (end.x > visibleMinX && end.x < visibleMaxX && end.y > visibleMinY && end.y < visibleMaxY)) {
                        
                    const startH = grid[getHexKey(player.q, player.r)] ? (10 + grid[getHexKey(player.q, player.r)].maxLevel * 6) : 10;
                    const endH = hex ? (10 + hex.maxLevel * 6) : 10;
                    const sY = start.y - startH;
                    const eY = end.y - endH;
                    let cost = 1;
                    if (hex && hex.maxLevel >= 2) cost = hex.maxLevel;
                    const canAfford = player.moves >= cost || player.coins >= (cost * EXCHANGE_RATE_COINS_PER_MOVE);
                    
                    items.push({
                        type: 'CONN', id: `conn-${key}`, depth: Math.min(start.y, end.y),
                        points: [start.x, sY, end.x, eY], color: canAfford ? '#3b82f6' : '#ef4444',
                        dash: [5, 5], opacity: isLocked ? 0.2 : 0.6
                    });
                }
            }
        });
     }
     return items.sort((a, b) => a.depth - b.depth);
  }, [grid, player, safeBots, cameraRotation, isMoving, playerNeighborKeys, viewState, dimensions]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#020617]" onContextMenu={(e) => e.preventDefault()}>
      <style>{`
        @keyframes shimmer-gradient {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* BACKGROUND */}
      <div className="absolute inset-0 pointer-events-none z-0">
         <Background variant="GAME" />
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#020617_100%)] opacity-70" />
      </div>

      {/* CANVAS */}
      <div className="absolute inset-0 z-10">
        <Stage width={dimensions.width} height={dimensions.height} draggable
          onWheel={handleWheel} 
          onMouseDown={handleMouseDown} 
          onMouseMove={handleMouseMove} 
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDragStart={() => setHoveredHexId(null)}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => e.evt.preventDefault()} x={viewState.x} y={viewState.y} scaleX={viewState.scale} scaleY={viewState.scale}
        >
          <Layer>
            {renderList.map((item) => {
                if (item.type === 'HEX') {
                    const isOccupied = (item.q === player.q && item.r === player.r) || safeBots.some(b => b.q === item.q && b.r === item.r);
                    return <Hexagon key={item.id} id={item.id} rotation={cameraRotation} isPlayerNeighbor={playerNeighborKeys.has(item.id)} playerRank={player.playerLevel} isOccupied={isOccupied} onHexClick={movePlayer} onHover={setHoveredHexId} />;
                } else if (item.type === 'UNIT') {
                    const unit = item.isPlayer ? player : safeBots.find(b => b.id === item.id);
                    if (!unit) return null;
                    const hexKey = getHexKey(unit.q, unit.r);
                    const hLevel = grid[hexKey]?.maxLevel || 0;
                    return <Unit key={item.id} q={unit.q} r={unit.r} type={item.isPlayer ? EntityType.PLAYER : EntityType.BOT} color={unit.avatarColor} rotation={cameraRotation} hexLevel={hLevel} totalCoinsEarned={unit.totalCoinsEarned} />;
                } else if (item.type === 'CONN') {
                    return <Line key={item.id} points={item.points} stroke={item.color} strokeWidth={2} dash={item.dash} opacity={item.opacity} listening={false} perfectDrawEnabled={false} />;
                }
                return null;
            })}
          </Layer>
        </Stage>
      </div>

      {/* HEADER */}
      <div className="absolute inset-x-0 top-0 p-2 md:p-4 z-30 pointer-events-none select-none">
          {/* STATS */}
          <div className="absolute top-2 md:top-4 left-2 md:left-1/2 md:-translate-x-1/2 flex flex-col items-center gap-2 max-w-[calc(100%-4rem)] md:max-w-fit pointer-events-auto z-40">
               <div className="flex items-center gap-2 md:gap-6 px-3 md:px-8 py-2 md:py-3 bg-slate-900/90 backdrop-blur-2xl rounded-[1.5rem] md:rounded-[2rem] border border-slate-800 shadow-2xl overflow-x-auto no-scrollbar max-w-full">
                   <div className="flex flex-col items-center gap-0.5 md:gap-1 shrink-0">
                       <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest uppercase">Level</span>
                       <div className="flex items-center gap-1.5 md:gap-2">
                           <Crown className="w-4 h-4 md:w-5 md:h-5 text-indigo-500" />
                           <span className="text-lg md:text-2xl font-black text-white leading-none">{player.playerLevel}</span>
                       </div>
                   </div>
                   <div className="w-px h-6 md:h-8 bg-slate-800 shrink-0"></div>
                   <div className="flex flex-col items-center gap-0.5 md:gap-1 shrink-0">
                       <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest uppercase">Upgrade</span>
                       <div className="flex items-center gap-1.5 md:gap-2">
                           <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-emerald-500" />
                           <div className="flex gap-0.5 md:gap-1 h-4 md:h-5 items-center">
                               {Array.from({length: queueSize}).map((_, i) => (
                                  <div key={i} className={`w-1.5 md:w-2 h-3 md:h-4 rounded-sm transition-all duration-300 ${player.recentUpgrades.length > i ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] scale-110' : 'bg-slate-800'}`} />
                               ))}
                           </div>
                       </div>
                   </div>
                   <div className="w-px h-6 md:h-8 bg-slate-800 shrink-0"></div>
                   <div className="flex flex-col items-center gap-0.5 md:gap-1 shrink-0">
                       <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest uppercase">Credits</span>
                       <div className="flex items-center gap-1.5 md:gap-2">
                           <Coins className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                           <span className="text-lg md:text-2xl font-black text-white leading-none">{player.coins}</span>
                       </div>
                   </div>
                   <div className="w-px h-6 md:h-8 bg-slate-800 shrink-0"></div>
                   <div className="flex flex-col items-center gap-0.5 md:gap-1 shrink-0">
                       <span className="text-[8px] md:text-[9px] font-bold text-slate-500 tracking-widest uppercase">Moves</span>
                       <div className="flex items-center gap-1.5 md:gap-2">
                           <Footprints className={`w-4 h-4 md:w-5 md:h-5 ${isMoving ? 'text-slate-400 animate-pulse' : 'text-blue-500'}`} />
                           <span className="text-lg md:text-2xl font-black text-white leading-none">{player.moves}</span>
                       </div>
                   </div>
               </div>

               {winCondition && (
                  <div className="flex items-center gap-2 px-4 py-1.5 bg-slate-950/80 backdrop-blur-md rounded-full border border-slate-800/60 shadow-lg animate-in slide-in-from-top-1 fade-in">
                      <Target className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Goal: <span className="text-cyan-100">{winCondition.label}</span>
                      </span>
                  </div>
               )}
          </div>

          {/* RIGHT: Rankings + Exit */}
          <div className="absolute top-2 md:top-4 right-2 md:right-4 flex items-start gap-2 pointer-events-auto z-50">
               <div className={`flex flex-col bg-slate-900/90 backdrop-blur-2xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out origin-top-right ${isRankingsOpen ? 'w-56 md:w-64' : 'w-auto'}`}>
                   <div onClick={() => setIsRankingsOpen(!isRankingsOpen)} className="flex items-center justify-between p-2 md:p-3 cursor-pointer hover:bg-white/5 transition-colors gap-2 md:gap-4 h-11">
                       <div className="flex items-center gap-2 md:gap-2.5">
                           <Trophy className="w-4 h-4 text-amber-500" />
                           {isRankingsOpen && <span className="text-[9px] md:text-[10px] font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Live Rankings</span>}
                       </div>
                       {isRankingsOpen ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                   </div>
                   
                   {isRankingsOpen && (
                       <div className="flex flex-col p-2 pt-0 gap-1.5 max-h-[40vh] overflow-y-auto no-scrollbar">
                           {[player, ...safeBots].sort((a, b) => (b.totalCoinsEarned || 0) - (a.totalCoinsEarned || 0)).map((e) => {
                               const isPlayer = e.type === 'PLAYER';
                               const color = isPlayer ? (user?.avatarColor || '#3b82f6') : (e.avatarColor || '#ef4444');
                               return (
                                   <div key={e.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-950/50 border border-slate-800/50">
                                       <div className="flex items-center gap-3 overflow-hidden">
                                           <div className="w-2 h-2 rounded-full shrink-0 shadow-[0_0_8px_currentColor]" style={{ color, backgroundColor: color }} />
                                           <div className="flex flex-col min-w-0">
                                               <span className={`text-[10px] md:text-[11px] font-bold truncate leading-tight ${isPlayer ? 'text-white' : 'text-slate-400'}`}>{isPlayer ? (user?.nickname || 'YOU') : e.id.toUpperCase()}</span>
                                               <div className="flex gap-0.5 mt-0.5">
                                                   {Array.from({length: queueSize}).map((_, i) => (
                                                       <div key={i} className={`w-1 h-1 rounded-full ${e.recentUpgrades.length > i ? 'bg-emerald-500' : 'bg-slate-800'}`} />
                                                   ))}
                                               </div>
                                           </div>
                                       </div>
                                       <div className="flex flex-col items-end leading-none">
                                           <span className="text-[10px] md:text-[11px] font-mono text-amber-500 font-bold">{e.coins}</span>
                                           <span className="text-[8px] md:text-[9px] font-mono text-indigo-400">L{e.playerLevel}</span>
                                       </div>
                                   </div>
                               );
                           })}
                       </div>
                   )}
               </div>

               <button onClick={() => setShowExitConfirmation(true)} className="w-11 h-11 flex items-center justify-center bg-slate-900/90 backdrop-blur-2xl border border-slate-700/80 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-xl active:scale-95" title="Exit Session">
                  <LogOut className="w-5 h-5" />
               </button>
          </div>
      </div>

      {/* --- RIGHT PANEL: LOGS + BOTS --- */}
      <div className="hidden md:flex absolute top-24 right-4 z-20 pointer-events-auto flex-col w-72 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-2xl shadow-xl overflow-hidden max-h-[calc(100vh-10rem)]">
          {/* Tabs */}
          <div className="flex border-b border-slate-700/50">
             <button 
                onClick={() => setActiveTab('LOGS')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2
                  ${activeTab === 'LOGS' ? 'bg-slate-800/80 text-white' : 'text-slate-500 hover:text-slate-300'}`}
             >
                <Activity className="w-3 h-3" /> System Log
             </button>
             <button 
                onClick={() => setActiveTab('BOTS')}
                className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2
                  ${activeTab === 'BOTS' ? 'bg-slate-800/80 text-white' : 'text-slate-500 hover:text-slate-300'}`}
             >
                <Bot className="w-3 h-3" /> Bot Logic
             </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar bg-black/40 p-2 min-h-[150px]">
              {activeTab === 'LOGS' && (
                  <div ref={logsContainerRef} className="flex flex-col gap-1.5">
                     {messageLog.map((msg, idx) => (
                        <div key={`${typeof msg === 'string' ? msg : JSON.stringify(msg)}-${idx}`} className="bg-slate-800/50 border-l-2 border-cyan-500/50 px-2 py-1.5 text-[10px] font-mono text-cyan-100/90 rounded-r-md">
                          {typeof msg === 'string' ? msg : JSON.stringify(msg)}
                        </div>
                     ))}
                  </div>
              )}
              {activeTab === 'BOTS' && (
                  <div ref={botLogsContainerRef} className="flex flex-col gap-2">
                     {botActivityLog.map((log, idx) => {
                         const color = safeBots.find(b => b.id === log.botId)?.avatarColor || '#64748b';
                         return (
                            <div key={idx} className="bg-slate-900/80 border border-slate-700 p-2 rounded-lg">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{backgroundColor: color}} />
                                        <span className="text-[10px] font-bold text-slate-300 uppercase">{log.botId}</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-500">{formatTime(Date.now() - log.timestamp)} ago</span>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] font-mono text-white">
                                    <span className="text-amber-500 font-bold">{log.action}</span>
                                    {log.target && <span className="text-slate-400">@ {log.target}</span>}
                                </div>
                                <div className="text-[9px] text-slate-500 mt-1 italic leading-tight border-t border-slate-800 pt-1 mt-1">
                                    {log.reason}
                                </div>
                            </div>
                         );
                     })}
                     {botActivityLog.length === 0 && <div className="text-center text-slate-600 text-xs py-4">Waiting for AI signals...</div>}
                  </div>
              )}
          </div>
      </div>

      {/* TOOLTIP & ACTION BARS */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-3 w-[90%] md:w-[28rem] pointer-events-none">
        {tooltipData && (
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 px-5 py-2.5 rounded-full shadow-2xl animate-in slide-in-from-bottom-2 fade-in duration-200 pointer-events-auto flex items-center gap-4">
             <span className="text-white font-black text-sm uppercase tracking-tight whitespace-nowrap">HEX LEVEL {tooltipData.hex.maxLevel}</span>
             <div className="w-px h-4 bg-slate-700"></div>
             {tooltipData.isReachable && !tooltipData.isLocked ? (
                <>
                  {tooltipData.label ? (
                     <span className="text-slate-300 font-mono text-xs font-bold uppercase tracking-wide whitespace-nowrap">{tooltipData.label}</span>
                  ) : (
                     <div className="flex items-center gap-3 font-mono text-xs font-bold">
                        {tooltipData.costMoves > 0 && (<div className="flex items-center gap-1.5"><span className="text-white">{tooltipData.costMoves}</span><Footprints className="w-3.5 h-3.5 text-blue-500" /></div>)}
                        {tooltipData.costMoves > 0 && tooltipData.costCoins > 0 && (<span className="text-slate-600">+</span>)}
                        {tooltipData.costCoins > 0 && (<div className="flex items-center gap-1.5"><span className={tooltipData.canAffordCoins ? "text-white" : "text-red-500 font-black animate-pulse"}>{tooltipData.costCoins}</span><Coins className={`w-3.5 h-3.5 ${tooltipData.canAffordCoins ? "text-amber-500" : "text-red-500"}`} /></div>)}
                     </div>
                  )}
                </>
             ) : (
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${tooltipData.statusColor}`}><tooltipData.Icon className="w-3.5 h-3.5" /><span>{tooltipData.statusText}</span></div>
             )}
          </div>
        )}
        {currentHex && !growthCondition.canGrow && !isPlayerGrowing && !isMoving && !canRecover && !canUpgrade && (
          <div className="flex gap-2 px-3 py-1.5 bg-red-950/90 backdrop-blur-md rounded-lg border border-red-500/50 shadow-lg animate-pulse pointer-events-auto">
            <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" /><span className="text-[9px] text-red-100 uppercase font-bold tracking-tight">{growthCondition.reason}</span>
          </div>
        )}
      </div>

      <div className="absolute bottom-8 w-full flex justify-center items-end gap-4 pointer-events-none z-40">
        <button onClick={() => rotateCamera('left')} className="w-12 h-12 mb-4 bg-slate-900/80 backdrop-blur rounded-full border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all pointer-events-auto shadow-xl active:scale-95 flex items-center justify-center"><RotateCcw className="w-5 h-5" /></button>
        <div className="flex gap-3 items-end pointer-events-auto h-20 transition-all duration-300">
           {isPlayerGrowing ? (
              <button onClick={() => { centerOnPlayer(); togglePlayerGrowth('RECOVER'); }} className="w-44 h-20 bg-slate-900/90 backdrop-blur-xl border border-emerald-500/50 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.2)] active:scale-95 transition-all group">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 via-emerald-400/30 to-emerald-600/10" style={{ width: `${timeData.percent}%`, transition: 'width 1s linear', backgroundSize: '200% 100%', animation: 'shimmer-gradient 3s linear infinite' }} />
                  <div className="absolute bottom-0 left-0 h-0.5 bg-emerald-400 shadow-[0_0_10px_#34d399]" style={{ width: `${timeData.percent}%`, transition: 'width 1s linear' }} />
                  <div className="relative z-10 flex flex-col items-center gap-1">
                      <div className="flex items-center gap-2 text-emerald-100 font-black text-xs uppercase tracking-widest"><Pause className="w-3 h-3 fill-current" /><span>{timeData.mode === 'UPGRADE' ? 'UPGRADING' : 'RECOVERING'}</span></div>
                      <span className="text-[10px] font-mono text-emerald-400 font-bold">{formatTime(timeData.remaining * 1000)}</span>
                  </div>
              </button>
           ) : (
              <>
                <button onClick={handleGrowClick} className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-all active:scale-90 shadow-xl ${(canRecover && !isMoving) ? 'bg-blue-600/10 border-blue-500/50 hover:bg-blue-600/20 text-blue-100 shadow-[0_0_20px_rgba(37,99,235,0.2)]' : 'bg-slate-900/80 border-slate-800 text-slate-600 grayscale opacity-60 cursor-pointer hover:bg-slate-800'}`}>
                    <Play className="w-6 h-6 fill-current" /><span className="text-[9px] font-black uppercase tracking-widest">Recovery</span>
                </button>
                <button onClick={handleUpgradeClick} className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border-2 transition-all active:scale-90 shadow-xl ${(canUpgrade && !isMoving) ? 'bg-amber-600/10 border-amber-500/50 hover:bg-amber-600/20 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'bg-slate-900/80 border-slate-800 text-slate-600 grayscale opacity-60 cursor-pointer hover:bg-slate-800'}`}>
                    <ChevronsUp className="w-6 h-6" /><span className="text-[9px] font-black uppercase tracking-widest">Upgrade</span>
                </button>
              </>
           )}
        </div>
        <button onClick={() => rotateCamera('right')} className="w-12 h-12 mb-4 bg-slate-900/80 backdrop-blur rounded-full border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-all pointer-events-auto shadow-xl active:scale-95 flex items-center justify-center"><RotateCw className="w-5 h-5" /></button>
      </div>
      
       {/* MOVE COST CONFIRMATION MODAL */}
      {pendingConfirmation && (
        <div className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center">
             <div className="mx-auto w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mb-4"><Coins className="w-6 h-6 text-amber-500" /></div>
             <h3 className="text-xl font-bold text-white mb-2">Resource Conversion</h3>
             <p className="text-slate-400 text-xs mb-6 px-4">High-level sectors require additional propulsion. <br/><span className="text-amber-500">Insufficient moves available.</span></p>
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-6 flex flex-col gap-2">
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase">Total Move Cost</span><span className="text-white font-mono font-bold">{pendingConfirmation.data.costMoves + (pendingConfirmation.data.costCoins / EXCHANGE_RATE_COINS_PER_MOVE)}</span></div>
                <div className="w-full h-px bg-slate-800 my-1"></div>
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase">Available Moves</span><span className="text-emerald-500 font-mono font-bold">{player.moves}</span></div>
                <div className="flex justify-between items-center"><span className="text-xs font-bold text-amber-500 uppercase">Credit Cost</span><div className="text-amber-500 font-mono font-bold flex items-center gap-1">-{pendingConfirmation.data.costCoins} <Coins className="w-3 h-3" /></div></div>
             </div>
             <div className="flex gap-3">
               <button onClick={cancelPendingAction} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider">Abort</button>
               <button onClick={confirmPendingAction} className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 rounded-xl text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20">Authorize</button>
             </div>
          </div>
        </div>
      )}

      {showExitConfirmation && (
        <div className="absolute inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto p-4">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50"></div>
             <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4 border border-red-500/20"><LogOut className="w-6 h-6 text-red-500" /></div>
             <h3 className="text-xl font-bold text-white mb-2">Abort Mission?</h3>
             <p className="text-slate-400 text-xs mb-6 leading-relaxed">Terminating the session will disconnect from the current sector. <br/><span className="text-red-400 font-bold">All unsaved tactical data will be lost.</span></p>
             <div className="flex gap-3">
               <button onClick={() => setShowExitConfirmation(false)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors">Cancel</button>
               <button onClick={() => { abandonSession(); setShowExitConfirmation(false); }} className="flex-1 py-3 bg-red-900/50 hover:bg-red-800/50 border border-red-800/50 rounded-xl text-red-200 hover:text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-900/20 transition-all">Confirm Exit</button>
             </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-24 md:bottom-auto md:top-24 left-1/2 -translate-x-1/2 z-[60] w-[90%] max-w-md pointer-events-none">
          <div className="mx-auto bg-red-950/95 border border-red-500/50 text-red-100 px-4 py-3 rounded-2xl shadow-[0_0_30px_rgba(239,68,68,0.6)] backdrop-blur-xl flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3 animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-top-4 duration-300">
             <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" /><span className="text-xs md:text-sm font-bold uppercase tracking-wider text-center leading-tight break-words">{toast.message}</span>
          </div>
        </div>
      )}

      { (gameStatus === 'VICTORY' || gameStatus === 'DEFEAT') && (
        <div className="absolute inset-0 z-[80] bg-black/80 backdrop-blur-lg flex items-center justify-center pointer-events-auto p-4 animate-in fade-in duration-500">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-lg w-full text-center relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${gameStatus === 'VICTORY' ? 'from-transparent via-amber-500 to-transparent' : 'from-transparent via-red-500 to-transparent'}`}></div>
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 border-2 ${gameStatus === 'VICTORY' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                    {gameStatus === 'VICTORY' ? <Trophy className="w-8 h-8 text-amber-500" /> : <Shield className="w-8 h-8 text-red-500" />}
                </div>
                <h2 className={`text-4xl font-black mb-2 uppercase tracking-wider ${gameStatus === 'VICTORY' ? 'text-amber-400' : 'text-red-500'}`}>
                    {gameStatus}
                </h2>
                <p className="text-slate-400 text-sm mb-8">{winCondition?.label} Objective {gameStatus === 'VICTORY' ? 'Achieved' : 'Failed'}.</p>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-8 flex justify-around text-left">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Session Time</span>
                        <span className="text-white font-mono font-bold text-lg">{formatTime(Date.now() - sessionStartTime)}</span>
                    </div>
                    <div className="w-px bg-slate-800"></div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Credits</span>
                        <span className="text-amber-400 font-mono font-bold text-lg">{player.totalCoinsEarned}</span>
                    </div>
                    <div className="w-px bg-slate-800"></div>
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Final Rank</span>
                        <span className="text-indigo-400 font-mono font-bold text-lg">L{player.playerLevel}</span>
                    </div>
                </div>

                <div className="flex gap-4">
                    <button onClick={abandonSession} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 font-bold text-xs uppercase tracking-wider transition-colors">
                        Main Menu
                    </button>
                    <button onClick={() => { abandonSession(); setUIState('LEADERBOARD'); }} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-indigo-500/20 transition-colors">
                        View Leaderboard
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default GameView;