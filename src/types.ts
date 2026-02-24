export enum GameStatus {
  START = 'START',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
  NEXT_ROUND = 'NEXT_ROUND'
}

export interface Point {
  x: number;
  y: number;
}

export interface Entity extends Point {
  id: string;
}

export interface Missile extends Entity {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  targetRocketId?: string;
  speed: number;
  progress: number; // 0 to 1
  isExploding: boolean;
  explosionRadius: number;
  maxExplosionRadius: number;
  explosionSpeed: number;
  isFinished: boolean;
}

export interface EnemyRocket extends Entity {
  targetX: number;
  targetY: number;
  startX: number;
  startY: number;
  speed: number;
  progress: number;
  isDestroyed: boolean;
  country: string;
}

export interface Battery extends Entity {
  modelName: string;
  missiles: number;
  maxMissiles: number;
  isDestroyed: boolean;
}

export interface City extends Entity {
  modelName: string;
  isDestroyed: boolean;
}

export interface GameState {
  score: number;
  level: number;
  status: GameStatus;
  missiles: Missile[];
  enemyRockets: EnemyRocket[];
  batteries: Battery[];
  cities: City[];
  explosions: { x: number; y: number; radius: number; maxRadius: number; id: string }[];
}
