
import React from 'react';

interface HexButtonProps {
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  variant?: 'blue' | 'amber' | 'emerald' | 'slate' | 'red';
  size?: 'sm' | 'md' | 'lg';
  progress?: number; // 0 to 100
  className?: string;
  pulsate?: boolean;
}

const HexButton: React.FC<HexButtonProps> = ({ 
  onClick, children, active, disabled, variant = 'slate', size = 'md', progress = 0, className = '', pulsate = false
}) => {
  
  // Dimensions
  const sizeMap = {
    sm: 48,
    md: 72,
    lg: 88 // Slightly smaller than previous 96 to fit two side-by-side comfortably
  };
  const s = sizeMap[size];
  
  // NEON / GLASS Configuration
  const colors = {
    slate:   { 
      stop1: 'rgba(148, 163, 184, 0.1)', stop2: 'rgba(15, 23, 42, 0.4)', 
      stroke: '#475569', highlight: '#94a3b8', glow: 'rgba(148, 163, 184, 0.1)' 
    },
    blue:    { 
      stop1: 'rgba(56, 189, 248, 0.2)', stop2: 'rgba(3, 105, 161, 0.4)', 
      stroke: '#0ea5e9', highlight: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.6)' 
    }, // Electric Cyan
    amber:   { 
      stop1: 'rgba(251, 191, 36, 0.2)', stop2: 'rgba(180, 83, 9, 0.4)', 
      stroke: '#f59e0b', highlight: '#fde68a', glow: 'rgba(245, 158, 11, 0.6)' 
    }, // Bright Gold
    emerald: { 
      stop1: 'rgba(52, 211, 153, 0.2)', stop2: 'rgba(6, 95, 70, 0.4)', 
      stroke: '#10b981', highlight: '#6ee7b7', glow: 'rgba(16, 185, 129, 0.6)' 
    }, // Neon Green
    red:     { 
      stop1: 'rgba(248, 113, 113, 0.2)', stop2: 'rgba(153, 27, 27, 0.4)', 
      stroke: '#ef4444', highlight: '#fca5a5', glow: 'rgba(239, 68, 68, 0.6)' 
    }, // Laser Red
  };
  
  const c = colors[variant];
  
  // Hexagon Path (Normalized to 100x100 viewBox)
  const pathData = "M50 2 L93 27 L93 73 L50 98 L7 73 L 7 27 Z";
  
  const baseClasses = `relative flex items-center justify-center select-none transition-all duration-300 ${className}`;
  
  // Interactive Classes
  const interactClasses = disabled 
    ? 'opacity-40 grayscale cursor-not-allowed' 
    : 'cursor-pointer active:scale-95 hover:brightness-125 hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]';

  const glowClass = (active || pulsate) ? 'animate-pulse' : '';

  return (
    <div 
      className={`${baseClasses} ${interactClasses} ${glowClass}`}
      style={{ width: s, height: s }}
      onClick={!disabled ? onClick : undefined}
    >
      {/* 1. Backdrop Blur Container (Glass Effect) */}
      <div 
         className="absolute inset-0" 
         style={{ 
             clipPath: 'polygon(50% 2%, 93% 27%, 93% 73%, 50% 98%, 7% 73%, 7% 27%)',
             backdropFilter: 'blur(4px)'
         }} 
      />

      <svg width="100%" height="100%" viewBox="0 0 100 100" className="overflow-visible relative z-10">
        <defs>
          <linearGradient id={`neon-grad-${variant}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={c.stop1} />
            <stop offset="100%" stopColor={c.stop2} />
          </linearGradient>
          
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
             <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
             <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
             </feMerge>
          </filter>
        </defs>

        {/* 2. Glow Shadow (Behind) */}
        {(active || !disabled) && (
             <path 
               d={pathData} 
               fill="none" 
               stroke={c.stroke} 
               strokeWidth="0"
               style={{ filter: `drop-shadow(0 0 10px ${c.glow})` }}
             />
        )}

        {/* 3. Main Glass Body */}
        <path 
          d={pathData} 
          fill={`url(#neon-grad-${variant})`} 
          stroke="none"
        />

        {/* 4. Neon Border Stroke */}
        <path 
          d={pathData} 
          fill="none" 
          stroke={active ? '#ffffff' : c.stroke} 
          strokeWidth={active ? 3 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-300"
        />

        {/* 5. Progress Stroke (Active Laser) */}
        {progress > 0 && (
          <path 
            d={pathData} 
            fill="none" 
            stroke="#ffffff" 
            strokeWidth="4" 
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - Math.min(100, Math.max(0, progress))}
            className="transition-all duration-200 ease-linear"
            style={{ filter: 'drop-shadow(0 0 4px #fff)' }}
          />
        )}
      </svg>
      
      {/* Content Overlay */}
      <div className={`absolute inset-0 flex flex-col items-center justify-center text-white pointer-events-none z-20 ${active ? 'text-white' : 'text-slate-200'}`}>
        {children}
      </div>
    </div>
  );
};

export default HexButton;
