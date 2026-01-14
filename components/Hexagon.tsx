

import React, { useEffect, useRef, useMemo } from 'react';
import { Group, Path, Shape } from 'react-konva';
import Konva from 'konva';
import { Hex } from '../types.ts';
import { HEX_SIZE } from '../rules/config.ts';
import { getSecondsToGrow, hexToPixel } from '../services/hexUtils.ts';
import { useGameStore } from '../store.ts';

interface HexagonVisualProps {
  hex: Hex;
  rotation: number;
  isPlayerNeighbor: boolean;
  playerRank: number;
  isOccupied: boolean;
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

const HexagonVisual: React.FC<HexagonVisualProps> = React.memo(({ hex, rotation, isPlayerNeighbor, playerRank, isOccupied, onHexClick, onHover }) => {
  const groupRef = useRef<Konva.Group>(null);
  
  const { x, y } = hexToPixel(hex.q, hex.r, rotation);
  const levelIndex = Math.min(hex.maxLevel, 11);
  const colorSet = LEVEL_COLORS[levelIndex] || LEVEL_COLORS[0];

  let fillColor = colorSet.fill;
  let strokeColor = colorSet.stroke;
  let sideColor = colorSet.side;
  let strokeWidth = 1;

  if (isPlayerNeighbor) {
    strokeColor = '#3b82f6';
    strokeWidth = 2;
  }

  const hexHeight = 10 + (hex.maxLevel * 6);
  const offsetY = -hexHeight;

  const isGrowing = hex.progress > 0;
  const targetLevel = hex.currentLevel + 1;
  const neededSeconds = getSecondsToGrow(targetLevel) || 1;
  const progressPercent = Math.min(1, hex.progress / neededSeconds);
  const isLocked = hex.maxLevel > playerRank;

  // Calculate points for geometry
  const { topPoints, sortedFaces } = useMemo(() => {
    const getPoint = (i: number, cy: number) => {
        const angle_deg = 60 * i + 30;
        const angle_rad = (angle_deg * Math.PI) / 180 + (rotation * Math.PI) / 180;
        return {
            x: HEX_SIZE * Math.cos(angle_rad),
            y: cy + HEX_SIZE * Math.sin(angle_rad) * 0.8 // Squash Y
        };
    };

    const tops = [];
    const bottoms = [];
    const faces = [];

    // Generate vertices
    for (let i = 0; i < 6; i++) {
        tops.push(getPoint(i, offsetY));
        bottoms.push(getPoint(i, 0));
    }

    // Generate Face Quads (Walls)
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
    const topPathPoints = tops.flatMap(p => [p.x, p.y]);

    return { topPoints: topPathPoints, sortedFaces: faces };
  }, [rotation, offsetY]);


  const handleClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    // Only allow Left Click (button 0). Button 2 is Right Click (Rotate).
    // Touch events don't have 'button' property and are treated as primary interactions.
    if ('button' in e.evt) {
        if (e.evt.button !== 0) return; 
    }
    onHexClick(hex.q, hex.r);
  };

  useEffect(() => {
    if (!groupRef.current) return;
    const node = groupRef.current;
    const layer = node.getLayer();
    
    if (isGrowing && layer) {
       const anim = new Konva.Animation((frame) => {
          const scale = 1 + (Math.sin(frame!.time / 200) * 0.05);
          node.scaleY(scale);
       }, layer);
       anim.start();
       return () => { 
           anim.stop(); 
           // Ensure we snap back to scale 1 immediately when growth stops to prevent "hanging" scale
           node.scale({x: 1, y: 1}); 
       };
    } else {
        node.scale({x: 1, y: 1});
    }
  }, [isGrowing]);

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
      {/* 1. WALLS (Sorted back-to-front) */}
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

      {/* 2. TOP CAP (Always on top) */}
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
            sceneFunc={(ctx, shape) => {
                ctx.beginPath();
                ctx.moveTo(-15, 0);
                ctx.lineTo(15, 0);
                ctx.strokeStyle = "rgba(0,0,0,0.8)";
                ctx.lineWidth = 6;
                ctx.lineCap = "round";
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(-15, 0);
                ctx.lineTo(-15 + (30 * progressPercent), 0);
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
  isPlayerNeighbor: boolean;
  playerRank: number; 
  isOccupied: boolean;
  onHexClick: (q: number, r: number) => void;
  onHover: (id: string | null) => void;
}

const SmartHexagon: React.FC<SmartHexagonProps> = React.memo((props) => {
  const hex = useGameStore(state => state.session?.grid[props.id]);
  if (!hex) return null;
  return <HexagonVisual hex={hex} {...props} />;
});

export default SmartHexagon;