/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Skull, Play, RotateCcw, Shield, Languages } from 'lucide-react';
import { GameStatus, Point, Missile, EnemyRocket, Battery, City } from './types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const WIN_SCORE = 1000;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameStatus>(GameStatus.START);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  
  // Game entities refs to avoid re-renders during game loop
  const entitiesRef = useRef({
    missiles: [] as Missile[],
    enemyRockets: [] as EnemyRocket[],
    batteries: [] as Battery[],
    cities: [] as City[],
    stars: [] as { x: number, y: number, size: number, opacity: number }[],
    lastEnemySpawn: 0,
    frameCount: 0,
  });

  const t = {
    zh: {
      title: '云宝新星防御',
      start: '开始游戏',
      win: '恭喜！你成功守护了城市',
      lose: '城市已沦陷...',
      score: '得分',
      level: '关卡',
      restart: '再玩一次',
      missiles: '导弹',
      target: '目标得分',
      instructions: '点击屏幕发射拦截导弹。预判敌方火箭轨迹，利用爆炸范围摧毁它们。',
    },
    en: {
      title: 'Yunbao Nova Defense',
      start: 'Start Game',
      win: 'Victory! Cities Protected',
      lose: 'Cities Fallen...',
      score: 'Score',
      level: 'Level',
      restart: 'Play Again',
      missiles: 'Missiles',
      target: 'Target Score',
      instructions: 'Click to fire interceptors. Predict rocket paths and use explosion AOE to destroy them.',
    }
  }[lang];

  const initGame = useCallback(() => {
    const batteries: Battery[] = [
      { id: 'b1', x: 100, y: CANVAS_HEIGHT - 40, missiles: 120, maxMissiles: 120, isDestroyed: false },
      { id: 'b2', x: 400, y: CANVAS_HEIGHT - 40, missiles: 240, maxMissiles: 240, isDestroyed: false },
      { id: 'b3', x: 700, y: CANVAS_HEIGHT - 40, missiles: 120, maxMissiles: 120, isDestroyed: false },
    ];
    
    const cities: City[] = [
      { id: 'c1', x: 200, y: CANVAS_HEIGHT - 20, isDestroyed: false },
      { id: 'c2', x: 300, y: CANVAS_HEIGHT - 20, isDestroyed: false },
      { id: 'c3', x: 500, y: CANVAS_HEIGHT - 20, isDestroyed: false },
      { id: 'c4', x: 600, y: CANVAS_HEIGHT - 20, isDestroyed: false },
    ];

    const stars = Array.from({ length: 100 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT,
      size: Math.random() * 2,
      opacity: Math.random()
    }));

    entitiesRef.current = {
      missiles: [],
      enemyRockets: [],
      batteries,
      cities,
      stars,
      lastEnemySpawn: 0,
      frameCount: 0,
    };
    setScore(0);
    setLevel(1);
    setGameState(GameStatus.PLAYING);
  }, []);

  const drawStar = (ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number) => {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius)
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y)
      rot += step

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y)
      rot += step
    }
    ctx.lineTo(cx, cy - outerRadius)
    ctx.closePath();
  };

  const fireMissile = (targetX: number, targetY: number) => {
    if (gameState !== GameStatus.PLAYING) return;

    const { batteries } = entitiesRef.current;
    
    // Find closest battery with missiles
    let closestBattery: Battery | null = null;
    let minDistance = Infinity;

    batteries.forEach(b => {
      if (!b.isDestroyed && b.missiles > 0) {
        const dist = Math.abs(b.x - targetX);
        if (dist < minDistance) {
          minDistance = dist;
          closestBattery = b;
        }
      }
    });

    if (closestBattery) {
      const shots = 12;
      closestBattery.missiles = Math.max(0, closestBattery.missiles - shots);
      
      for (let i = 0; i < shots; i++) {
        const spread = 60;
        const offsetX = (Math.random() - 0.5) * spread;
        const offsetY = (Math.random() - 0.5) * spread;

        const newMissile: Missile = {
          id: Math.random().toString(36).substr(2, 9),
          x: closestBattery.x,
          y: closestBattery.y,
          startX: closestBattery.x,
          startY: closestBattery.y,
          targetX: targetX + offsetX,
          targetY: targetY + offsetY,
          speed: 0.007 + Math.random() * 0.005,
          progress: 0,
          isExploding: false,
          explosionRadius: 0,
          maxExplosionRadius: 40,
          explosionSpeed: 1.5,
          isFinished: false,
        };
        entitiesRef.current.missiles.push(newMissile);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    fireMissile(x, y);
  };

  useEffect(() => {
    if (gameState !== GameStatus.PLAYING) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const { missiles, enemyRockets, batteries, cities } = entitiesRef.current;
      entitiesRef.current.frameCount++;

      // Spawn enemy rockets
      const spawnRate = Math.max(40, 200 - level * 20);
      if (entitiesRef.current.frameCount % spawnRate === 0) {
        const targets = [...cities.filter(c => !c.isDestroyed), ...batteries.filter(b => !b.isDestroyed)];
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          const startX = Math.random() * CANVAS_WIDTH;
          enemyRockets.push({
            id: Math.random().toString(36).substr(2, 9),
            x: startX,
            y: 0,
            startX,
            startY: 0,
            targetX: target.x,
            targetY: target.y,
            speed: 0.0005 + level * 0.00025,
            progress: 0,
            isDestroyed: false,
          });
        }
      }

      // Update missiles and explosions
      for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i];
        if (!m.isExploding) {
          // Auto-tracking logic
          if (!m.targetRocketId) {
            // Find nearest rocket to the target point
            let nearestRocket: EnemyRocket | null = null;
            let minDist = 60; // Tracking sensitivity radius
            enemyRockets.forEach(r => {
              const dist = Math.hypot(r.x - m.targetX, r.y - m.targetY);
              if (dist < minDist) {
                minDist = dist;
                nearestRocket = r;
              }
            });
            if (nearestRocket) {
              m.targetRocketId = (nearestRocket as EnemyRocket).id;
            }
          }

          if (m.targetRocketId) {
            const targetRocket = enemyRockets.find(r => r.id === m.targetRocketId);
            if (targetRocket && !targetRocket.isDestroyed) {
              m.targetX = targetRocket.x;
              m.targetY = targetRocket.y;
            }
          }

          m.progress += m.speed;
          m.x = m.startX + (m.targetX - m.startX) * m.progress;
          m.y = m.startY + (m.targetY - m.startY) * m.progress;
          if (m.progress >= 1) {
            m.isExploding = true;
          }
        } else {
          m.explosionRadius += m.explosionSpeed;
          if (m.explosionRadius >= m.maxExplosionRadius) {
            m.isFinished = true;
            missiles.splice(i, 1);
          }
        }
      }

      // Update enemy rockets
      for (let i = enemyRockets.length - 1; i >= 0; i--) {
        const r = enemyRockets[i];
        r.progress += r.speed;
        r.x = r.startX + (r.targetX - r.startX) * r.progress;
        r.y = r.startY + (r.targetY - r.startY) * r.progress;

        // Check collision with explosions
        let hit = false;
        missiles.forEach(m => {
          if (m.isExploding) {
            const dist = Math.hypot(r.x - m.x, r.y - m.y);
            if (dist < m.explosionRadius) {
              hit = true;
            }
          }
        });

        if (hit) {
          setScore(s => {
            const newScore = s + 20;
            if (newScore >= WIN_SCORE) {
              setGameState(GameStatus.WON);
            } else if (newScore % 200 === 0) {
              // Level up every 200 points
              setLevel(l => l + 1);
              // Refill ammo
              entitiesRef.current.batteries.forEach(b => {
                if (!b.isDestroyed) b.missiles = b.maxMissiles;
              });
            }
            return newScore;
          });
          enemyRockets.splice(i, 1);
          continue;
        }

        // Check collision with ground/targets
        if (r.progress >= 1) {
          // Hit target
          cities.forEach(c => {
            if (Math.abs(c.x - r.x) < 20) c.isDestroyed = true;
          });
          batteries.forEach(b => {
            if (Math.abs(b.x - r.x) < 20) b.isDestroyed = true;
          });
          enemyRockets.splice(i, 1);
          
          // Check game over
          if (batteries.every(b => b.isDestroyed)) {
            setGameState(GameStatus.LOST);
          }
        }
      }
    };

    const draw = () => {
      // Space Background
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const { missiles, enemyRockets, batteries, cities, stars } = entitiesRef.current;

      // Draw Stars
      stars.forEach(star => {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Subtle Nebula
      const gradient = ctx.createRadialGradient(CANVAS_WIDTH/2, CANVAS_HEIGHT/2, 0, CANVAS_WIDTH/2, CANVAS_HEIGHT/2, CANVAS_WIDTH);
      gradient.addColorStop(0, 'rgba(30, 0, 60, 0.1)');
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw ground (Lunar Surface)
      ctx.fillStyle = '#333';
      ctx.fillRect(0, CANVAS_HEIGHT - 10, CANVAS_WIDTH, 10);
      // Add craters or details to ground
      ctx.fillStyle = '#222';
      for(let i=0; i<CANVAS_WIDTH; i+=50) {
        ctx.beginPath();
        ctx.arc(i + Math.sin(i)*10, CANVAS_HEIGHT - 5, 5, 0, Math.PI, true);
        ctx.fill();
      }

      // Draw Cities (Space Outposts)
      cities.forEach(c => {
        if (!c.isDestroyed) {
          ctx.fillStyle = '#00f2ff';
          ctx.beginPath();
          ctx.arc(c.x, c.y - 10, 15, Math.PI, 0);
          ctx.fill();
          ctx.fillRect(c.x - 15, c.y - 10, 30, 10);
          // Antenna
          ctx.strokeStyle = '#00f2ff';
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - 25);
          ctx.lineTo(c.x, c.y - 35);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#444';
          ctx.fillRect(c.x - 15, c.y - 5, 30, 5);
        }
      });

      // Draw Batteries (Defense Turrets)
      batteries.forEach(b => {
        if (!b.isDestroyed) {
          ctx.fillStyle = '#ff0055';
          ctx.beginPath();
          ctx.moveTo(b.x - 20, b.y + 10);
          ctx.lineTo(b.x, b.y - 15);
          ctx.lineTo(b.x + 20, b.y + 10);
          ctx.fill();
          
          // Glowing core
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
          ctx.fill();

          // Ammo indicator
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(b.missiles.toString(), b.x, b.y + 25);
        } else {
          ctx.fillStyle = '#444';
          ctx.beginPath();
          ctx.arc(b.x, b.y + 5, 10, 0, Math.PI, true);
          ctx.fill();
        }
      });

      // Draw Enemy Rockets (Imperial Probes)
      enemyRockets.forEach(r => {
        // Trail
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(r.startX, r.startY);
        ctx.lineTo(r.x, r.y);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Missile Body
        const angle = Math.atan2(r.targetY - r.startY, r.targetX - r.startX);
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(angle);
        
        // Body
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fill();
        
        // Engine Glow
        ctx.fillStyle = '#ffaa00';
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-12, -3);
        ctx.lineTo(-12, 3);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      });

      // Draw Missiles and Star Explosions
      missiles.forEach(m => {
        if (!m.isExploding) {
          // Trail
          ctx.strokeStyle = 'rgba(0, 242, 255, 0.2)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(m.startX, m.startY);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();

          // Kitchen Knife Body
          const angle = Math.atan2(m.targetY - m.y, m.targetX - m.x);
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(angle);
          
          // Blade
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(0, -8, 24, 16);
          
          // Blade edge
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(0, -8, 24, 16);
          
          // Handle
          ctx.fillStyle = '#4b5563';
          ctx.fillRect(-12, -4, 12, 8);
          
          // Hole in blade
          ctx.fillStyle = '#050508';
          ctx.beginPath();
          ctx.arc(16, -4, 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
          
          // Target X
          ctx.strokeStyle = '#fff';
          ctx.beginPath();
          ctx.moveTo(m.targetX - 5, m.targetY - 5);
          ctx.lineTo(m.targetX + 5, m.targetY + 5);
          ctx.moveTo(m.targetX + 5, m.targetY - 5);
          ctx.lineTo(m.targetX - 5, m.targetY + 5);
          ctx.stroke();
        } else {
          const alpha = 1 - m.explosionRadius / m.maxExplosionRadius;
          
          // Outer Star
          ctx.fillStyle = `rgba(255, 255, 0, ${alpha * 0.5})`;
          drawStar(ctx, m.x, m.y, 5, m.explosionRadius, m.explosionRadius * 0.4);
          ctx.fill();

          // Inner Star
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          drawStar(ctx, m.x, m.y, 5, m.explosionRadius * 0.7, m.explosionRadius * 0.2);
          ctx.fill();
          
          // Glow
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(255, 255, 0, 0.8)';
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 2;
          drawStar(ctx, m.x, m.y, 5, m.explosionRadius * 0.5, m.explosionRadius * 0.1);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      });
    };

    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, level]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 font-sans overflow-hidden">
      {/* Header UI */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-4 px-2">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tighter text-emerald-400 flex items-center gap-2">
            <Shield className="w-6 h-6" />
            {t.title}
          </h1>
          <div className="flex gap-4 text-xs font-mono opacity-60">
            <span>{t.score}: {score}</span>
            <span>{t.target}: {WIN_SCORE}</span>
          </div>
        </div>
        
        <button 
          onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <Languages className="w-5 h-5" />
        </button>
      </div>

      {/* Game Container */}
      <div className="relative w-full max-w-[800px] aspect-[4/3] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/5">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
          className="w-full h-full cursor-crosshair"
        />

        {/* Overlays */}
        <AnimatePresence>
          {gameState === GameStatus.START && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.h2 
                initial={{ y: 20 }}
                animate={{ y: 0 }}
                className="text-4xl font-bold mb-4 text-emerald-400"
              >
                {t.title}
              </motion.h2>
              <p className="max-w-md mb-8 text-gray-400 text-sm leading-relaxed">
                {t.instructions}
              </p>
              <button 
                onClick={initGame}
                className="group relative px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full transition-all flex items-center gap-2 overflow-hidden"
              >
                <Play className="w-5 h-5" />
                {t.start}
              </button>
            </motion.div>
          )}

          {gameState === GameStatus.WON && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-emerald-500/20 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="bg-black/80 p-8 rounded-3xl border border-emerald-500/30 shadow-2xl">
                <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                <h2 className="text-3xl font-bold mb-2">{t.win}</h2>
                <p className="text-emerald-400 font-mono text-xl mb-6">{t.score}: {score}</p>
                <button 
                  onClick={initGame}
                  className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full transition-all flex items-center gap-2 mx-auto"
                >
                  <RotateCcw className="w-5 h-5" />
                  {t.restart}
                </button>
              </div>
            </motion.div>
          )}

          {gameState === GameStatus.LOST && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 bg-red-500/20 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="bg-black/80 p-8 rounded-3xl border border-red-500/30 shadow-2xl">
                <Skull className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-3xl font-bold mb-2">{t.lose}</h2>
                <p className="text-red-400 font-mono text-xl mb-6">{t.score}: {score}</p>
                <button 
                  onClick={initGame}
                  className="px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-full transition-all flex items-center gap-2 mx-auto"
                >
                  <RotateCcw className="w-5 h-5" />
                  {t.restart}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer Instructions */}
      <div className="mt-8 text-center opacity-40 text-[10px] uppercase tracking-[0.2em] font-mono">
        &copy; 2024 云宝新星防御 &bull; Strategic Interception System
      </div>
    </div>
  );
}
