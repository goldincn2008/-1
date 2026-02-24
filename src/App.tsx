/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Skull, Play, RotateCcw, Shield, Languages, Volume2, VolumeX } from 'lucide-react';
import { GameStatus, Point, Missile, EnemyRocket, Battery, City } from './types';

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const WIN_SCORE = 1000;

// Audio Helpers
const audioCtxRef: { current: AudioContext | null } = { current: null };

const getAudioCtx = () => {
  if (!audioCtxRef.current) {
    audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtxRef.current;
};

const playExplosionSound = () => {
  const ctx = getAudioCtx();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(150, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

  gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.5);
};

const playLaunchSound = () => {
  const ctx = getAudioCtx();
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(400, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.1);
};

const playBgm = () => {
  const ctx = getAudioCtx();
  const tempo = 150;
  const noteDuration = 60 / tempo / 2; // 16th notes
  
  // Simplified Contra-like bassline sequence (frequencies)
  const sequence = [
    110, 110, 164, 110, 146, 110, 164, 110,
    110, 110, 164, 110, 146, 110, 164, 110,
    98, 98, 146, 98, 130, 98, 146, 98,
    82, 82, 123, 82, 110, 82, 123, 82
  ];

  let nextNoteTime = ctx.currentTime;
  let noteIndex = 0;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.05, ctx.currentTime);
  masterGain.connect(ctx.destination);

  const playNote = () => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(sequence[noteIndex], nextNoteTime);
    
    gain.gain.setValueAtTime(0.5, nextNoteTime);
    gain.gain.exponentialRampToValueAtTime(0.01, nextNoteTime + noteDuration * 0.9);
    
    osc.connect(gain);
    gain.connect(masterGain);
    
    osc.start(nextNoteTime);
    osc.stop(nextNoteTime + noteDuration);
    
    noteIndex = (noteIndex + 1) % sequence.length;
    nextNoteTime += noteDuration;
    
    // Schedule next note
    const timeout = (nextNoteTime - ctx.currentTime) * 1000 - 50;
    return setTimeout(playNote, Math.max(0, timeout));
  };

  const timerId = playNote();

  return {
    stop: () => {
      clearTimeout(timerId);
      masterGain.disconnect();
    }
  };
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameStatus>(GameStatus.START);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const [isMuted, setIsMuted] = useState(false);
  const bgmRef = useRef<{ stop: () => void } | null>(null);
  
  // Game entities refs to avoid re-renders during game loop
  const entitiesRef = useRef({
    missiles: [] as Missile[],
    enemyRockets: [] as EnemyRocket[],
    batteries: [] as Battery[],
    cities: [] as City[],
    clouds: [] as { x: number, y: number, width: number, height: number, speed: number, opacity: number }[],
    lastEnemySpawn: 0,
    frameCount: 0,
    shake: 0,
  });

  const t = {
    zh: {
      title: 'SKY GUARDIAN',
      start: 'START DEFENSE',
      win: 'MISSION SUCCESS: AIRSPACE SECURED',
      lose: 'MISSION FAILURE: AIRSPACE BREACHED',
      score: 'INTERCEPTIONS',
      level: 'WAVE',
      restart: 'RETRY MISSION',
      missiles: 'SHURIKENS',
      target: 'GOAL',
      instructions: 'Protect the airspace from incoming threats. Deploy high-velocity shurikens to intercept enemy projectiles.',
    },
    en: {
      title: 'SKY GUARDIAN',
      start: 'START DEFENSE',
      win: 'MISSION SUCCESS: AIRSPACE SECURED',
      lose: 'MISSION FAILURE: AIRSPACE BREACHED',
      score: 'INTERCEPTIONS',
      level: 'WAVE',
      restart: 'RETRY MISSION',
      missiles: 'SHURIKENS',
      target: 'GOAL',
      instructions: 'Protect the airspace from incoming threats. Deploy high-velocity shurikens to intercept enemy projectiles.',
    }
  }[lang];

  const initGame = useCallback(() => {
    const batteries: Battery[] = [
      { id: 'b1', x: 100, y: CANVAS_HEIGHT - 40, modelName: 'China', missiles: 120, maxMissiles: 120, isDestroyed: false },
      { id: 'b2', x: 400, y: CANVAS_HEIGHT - 40, modelName: 'USA', missiles: 240, maxMissiles: 240, isDestroyed: false },
      { id: 'b3', x: 700, y: CANVAS_HEIGHT - 40, modelName: 'Russia', missiles: 120, maxMissiles: 120, isDestroyed: false },
    ];
    
    const cities: City[] = [
      { id: 'c1', x: 180, y: CANVAS_HEIGHT - 30, modelName: 'France', isDestroyed: false },
      { id: 'c2', x: 280, y: CANVAS_HEIGHT - 30, modelName: 'UK', isDestroyed: false },
      { id: 'c3', x: 520, y: CANVAS_HEIGHT - 30, modelName: 'Germany', isDestroyed: false },
      { id: 'c4', x: 620, y: CANVAS_HEIGHT - 30, modelName: 'Australia', isDestroyed: false },
      { id: 'c5', x: 350, y: CANVAS_HEIGHT - 30, modelName: 'North Korea', isDestroyed: false },
    ];

    const clouds = Array.from({ length: 15 }, () => ({
      x: Math.random() * CANVAS_WIDTH,
      y: Math.random() * CANVAS_HEIGHT * 0.7,
      width: 100 + Math.random() * 200,
      height: 40 + Math.random() * 60,
      speed: 0.2 + Math.random() * 0.5,
      opacity: 0.3 + Math.random() * 0.5
    }));

    entitiesRef.current = {
      missiles: [],
      enemyRockets: [],
      batteries,
      cities,
      clouds,
      lastEnemySpawn: 0,
      frameCount: 0,
      shake: 0,
    };
    setScore(0);
    setLevel(1);
    setGameState(GameStatus.PLAYING);

    if (!isMuted) {
      if (bgmRef.current) {
        try { bgmRef.current.stop(); } catch (e) {}
      }
      bgmRef.current = playBgm();
    }
  }, [isMuted]);

  const drawFlag = (ctx: CanvasRenderingContext2D, x: number, y: number, country: string, isDestroyed: boolean, size: number = 30) => {
    if (isDestroyed) {
      ctx.fillStyle = '#333';
      ctx.fillRect(x - size/2, y - size/4, size, size/2);
      return;
    }

    ctx.save();
    ctx.translate(x - size/2, y - size/4);
    const w = size;
    const h = size / 1.5;

    // Default background
    ctx.fillStyle = '#eee';
    ctx.fillRect(0, 0, w, h);

    switch (country) {
      case 'China':
        ctx.fillStyle = '#de2910';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffde00';
        ctx.beginPath();
        for(let i=0; i<5; i++) {
          const angle = (i * 0.8 - 0.5) * Math.PI;
          ctx.lineTo(w*0.2 + Math.cos(angle)*h*0.15, h*0.3 + Math.sin(angle)*h*0.15);
          const angle2 = (i * 0.8 - 0.1) * Math.PI;
          ctx.lineTo(w*0.2 + Math.cos(angle2)*h*0.06, h*0.3 + Math.sin(angle2)*h*0.06);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 'USA':
        ctx.fillStyle = '#b22234';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff';
        for(let i=0; i<13; i++) if(i%2===1) ctx.fillRect(0, i*(h/13), w, h/13);
        ctx.fillStyle = '#3c3b6e';
        ctx.fillRect(0, 0, w*0.45, h*0.53);
        ctx.fillStyle = '#fff';
        ctx.font = `${h/8}px Arial`;
        ctx.fillText('★★★★★', w*0.02, h*0.2);
        ctx.fillText('★★★★★', w*0.02, h*0.4);
        break;
      case 'Russia':
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h/3);
        ctx.fillStyle = '#0039a6'; ctx.fillRect(0, h/3, w, h/3);
        ctx.fillStyle = '#d52b1e'; ctx.fillRect(0, 2*h/3, w, h/3);
        break;
      case 'France':
        ctx.fillStyle = '#002395'; ctx.fillRect(0, 0, w/3, h);
        ctx.fillStyle = '#fff'; ctx.fillRect(w/3, 0, w/3, h);
        ctx.fillStyle = '#ed2939'; ctx.fillRect(2*w/3, 0, w/3, h);
        break;
      case 'UK':
        ctx.fillStyle = '#00247d'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = h/5;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke();
        ctx.strokeStyle = '#cf142b'; ctx.lineWidth = h/10;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(w*0.4, 0, w*0.2, h); ctx.fillRect(0, h*0.4, w, h*0.2);
        ctx.fillStyle = '#cf142b'; ctx.fillRect(w*0.45, 0, w*0.1, h); ctx.fillRect(0, h*0.45, w, h*0.1);
        break;
      case 'Germany':
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h/3);
        ctx.fillStyle = '#d00'; ctx.fillRect(0, h/3, w, h/3);
        ctx.fillStyle = '#ffce00'; ctx.fillRect(0, 2*h/3, w, h/3);
        break;
      case 'Australia':
        ctx.fillStyle = '#00008b'; ctx.fillRect(0, 0, w, h);
        // Union Jack mini
        ctx.save(); ctx.scale(0.4, 0.4);
        ctx.fillStyle = '#00247d'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = h/5;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke();
        ctx.strokeStyle = '#cf142b'; ctx.lineWidth = h/10;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(w*0.4, 0, w*0.2, h); ctx.fillRect(0, h*0.4, w, h*0.2);
        ctx.fillStyle = '#cf142b'; ctx.fillRect(w*0.45, 0, w*0.1, h); ctx.fillRect(0, h*0.45, w, h*0.1);
        ctx.restore();
        ctx.fillStyle = '#fff'; ctx.font = `${h/4}px Arial`; ctx.fillText('★', w*0.7, h*0.6);
        break;
      case 'North Korea':
        ctx.fillStyle = '#024fa2'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, h*0.2, w, h*0.6);
        ctx.fillStyle = '#ed1c24'; ctx.fillRect(0, h*0.25, w, h*0.5);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w*0.3, h*0.5, h*0.18, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ed1c24'; ctx.beginPath();
        for(let i=0; i<5; i++) {
          const angle = (i * 0.8 - 0.5) * Math.PI;
          ctx.lineTo(w*0.3 + Math.cos(angle)*h*0.15, h*0.5 + Math.sin(angle)*h*0.15);
          const angle2 = (i * 0.8 - 0.1) * Math.PI;
          ctx.lineTo(w*0.3 + Math.cos(angle2)*h*0.06, h*0.5 + Math.sin(angle2)*h*0.06);
        }
        ctx.closePath(); ctx.fill();
        break;
      case 'Japan':
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(w*0.5, h*0.5, h*0.3, 0, Math.PI*2); ctx.fill();
        break;
      case 'Italy':
        ctx.fillStyle = '#008c45'; ctx.fillRect(0, 0, w/3, h);
        ctx.fillStyle = '#f4f5f0'; ctx.fillRect(w/3, 0, w/3, h);
        ctx.fillStyle = '#cd212a'; ctx.fillRect(2*w/3, 0, w/3, h);
        break;
      case 'India':
        ctx.fillStyle = '#ff9933'; ctx.fillRect(0, 0, w, h/3);
        ctx.fillStyle = '#fff'; ctx.fillRect(0, h/3, w, h/3);
        ctx.fillStyle = '#138808'; ctx.fillRect(0, 2*h/3, w, h/3);
        ctx.strokeStyle = '#000080'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(w*0.5, h*0.5, h*0.15, 0, Math.PI*2); ctx.stroke();
        break;
      case 'South Korea':
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(w*0.5, h*0.5, h*0.25, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(w*0.5, h*0.5, h*0.25, 0, Math.PI); ctx.fill();
        break;
      case 'Canada':
        ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.fillRect(w*0.25, 0, w*0.5, h);
        ctx.fillStyle = '#f00'; ctx.font = `${h/2}px serif`; ctx.fillText('🍁', w*0.35, h*0.65);
        break;
      case 'Brazil':
        ctx.fillStyle = '#009739'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fed100'; ctx.beginPath(); ctx.moveTo(w*0.5, h*0.1); ctx.lineTo(w*0.9, h*0.5); ctx.lineTo(w*0.5, h*0.9); ctx.lineTo(w*0.1, h*0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#012169'; ctx.beginPath(); ctx.arc(w*0.5, h*0.5, h*0.2, 0, Math.PI*2); ctx.fill();
        break;
      case 'Israel':
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#0038b8'; ctx.fillRect(0, h*0.1, w, h*0.15); ctx.fillRect(0, h*0.75, w, h*0.15);
        ctx.font = `${h/3}px serif`; ctx.fillText('✡', w*0.35, h*0.6);
        break;
      case 'Turkey':
        ctx.fillStyle = '#e30a17'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w*0.45, h*0.5, h*0.25, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#e30a17'; ctx.beginPath(); ctx.arc(w*0.55, h*0.5, h*0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `${h/4}px serif`; ctx.fillText('★', w*0.6, h*0.55);
        break;
      case 'Ukraine':
        ctx.fillStyle = '#0057b7'; ctx.fillRect(0, 0, w, h/2);
        ctx.fillStyle = '#ffd700'; ctx.fillRect(0, h/2, w, h/2);
        break;
      default:
        ctx.fillStyle = `hsl(${Math.random()*360}, 70%, 50%)`;
        ctx.fillRect(0, 0, w, h);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
    ctx.restore();
  };

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
      if (!isMuted) playLaunchSound();
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
          maxExplosionRadius: 70,
          explosionSpeed: 2.5,
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

      // Decay screen shake
      if (entitiesRef.current.shake > 0.1) {
        entitiesRef.current.shake *= 0.85;
      } else {
        entitiesRef.current.shake = 0;
      }

      // Update clouds
      entitiesRef.current.clouds.forEach(cloud => {
        cloud.x += cloud.speed;
        if (cloud.x > CANVAS_WIDTH) {
          cloud.x = -cloud.width;
          cloud.y = Math.random() * CANVAS_HEIGHT * 0.7;
        }
      });

      // Spawn enemy rockets
      const spawnRate = Math.max(40, 200 - level * 20);
      if (entitiesRef.current.frameCount % spawnRate === 0) {
        const targets = [...cities.filter(c => !c.isDestroyed), ...batteries.filter(b => !b.isDestroyed)];
        if (targets.length > 0) {
          const target = targets[Math.floor(Math.random() * targets.length)];
          const startX = Math.random() * CANVAS_WIDTH;
          const countries = ['Japan', 'Canada', 'Brazil', 'India', 'Italy', 'Spain', 'Mexico', 'Egypt', 'Sweden', 'Norway', 'South Korea', 'Israel', 'Turkey', 'Iran', 'Ukraine', 'Argentina'];
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
            country: countries[Math.floor(Math.random() * countries.length)],
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
          if (!isMuted) playExplosionSound();
          entitiesRef.current.shake = 15;
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
          entitiesRef.current.shake = 25;
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
      const { shake, clouds, missiles, enemyRockets, batteries, cities } = entitiesRef.current;
      ctx.save();
      if (shake > 0) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }

      // Sky Background (Aerial View)
      const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      skyGradient.addColorStop(0, '#4facfe'); // Deep blue sky
      skyGradient.addColorStop(1, '#00f2fe'); // Lighter horizon
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw Clouds
      clouds.forEach(cloud => {
        ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
        ctx.beginPath();
        ctx.ellipse(cloud.x + cloud.width/2, cloud.y + cloud.height/2, cloud.width/2, cloud.height/2, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Add some "fluff" to clouds
        ctx.beginPath();
        ctx.arc(cloud.x + cloud.width * 0.3, cloud.y + cloud.height * 0.2, cloud.height * 0.4, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.width * 0.7, cloud.y + cloud.height * 0.2, cloud.height * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw ground (Aerial Landscape)
      ctx.fillStyle = '#2d5a27'; // Green fields
      ctx.fillRect(0, CANVAS_HEIGHT - 20, CANVAS_WIDTH, 20);
      
      // Draw Cities (Flags)
      cities.forEach(c => {
        drawFlag(ctx, c.x, c.y, c.modelName, c.isDestroyed, 24);
      });

      // Draw Batteries (Flags)
      batteries.forEach(b => {
        drawFlag(ctx, b.x, b.y, b.modelName, b.isDestroyed, 32);
        
        if (!b.isDestroyed) {
          // Ammo indicator
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(b.missiles.toString(), b.x, b.y + 30);
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
        ctx.moveTo(25, 0);
        ctx.lineTo(-15, -12);
        ctx.lineTo(-15, 12);
        ctx.closePath();
        ctx.fill();

        // Flag on rocket
        ctx.save();
        ctx.translate(-5, -6);
        drawFlag(ctx, 0, 0, r.country, false, 18);
        ctx.restore();
        
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

          // Shuriken (Dart) Body
          const angle = Math.atan2(m.targetY - m.y, m.targetX - m.x);
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(angle + entitiesRef.current.frameCount * 0.2); // Spinning effect
          
          ctx.fillStyle = '#e5e7eb';
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 2;
          
          // Draw 4-pointed star (Shuriken)
          const size = 15;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = (i * Math.PI) / 2;
            ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
            const a2 = a + Math.PI / 4;
            ctx.lineTo(Math.cos(a2) * size * 0.4, Math.sin(a2) * size * 0.4);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Center hole
          ctx.fillStyle = '#050508';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
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
          
          // Exaggerated Explosion
          ctx.save();
          
          // Outer Fireball
          const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.explosionRadius);
          grad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
          grad.addColorStop(0.2, `rgba(255, 255, 0, ${alpha})`);
          grad.addColorStop(0.5, `rgba(255, 100, 0, ${alpha * 0.8})`);
          grad.addColorStop(1, `rgba(255, 0, 0, 0)`);
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.explosionRadius, 0, Math.PI * 2);
          ctx.fill();

          // Spiky bits
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
          ctx.lineWidth = 2;
          drawStar(ctx, m.x, m.y, 8, m.explosionRadius * 1.2, m.explosionRadius * 0.5);
          ctx.stroke();
          
          // Particle sparks
          for (let p = 0; p < 8; p++) {
            const pAngle = (p / 8) * Math.PI * 2 + m.explosionRadius * 0.1;
            const px = m.x + Math.cos(pAngle) * m.explosionRadius * 0.8;
            const py = m.y + Math.sin(pAngle) * m.explosionRadius * 0.8;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(px - 2, py - 2, 4, 4);
          }
          
          ctx.restore();
        }
      });

      ctx.restore();
    };

    const loop = () => {
      update();
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (bgmRef.current) {
        try {
          bgmRef.current.stop();
        } catch (e) {}
      }
    };
  }, [gameState, level, isMuted]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-4 font-sans overflow-hidden">
      {/* Header UI */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-4 px-2">
        <div className="flex flex-col">
          <h1 className="text-2xl font-black tracking-tighter text-sky-600 flex items-center gap-2 italic">
            <Shield className="w-6 h-6" />
            {t.title}
          </h1>
          <div className="flex gap-4 text-xs font-mono opacity-60">
            <span>{t.score}: {score}</span>
            <span>{t.target}: {WIN_SCORE}</span>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <Languages className="w-5 h-5" />
          </button>
        </div>
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
        <div className="absolute inset-0 pointer-events-none border-[40px] border-black/20 rounded-2xl" style={{ boxShadow: 'inset 0 0 100px rgba(0,0,0,0.5)' }} />
        <div className="absolute inset-0 pointer-events-none flex justify-between px-10">
          <div className="w-1 h-full bg-black/10" />
          <div className="w-1 h-full bg-black/10" />
        </div>
        
        <AnimatePresence>
          {gameState === GameStatus.START && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-[#050505] flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-transparent to-transparent" />
              </div>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="mb-8"
              >
                <Shield className="w-24 h-24 text-sky-500 mx-auto drop-shadow-[0_0_15px_rgba(14,165,233,0.5)]" />
              </motion.div>

              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-6xl font-black mb-6 text-white tracking-tighter italic"
                style={{
                  textShadow: '3px 3px 0px #0284c7, 6px 6px 0px rgba(0,0,0,0.5)'
                }}
              >
                {t.title}
              </motion.h2>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="max-w-md mb-12 text-gray-400 text-xs uppercase tracking-[0.3em] font-mono leading-relaxed"
              >
                {t.instructions}
              </motion.p>

              <motion.button 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.9 }}
                onClick={initGame}
                className="group relative px-12 py-4 bg-white hover:bg-red-600 text-black hover:text-white font-black rounded-sm transition-all flex items-center gap-3 overflow-hidden border-b-4 border-gray-300 hover:border-red-800 active:translate-y-1 active:border-b-0"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Play className="w-5 h-5 fill-current" />
                <span className="tracking-widest">{t.start}</span>
              </motion.button>
              
              <div className="mt-12 flex gap-8 opacity-30 grayscale">
                <div className="text-[10px] font-mono">AERIAL DEFENSE</div>
                <div className="text-[10px] font-mono">CLOUD SHIELD</div>
                <div className="text-[10px] font-mono">SKY INTERCEPTOR</div>
              </div>
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
        &copy; 2024 SKY GUARDIAN &bull; STRATEGIC AIR COMMAND
      </div>
    </div>
  );
}
