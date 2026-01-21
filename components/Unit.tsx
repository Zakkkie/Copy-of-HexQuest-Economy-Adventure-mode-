

import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { Group, Circle, Ellipse, Rect, Text } from 'react-konva';
import Konva from 'konva';
import { useGameStore } from '../store.ts';
import { hexToPixel } from '../services/hexUtils.ts';
import { EntityType } from '../types.ts';
import { GAME_CONFIG } from '../rules/config.ts';

interface UnitProps {
  q: number;
  r: number;
  type: EntityType;
  color?: string; 
  rotation: number;
  hexLevel: number;
  totalCoinsEarned: number;
  onMoveComplete?: (x: number, y: number, color: string) => void;
}

// --- TRAIL (GHOST) COMPONENT ---
// Renders a fading echo of the unit at its previous position
const TrailShadow: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => {
    const ref = useRef<Konva.Group>(null);

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;

        // Animate fading out
        const tween = new Konva.Tween({
            node: node,
            opacity: 0,
            scaleX: 0.8, // Slight shrink
            scaleY: 0.8,
            duration: GAME_CONFIG.MOVEMENT_ANIMATION_DURATION, // Match move duration
            easing: Konva.Easings.EaseOut
        });
        tween.play();

        return () => tween.destroy();
    }, []);

    return (
        <Group ref={ref} x={x} y={y} opacity={0.4} listening={false}>
             {/* Simplified Body Shape for Trail */}
             <Rect
                x={-6} y={-10} 
                width={12} height={20}
                fill={color}
                cornerRadius={4}
                offsetY={8} // Center the scaling roughly
            />
        </Group>
    );
};

const CoinPopup: React.FC<{ amount: number; y: number }> = ({ amount, y }) => {
  const groupRef = useRef<Konva.Group>(null);

  useEffect(() => {
    const node = groupRef.current;
    if (!node) return;

    node.opacity(0);
    node.scale({ x: 0.5, y: 0.5 });
    node.y(y);

    const tween = new Konva.Tween({
      node: node,
      y: y - 50,
      opacity: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1.2,
      easing: Konva.Easings.EaseOut,
    });

    node.to({ opacity: 1, scaleX: 1, scaleY: 1, duration: 0.2 });
    tween.play();

    return () => tween.destroy();
  }, [y]);

  return (
    <Group ref={groupRef} listening={false}>
      <Circle radius={10} fill="#fbbf24" stroke="#d97706" strokeWidth={2} />
      <Text text="$" fontSize={12} fontStyle="bold" fill="#78350f" x={-4} y={-5} />
      <Text
        text={`+${amount}`}
        x={14} y={-6}
        fontSize={14} fontFamily="monospace" fontStyle="bold" fill="#fbbf24"
        shadowColor="black" shadowBlur={2} shadowOpacity={0.8} shadowOffset={{x: 1, y: 1}}
      />
    </Group>
  );
};

const Unit: React.FC<UnitProps> = React.memo(({ q, r, type, color, rotation, hexLevel, totalCoinsEarned, onMoveComplete }) => {
  const groupRef = useRef<Konva.Group>(null);
  const elevationGroupRef = useRef<Konva.Group>(null);
  const bodyRef = useRef<Konva.Group>(null);

  const user = useGameStore(state => state.user);
  
  // Visual State
  const [coinPopups, setCoinPopups] = useState<{ id: number; amount: number }[]>([]);
  const [trails, setTrails] = useState<{ id: number; x: number; y: number }[]>([]);
  
  const prevCoinsRef = useRef(totalCoinsEarned);

  // Target Calc
  const { x, y } = hexToPixel(q, r, rotation);
  const hexHeight = 10 + (hexLevel * 6);
  const zOffset = -hexHeight;

  // Logic Tracking for Move Detection
  const prevLogic = useRef({ q, r });
  
  const isPlayer = type === EntityType.PLAYER;
  const finalColor = color || (isPlayer ? (user?.avatarColor || '#3b82f6') : '#ef4444');

  // Coins Logic
  useEffect(() => {
    const diff = totalCoinsEarned - prevCoinsRef.current;
    if (diff > 0) {
      const id = Date.now() + Math.random();
      setCoinPopups(prev => [...prev, { id, amount: diff }]);
      setTimeout(() => setCoinPopups(prev => prev.filter(p => p.id !== id)), 1200);
    }
    prevCoinsRef.current = totalCoinsEarned;
  }, [totalCoinsEarned]);

  // IDLE BREATHING ANIMATION
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;

    const anim = new Konva.Animation((frame) => {
        if (!frame) return;
        // Subtle sine wave scaling (1.0 to 1.05)
        const scale = 1 + Math.sin(frame.time / 400) * 0.04;
        node.scale({ x: scale, y: scale });
    }, node.getLayer());

    anim.start();
    return () => {
      anim.stop();
    };
  }, []);

  // MOVEMENT & TRAIL LOGIC
  useLayoutEffect(() => {
    const node = groupRef.current;
    const elevationNode = elevationGroupRef.current;
    if (!node || !elevationNode) return;

    const isMove = prevLogic.current.q !== q || prevLogic.current.r !== r;

    // --- 1. HORIZONTAL MOVEMENT ---
    if (isMove) {
        if (node.x() === 0 && node.y() === 0) {
            // First render: Snap
            node.position({ x, y });
        } else {
            // MOVEMENT DETECTED
            
            // A. Spawn Trail at OLD position (Visual X/Y is handled by groupRef)
            // We need to account for height offset in the trail if we want it to look 3D,
            // but trails are usually 'ghosts' of the body.
            // Current visual Y of body = node.y() + elevationNode.y().
            const startX = node.x();
            const startY = node.y(); // This is the HEX center Y.
            const startZ = elevationNode.y(); // This is the vertical offset.
            
            const tId = Date.now() + Math.random();
            // Spawn trail at the specific height it was at
            setTrails(prev => [...prev, { id: tId, x: startX, y: startY + startZ }]);
            
            // Cleanup trail
            setTimeout(() => {
                setTrails(prev => prev.filter(t => t.id !== tId));
            }, GAME_CONFIG.MOVEMENT_ANIMATION_DURATION * 1000 + 100);

            // B. Tween to NEW position
            node.to({
                x,
                y,
                duration: GAME_CONFIG.MOVEMENT_ANIMATION_DURATION, 
                easing: Konva.Easings.EaseInOut, 
                onFinish: () => {
                   if (onMoveComplete) onMoveComplete(x, y + zOffset, finalColor);
                }
            });
        }
    } else {
        // Camera Rotation (Snap)
        node.position({ x, y });
    }

    // --- 2. VERTICAL MOVEMENT (Terrain) ---
    elevationNode.to({
        y: zOffset,
        duration: GAME_CONFIG.MOVEMENT_ANIMATION_DURATION,
        easing: Konva.Easings.EaseInOut
    });

    prevLogic.current = { q, r };
  }, [x, y, q, r, zOffset, finalColor, onMoveComplete]);

  return (
    <Group>
      {/* 1. TRAILS (Rendered behind the unit locally, though Z-ordering depends on Layer sort) */}
      {/* Note: In a strict Z-buffer, these should be separate, but here they trail visually behind the movement vector usually. */}
      {trails.map(t => (
          <TrailShadow key={t.id} x={t.x} y={t.y} color={finalColor} />
      ))}

      {/* 2. MAIN UNIT GROUP */}
      <Group ref={groupRef} listening={false}>
        <Group ref={elevationGroupRef}>
            {/* Shadow */}
            <Ellipse
               x={0} y={0} radiusX={10} radiusY={6}
               fill="rgba(0,0,0,0.4)" blurRadius={2}
            />

            {/* Body (Breathable) */}
            <Group y={-8} ref={bodyRef}>
              <Rect
                  x={-6} y={-10} width={12} height={20}
                  fill={finalColor} cornerRadius={4}
                  shadowColor="black" shadowBlur={5} shadowOpacity={0.3}
              />
              <Circle
                  y={-14} radius={8} fill={finalColor}
                  stroke="rgba(255,255,255,0.4)" strokeWidth={2}
              />
              <Circle
                  y={-14} x={-2} radius={2} fill="white" opacity={0.5}
              />
            </Group>

            {/* Selection Ring (Static relative to body breathing) */}
            {isPlayer && (
              <Ellipse
                  y={0} radiusX={16} radiusY={10}
                  stroke="white" strokeWidth={1}
                  opacity={0.6} dash={[4, 4]}
              />
            )}
            
            {/* Coin Popups */}
            {coinPopups.map(p => (
              <CoinPopup key={p.id} amount={p.amount} y={-35} />
            ))}
        </Group>
      </Group>
    </Group>
  );
});

export default Unit;