import React, { useRef, useEffect } from 'react';

interface BackgroundProps {
  variant?: 'MENU' | 'GAME';
}

const HEX_SIZE = 40;
const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;
const HEX_HEIGHT = 2 * HEX_SIZE;

const Background: React.FC<BackgroundProps> = ({ variant = 'MENU' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    // OPTIMIZATION: Throttle FPS to save CPU
    // Menu: 30 FPS (Smooth enough for ambience)
    // Game: 15 FPS (Background is subtle/obscured, high FPS is wasteful)
    const TARGET_FPS = variant === 'MENU' ? 30 : 15;
    const FRAME_INTERVAL = 1000 / TARGET_FPS;
    let lastFrameTime = 0;

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        // Menu needs extra height for the tilt effect, Game fits screen
        canvas.height = window.innerHeight * (variant === 'MENU' ? 1.5 : 1.0);
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    const drawHex = (x: number, y: number, size: number, color: string, height: number, strokeColor: string) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i + 30;
        const angle_rad = Math.PI / 180 * angle_deg;
        ctx.lineTo(x + size * Math.cos(angle_rad), y + size * Math.sin(angle_rad));
      }
      ctx.closePath();
      
      ctx.fillStyle = color;
      ctx.fill();

      // Highlights
      if (variant === 'MENU') {
          if (height > 0.2) {
            ctx.beginPath();
            const innerSize = size * (1 - height * 0.5); 
            for (let i = 0; i < 6; i++) {
              const angle_deg = 60 * i + 30;
              const angle_rad = Math.PI / 180 * angle_deg;
              ctx.lineTo(x + innerSize * Math.cos(angle_rad), y + innerSize * Math.sin(angle_rad));
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 255, 255, ${height * 0.3})`;
            ctx.fill();
          }
      } else {
          // GAME MODE: Subtle pulse on high activity cells
          if (height > 0.6) {
             ctx.fillStyle = `rgba(56, 189, 248, ${ (height - 0.6) * 0.1 })`; // Very faint cyan glow
             ctx.fill();
          }
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = variant === 'MENU' ? 1 + height * 2 : 1;
      ctx.stroke();
    };

    const render = (timestamp: number) => {
      animationFrameId = requestAnimationFrame(render);
      
      // Throttle Check
      const elapsed = timestamp - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) return;

      // Adjust lastFrameTime to target interval (avoids drift)
      lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);
      
      // Normalize time increment based on actual elapsed time (approx 0.0003 per ms)
      // This ensures animation speed is consistent regardless of FPS limit
      time += 0.0003 * elapsed;
      
      // Base Background Color
      ctx.fillStyle = '#020617'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const numCols = Math.ceil(canvas.width / HEX_WIDTH) + 2;
      const numRows = Math.ceil(canvas.height / (HEX_HEIGHT * 0.75)) + 4;

      // Scroll only in MENU mode
      const flyOffset = variant === 'MENU' ? (time * 50) % (HEX_HEIGHT * 1.5) : 0;

      for (let r = -2; r < numRows; r++) {
        for (let q = -2; q < numCols; q++) {
           const xOffset = (r % 2) * (HEX_WIDTH / 2);
           const cx = q * HEX_WIDTH + xOffset;
           const cy = r * (HEX_HEIGHT * 0.75) + flyOffset;

           // Noise Function
           const h1 = Math.sin(q * 0.3 + time) * Math.cos(r * 0.2 - time);
           const h2 = Math.sin(q * 0.7 - time * 2) * Math.cos(r * 0.5 + time);
           const rawH = (h1 + h2) / 2; 
           const height = Math.max(0, rawH);

           let color = '#020617'; 
           let stroke = '#1e293b';

           if (variant === 'MENU') {
               color = '#0f172a';
               stroke = `rgba(71, 85, 105, ${0.3 + height * 0.5})`;
               if (height > 0.6) color = '#1e3a8a';
               if (height > 0.8) color = '#b45309';
           } else {
               // GAME MODE: Darker, subtle tech grid
               stroke = `rgba(30, 41, 59, ${0.1 + height * 0.2})`; // Very faint lines
               if (height > 0.7) color = '#0f172a';
           }

           drawHex(cx, cy, HEX_SIZE, color, height, stroke);
        }
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [variant]);

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};

export default Background;