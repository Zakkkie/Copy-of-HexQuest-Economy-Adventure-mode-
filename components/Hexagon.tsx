


import React, { useEffect, useRef, useMemo } from 'react';
import { Group, Path, Shape, Circle } from 'react-konva';
import Konva from 'konva';
import { Hex } from '../types.ts';
import { HEX_SIZE, GAME_CONFIG } from '../rules/config.ts';
import { getSecondsToGrow, hexToPixel } from '../services/hexUtils.ts';
import { useGameStore } from '../store.ts';

interface HexagonVisualProps {
  hex: Hex;
  rotation: number;
  playerRank: number;
  isOccupied: boolean;
  isSelected: boolean; 
  onHexClick: (q: number, r: number) => void;
  onHover: (id: string | null) => void;
}

const LEVEL_COLORS: Record<number, { fill: string; stroke: string; side: string }> = {
  0: { fill: '#1e293b', stroke: '#334155', side: '#0f172a' }, 
  1: { fill: '#1e3a8a', stroke: '#3b82f6', side: '#172554' }, 
  2: { fill: '#065f46', stroke: '#10b981', side: '#064e3b' }, 
  3: { fill: '#155e75', stroke: '#06b6d4', side: '#0e7490' }, 
  4: { fill: '#3f6212', stroke: '#84cc16', side: '#1a2e05' }, 
  5: { fill: '#92400e', stroke: '#f59e0b', side: '#451a03' }, 
  6: { fill: '#9a3412', stroke: '#ea580c', side: '#431407' }, 
  7: { fill: '#991b1b', stroke: '#dc2626', side: '#450a0a' }, 
  8: { fill: '#831843', stroke: '#db2777', side: '#500724' }, 
  9: { fill: '#581c87', stroke: '#9333ea', side: '#3b0764' }, 
  10: { fill: '#4c1d95', stroke: '#a855f7', side: '#2e1065' }, 
  11: { fill: '#0f172a', stroke: '#f8fafc', side: '#020617' },
};

const LOCK_PATH = "M12 1a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v2H9V6a3 3 0 0 1 3-3z";

// Determine crater positions based on damage (0 to 6)
// Deterministic random to ensure craters don't move between renders
const getCraters = (q: number, r: number, damage: number, offsetY: number) => {
    if (damage <= 0) return [];
    
    // Simple deterministic seed
    const seed = Math.abs((q * 73856093) ^ (r * 19349663));
    const rand = (index: number, mod: number) => ((seed + index * 12345) % mod) / mod;
    
    const craters: { x: number, y: number, r: number, opacity: number }[] = [];
    const maxRadius = HEX_SIZE * 0.7; // Stay within hex bounds

    // Generate N craters where N corresponds roughly to damage level
    // We add more randomness to positions
    const count = Math.ceil(damage * 1.5); 

    for (let i = 0; i < count; i++) {
        const angle = rand(i, 360) * Math.PI * 2;
        // Distribute craters randomly but biased towards center as damage increases? 
        // Actually random spread is better for "wear and tear".
        const dist = rand(i + 10, 100) * maxRadius * 0.8;
        
        const x = Math.cos(angle) * dist;
        const y = offsetY + (Math.sin(angle) * dist * 0.7); // Squash Y for perspective

        // Size grows slightly with damage level to indicate severity
        // Base size 2-4, plus up to 3 based on damage
        const sizeBase = 2 + rand(i + 50, 3); 
        const sizeBonus = (damage > 3) ? (damage - 3) : 0;
        
        craters.push({
            x,
            y,
            r: sizeBase + sizeBonus,
            opacity: 0.3 + (rand(i + 20, 4) * 0.3) // Varying depth
        });
    }
    
    return craters;
};

const HexagonVisual: React.FC<HexagonVisualProps> = React.memo(({ hex, rotation, playerRank, isOccupied, isSelected, onHexClick, onHover }) => {
  const groupRef = useRef<Konva.Group>(null);
  const progressShapeRef = useRef<Konva.Shape>(null);
  const selectionRef = useRef<Konva.Path>(null);
  const voidGroupRef = useRef<Konva.Group>(null);
  
  // Track previous state to trigger animations
  const prevStructureRef = useRef(hex.structureType);
  
  const { x, y } = hexToPixel(hex.q, hex.r, rotation);
  const isVoid = hex.structureType === 'VOID';
  const levelIndex = isVoid ? 0 : Math.min(hex.maxLevel, 11);
  const colorSet = LEVEL_COLORS[levelIndex] || LEVEL_COLORS[0];

  let fillColor = isVoid ? '#020617' : colorSet.fill;
  let strokeColor = isVoid ? '#0f172a' : colorSet.stroke;
  let sideColor = isVoid ? '#000000' : colorSet.side;
  let strokeWidth = isVoid ? 0 : 1;

  const hexHeight = isVoid ? 2 : (10 + (hex.maxLevel * 6));
  const offsetY = -hexHeight;

  const isGrowing = hex.progress > 0 && !isVoid;
  const targetLevel = hex.currentLevel + 1;
  const neededSeconds = getSecondsToGrow(targetLevel) || 1;
  const progressPercent = Math.min(1, hex.progress / neededSeconds);
  const isLocked = hex.maxLevel > playerRank;
  
  // Durability Logic
  const isFragile = hex.maxLevel === 1 && !isVoid;
  const maxLives = GAME_CONFIG.L1_HEX_MAX_DURABILITY; // Now 6
  const currentLives = hex.durability !== undefined ? hex.durability : maxLives;
  const damage = Math.max(0, maxLives - currentLives);

  // Geometry Calculation
  const { topPoints, sortedFaces, selectionPathData, craters } = useMemo(() => {
    const getPoint = (i: number, cy: number, radius: number = HEX_SIZE) => {
        const angle_deg = 60 * i + 30;
        const angle_rad = (angle_deg * Math.PI) / 180 + (rotation * Math.PI) / 180;
        return {
            x: radius * Math.cos(angle_rad),
            y: cy + radius * Math.sin(angle_rad) * 0.8 // Squash Y
        };
    };

    const tops = [];
    const bottoms = [];
    const faces = [];
    const selectionTops = [];
    const selRadius = Math.max(0, HEX_SIZE - 3);

    for (let i = 0; i < 6; i++) {
        tops.push(getPoint(i, offsetY, HEX_SIZE));
        bottoms.push(getPoint(i, 0, HEX_SIZE));
        selectionTops.push(getPoint(i, offsetY, selRadius));
    }

    if (!isVoid) {
        for (let i = 0; i < 6; i++) {
            const next = (i + 1) % 6;
            const facePoints = [
                tops[i].x, tops[i].y,
                tops[next].x, tops[next].y,
                bottoms[next].x, bottoms[next].y,
                bottoms[i].x, bottoms[i].y
            ];
            const avgY = (tops[i].y + tops[next].y + bottoms[next].y + bottoms[i].y) / 4;
            faces.push({ points: facePoints, depth: avgY });
        }
        faces.sort((a, b) => a.depth - b.depth);
    }

    const topPathPoints = tops.flatMap(p => [p.x, p.y]);
    const sp = selectionTops;
    const selectionPathData = `M ${sp[0].x} ${sp[0].y} L ${sp[1].x} ${sp[1].y} L ${sp[2].x} ${sp[2].y} L ${sp[3].x} ${sp[3].y} L ${sp[4].x} ${sp[4].y} L ${sp[5].x} ${sp[5].y} Z`;

    const craters = isFragile ? getCraters(hex.q, hex.r, damage, offsetY) : [];

    return { topPoints: topPathPoints, sortedFaces: faces, selectionPathData, craters };
  }, [rotation, offsetY, isVoid, isFragile, damage, hex.q, hex.r]);


  // CLICK HANDLER
  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (isVoid) return;
    if ('button' in e.evt) {
        if (e.evt.button !== 0) return; 
    }
    onHexClick(hex.q, hex.r);
  };

  // GROWING ANIMATION
  useEffect(() => {
    if (!groupRef.current) return;
    const node = groupRef.current;
    
    if (isGrowing) {
       const anim = new Konva.Animation((frame) => {
          const scale = 1 + (Math.sin(frame!.time / 200) * 0.05);
          node.scaleY(scale);
       }, node.getLayer());
       anim.start();
       return () => { anim.stop(); node.scale({x: 1, y: 1}); };
    } else {
        node.scale({x: 1, y: 1});
    }
  }, [isGrowing]);

  // PROGRESS BAR
  useEffect(() => {
      const shape = progressShapeRef.current;
      if (shape && isGrowing) {
          const tween = new Konva.Tween({
              node: shape, duration: 0.95, visualProgress: progressPercent, easing: Konva.Easings.Linear
          });
          tween.play();
          return () => tween.destroy();
      }
  }, [progressPercent, isGrowing]);

  // SELECTION PULSE
  useEffect(() => {
      const selectionNode = selectionRef.current;
      if (selectionNode && isSelected) {
          selectionNode.strokeWidth(1.5);
          selectionNode.opacity(0.6);
          const tween = new Konva.Tween({
              node: selectionNode, duration: 1.0, shadowBlur: 15, opacity: 1, strokeWidth: 2, yoyo: true, repeat: -1, easing: Konva.Easings.EaseInOut,
          });
          tween.play();
          return () => { tween.destroy(); }
      }
  }, [isSelected]);

  // COLLAPSE ANIMATION (Transition to VOID)
  useEffect(() => {
      const wasVoid = prevStructureRef.current === 'VOID';
      const nowVoid = hex.structureType === 'VOID';
      
      if (!wasVoid && nowVoid) {
          const node = voidGroupRef.current;
          if (node) {
              node.scale({ x: 1, y: 1 });
              node.y(y); // Start at normal position
              node.opacity(1);

              // Fall down effect
              const tween = new Konva.Tween({
                  node: node,
                  duration: 0.6,
                  y: y + 30, // Drop down
                  scaleX: 0.8,
                  scaleY: 0.8,
                  opacity: 0.5,
                  easing: Konva.Easings.EaseIn
              });
              tween.play();
          }
      }
      prevStructureRef.current = hex.structureType;
  }, [hex.structureType, y]);

  // --- RENDER VOID ---
  if (isVoid) {
      return (
        <Group ref={voidGroupRef} x={x} y={y}>
            <Path
                 data={`M ${topPoints[0]} ${topPoints[1]} L ${topPoints[2]} ${topPoints[3]} L ${topPoints[4]} ${topPoints[5]} L ${topPoints[6]} ${topPoints[7]} L ${topPoints[8]} ${topPoints[9]} L ${topPoints[10]} ${topPoints[11]} Z`}
                 fill="#020617"
                 stroke="#0f172a"
                 strokeWidth={2}
                 perfectDrawEnabled={false}
                 shadowColor="black"
                 shadowBlur={0}
                 opacity={0.8}
            />
            {/* Inner "Void" Depth */}
            <Path
                 data={`M -15 -8 L 15 -8 L 0 15 Z`}
                 fill="black"
                 scaleX={0.8}
                 scaleY={0.5}
                 opacity={0.6}
                 blurRadius={4}
            />
        </Group>
      );
  }

  // --- RENDER STANDARD HEX ---
  return (
    <Group 
      ref={groupRef}
      x={x} 
      y={y} 
      onClick={handleClick}
      onTap={handleClick}
      onMouseEnter={() => onHover(hex.id)}
      onMouseLeave={() => onHover(null)}
      onTouchStart={() => onHover(hex.id)}
      onTouchEnd={() => onHover(null)}
      listening={true}
    >
      {/* 1. WALLS */}
      {sortedFaces.map((face, i) => (
          <Path
            key={i}
            data={`M ${face.points[0]} ${face.points[1]} L ${face.points[2]} ${face.points[3]} L ${face.points[4]} ${face.points[5]} L ${face.points[6]} ${face.points[7]} Z`}
            fill={sideColor}
            stroke={sideColor}
            strokeWidth={1}
            closed={true}
            perfectDrawEnabled={false}
          />
      ))}

      {/* 2. TOP CAP */}
      <Path
         data={`M ${topPoints[0]} ${topPoints[1]} L ${topPoints[2]} ${topPoints[3]} L ${topPoints[4]} ${topPoints[5]} L ${topPoints[6]} ${topPoints[7]} L ${topPoints[8]} ${topPoints[9]} L ${topPoints[10]} ${topPoints[11]} Z`}
         fill={fillColor}
         stroke={strokeColor}
         strokeWidth={strokeWidth}
         perfectDrawEnabled={false}
         shadowColor="black"
         shadowBlur={10}
         shadowOpacity={0.5}
         shadowOffset={{x: 0, y: 10}}
      />

      {/* 2.5 CRATERS (Level 1 Damage) */}
      {isFragile && craters.map((c, i) => (
          <Circle
            key={`crater-${i}`}
            x={c.x}
            y={c.y}
            radius={c.r}
            fill="rgba(0,0,0,0.4)" // Dark pockmark
            shadowColor="white"
            shadowBlur={0}
            shadowOffset={{x: 0, y: 1}} // Fake highlight at bottom edge (embossed look)
            shadowOpacity={0.1}
            opacity={c.opacity}
            scaleY={0.6} // Squash to match perspective
          />
      ))}

      {/* 3. SELECTION */}
      {isSelected && (
          <Path
            ref={selectionRef}
            data={selectionPathData}
            stroke="#22d3ee"
            strokeWidth={1.5}
            fillEnabled={false}
            perfectDrawEnabled={false}
            shadowColor="#22d3ee"
            shadowBlur={5}
            shadowOpacity={1}
            listening={false}
          />
      )}

      {isLocked && (
        <Group x={0} y={offsetY - 5} opacity={0.9} listening={false}>
          <Path
            data={LOCK_PATH}
            x={-12}
            y={-12}
            scaleX={1.2}
            scaleY={1.2}
            fill="white"
            shadowColor="black"
            shadowBlur={5}
          />
        </Group>
      )}
      {isGrowing && (
        <Group x={0} y={offsetY - 15} listening={false}>
          <Shape
            ref={progressShapeRef}
            visualProgress={progressPercent}
            sceneFunc={(ctx, shape) => {
                const p = shape.getAttr('visualProgress') || 0;
                ctx.beginPath();
                ctx.moveTo(-15, 0);
                ctx.lineTo(15, 0);
                ctx.strokeStyle = "rgba(0,0,0,0.8)";
                ctx.lineWidth = 6;
                ctx.lineCap = "round";
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-15, 0);
                ctx.lineTo(-15 + (30 * p), 0);
                ctx.strokeStyle = isLocked ? "#f59e0b" : "#10b981";
                ctx.lineWidth = 4;
                ctx.lineCap = "round";
                ctx.stroke();
            }}
          />
        </Group>
      )}
    </Group>
  );
});

interface SmartHexagonProps {
  id: string;
  rotation: number;
  playerRank: number; 
  isOccupied: boolean;
  isSelected: boolean; 
  onHexClick: (q: number, r: number) => void;
  onHover: (id: string | null) => void;
}

const SmartHexagon: React.FC<SmartHexagonProps> = React.memo((props) => {
  const hex = useGameStore(state => state.session?.grid[props.id]);
  if (!hex) return null;
  return <HexagonVisual hex={hex} {...props} />;
});

export default SmartHexagon;