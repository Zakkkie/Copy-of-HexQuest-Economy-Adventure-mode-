
import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { Group, Circle, Ellipse, Rect, Text } from 'react-konva';
import Konva from 'konva';
import { useGameStore } from '../store.ts';
import { hexToPixel } from '../services/hexUtils.ts';
import { EntityType } from '../types.ts';

interface UnitProps {
  q: number;
  r: number;
  type: EntityType;
  color?: string; 
  rotation: number;
  hexLevel: number;
  totalCoinsEarned: number;
}

const CoinPopup: React.FC<{ amount: number; y: number }> = ({ amount, y }) => {
  const groupRef = useRef<Konva.Group>(null);

  useEffect(() => {
    const node = groupRef.current;
    if (!node) return;

    // Initial State
    node.opacity(0);
    node.scale({ x: 0.5, y: 0.5 });
    node.y(y);

    const tween = new Konva.Tween({
      node: node,
      y: y - 50, // Move up
      opacity: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1.2,
      easing: Konva.Easings.EaseOut,
      onFinish: () => {
        // Cleanup handled by parent unmounting
      }
    });

    // Start slightly visible
    node.to({ opacity: 1, scaleX: 1, scaleY: 1, duration: 0.2 });
    
    tween.play();

    return () => {
      tween.destroy();
    };
  }, [y]);

  return (
    <Group ref={groupRef} listening={false}>
      {/* Coin Circle */}
      <Circle
        radius={10}
        fill="#fbbf24" // Amber-400
        stroke="#d97706" // Amber-600
        strokeWidth={2}
        shadowColor="#fbbf24"
        shadowBlur={10}
        shadowOpacity={0.5}
      />
      {/* Inner Detail */}
      <Text 
        text="$"
        fontSize={12}
        fontStyle="bold"
        fill="#78350f"
        x={-4}
        y={-5}
      />
      {/* Amount Text */}
      <Text
        text={`+${amount}`}
        x={14}
        y={-6}
        fontSize={14}
        fontFamily="monospace"
        fontStyle="bold"
        fill="#fbbf24"
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={0.8}
        shadowOffset={{x: 1, y: 1}}
      />
    </Group>
  );
};

const Unit: React.FC<UnitProps> = ({ q, r, type, color, rotation, hexLevel, totalCoinsEarned }) => {
  const groupRef = useRef<Konva.Group>(null); // Handles X, Y (Base Position)
  const elevationGroupRef = useRef<Konva.Group>(null); // Handles Z (Height Offset)
  const posTweenRef = useRef<Konva.Tween | null>(null);
  const heightTweenRef = useRef<Konva.Tween | null>(null);

  const user = useGameStore(state => state.user);
  
  // Coin Animation State
  const [coinPopups, setCoinPopups] = useState<{ id: number; amount: number }[]>([]);
  const prevCoinsRef = useRef(totalCoinsEarned);

  // Calculate target screen position
  const { x, y } = hexToPixel(q, r, rotation);
  const hexHeight = 10 + (hexLevel * 6);
  const zOffset = -hexHeight;

  // Track previous props to distinguish Move vs Rotation
  const prevProps = useRef({ q, r, rotation, zOffset });

  // Detect Coin Gain
  useEffect(() => {
    const diff = totalCoinsEarned - prevCoinsRef.current;
    if (diff > 0) {
      const id = Date.now() + Math.random();
      setCoinPopups(prev => [...prev, { id, amount: diff }]);
      setTimeout(() => {
        setCoinPopups(prev => prev.filter(p => p.id !== id));
      }, 1200);
    }
    prevCoinsRef.current = totalCoinsEarned;
  }, [totalCoinsEarned]);

  // Handle Position & Height Animation
  useLayoutEffect(() => {
    const node = groupRef.current;
    const elevationNode = elevationGroupRef.current;
    if (!node || !elevationNode) return;

    const isMove = prevProps.current.q !== q || prevProps.current.r !== r;
    const isHeightChange = prevProps.current.zOffset !== zOffset;
    const isRotation = prevProps.current.rotation !== rotation;

    // --- 1. HORIZONTAL TWEEN (X, Y) ---
    if (posTweenRef.current) {
        if (isRotation) posTweenRef.current.finish();
        else posTweenRef.current.destroy();
        posTweenRef.current = null;
    }

    if (isMove) {
        posTweenRef.current = new Konva.Tween({
            node: node,
            x,
            y,
            duration: 0.3,
            easing: Konva.Easings.EaseInOut,
            onFinish: () => { posTweenRef.current = null; }
        });
        posTweenRef.current.play();
    } else {
        node.position({ x, y });
    }

    // --- 2. VERTICAL TWEEN (Z / Height) ---
    // If the unit moves up/down or the hex grows under it
    if (heightTweenRef.current) {
        heightTweenRef.current.destroy();
        heightTweenRef.current = null;
    }

    if (isHeightChange || (isMove && prevProps.current.zOffset !== zOffset)) {
         // Smoothly animate height to avoid "clipping" or "falling through"
         heightTweenRef.current = new Konva.Tween({
            node: elevationNode,
            y: zOffset,
            duration: 0.3, // Sync with movement
            easing: Konva.Easings.EaseInOut,
             onFinish: () => { heightTweenRef.current = null; }
         });
         heightTweenRef.current.play();
    } else {
         elevationNode.y(zOffset);
    }

    prevProps.current = { q, r, rotation, zOffset };
  }, [x, y, q, r, rotation, zOffset]);

  const isPlayer = type === EntityType.PLAYER;
  const finalColor = color || (isPlayer ? (user?.avatarColor || '#3b82f6') : '#ef4444');

  return (
    <Group ref={groupRef} listening={false}>
      
      {/* Elevation Group handles vertical offset (Z-axis) */}
      <Group ref={elevationGroupRef}>
          {/* 1. DROP SHADOW (On top of hex, below unit) */}
          <Ellipse
             x={0}
             y={0}
             radiusX={10}
             radiusY={6}
             fill="rgba(0,0,0,0.4)"
             blurRadius={2}
          />

          {/* 2. UNIT BODY */}
          <Group y={-8}>
            <Rect
                x={-6}
                y={-10}
                width={12}
                height={20}
                fill={finalColor}
                cornerRadius={4}
                shadowColor="black"
                shadowBlur={5}
                shadowOpacity={0.3}
            />
            <Circle
                y={-14}
                radius={8}
                fill={finalColor}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2}
            />
            <Circle
                y={-14}
                x={-2}
                radius={2}
                fill="white"
                opacity={0.5}
            />
          </Group>

          {/* 3. SELECTION RING */}
          {isPlayer && (
            <Ellipse
                y={0}
                radiusX={16}
                radiusY={10}
                stroke="white"
                strokeWidth={1}
                opacity={0.6}
                dash={[4, 4]}
            />
          )}
          
          {/* 4. COIN POPUPS */}
          {coinPopups.map(p => (
            <CoinPopup key={p.id} amount={p.amount} y={-35} />
          ))}
      </Group>
    </Group>
  );
};

export default Unit;
