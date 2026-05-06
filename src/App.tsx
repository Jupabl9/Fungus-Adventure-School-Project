/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Settings as Credits, 
  ArrowLeft, 
  ArrowRight, 
  ArrowUp, 
  Zap, 
  Pause, 
  Home, 
  RotateCcw, 
  Infinity as InfiniteIcon,
  Book,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Target,
  Clock,
  User as UserIcon,
  Mail,
  GraduationCap,
  Trophy,
  Loader2
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  increment, 
  serverTimestamp, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs,
  where,
  Timestamp
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// --- Constants ---
const GAME_WIDTH = 400;
const GAME_HEIGHT = 500;
const PLAYER_SIZE = 36;
const GRAVITY = 0.45; // Snappier gravity
const JUMP_FORCE = -12; // Snappier jump
const MOVE_SPEED = 5; // Snappier movement
const CAM_SMOOTHING = 0.15; // Smooth camera follow
const WATER_RISE_INITIAL = 0.5;
const DEBRIS_TYPES = ['TRONCO', 'HOJA', 'CASCARA', 'ESQUELETO'];

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

type GameState = 'AUTH' | 'REGISTRATION' | 'MENU' | 'CREDITS' | 'PLAYING' | 'GAME_OVER' | 'WIN' | 'PAUSE' | 'SELECT_MODE' | 'SELECT_ENVIRONMENT' | 'NEXT_LEVEL_PROMPT' | 'INFINITE_INFO' | 'LEADERBOARD';
type GamePhase = 'ASCENT' | 'SUBMERGED';

interface AppUser {
  email: string;
  fullName: string;
  grade: string;
  score_historia_v2?: number;
  score_infinito_v2?: number;
  createdAt: any;
}

interface Entity {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  vx?: number;
  vy?: number;
}

interface Camera {
  x: number;
  y: number;
}

const Platform = React.memo(({ plat, phase }: { plat: Entity; phase?: GamePhase }) => {
    const grassDots = useMemo(() => Array.from({ length: Math.ceil(plat.width / 4) }), [plat.width]);
    
    // Aesthetic variants based on phase
    const isSubmerged = phase === 'SUBMERGED';
    const topColor = isSubmerged ? '#FCD34D' : '#4ADE80'; // Sand vs Grass
    const bottomColor = isSubmerged ? '#D97706' : '#8D6E63'; // Deep sand vs Dirt
    const borderColor = isSubmerged ? '#B45309' : '#2b6d41';
    const accentColor = isSubmerged ? '#FBBF24' : '#2b6d41';

    return (
        <div 
            className="absolute overflow-hidden" 
            style={{ left: plat.x, top: plat.y, width: plat.width, height: plat.height }}
        >
            <div className={`h-4 w-full border-b-2 relative`} style={{ backgroundColor: topColor, borderColor: isSubmerged ? topColor : accentColor }}>
                <div className="absolute inset-0 flex">
                    {grassDots.map((_, i) => (
                        <div key={i} className={`w-1 h-2 mt-auto`} style={{ backgroundColor: isSubmerged ? '#D97706' : accentColor }} />
                    ))}
                </div>
            </div>
            {/* The rest of the block is solid sand/dirt */}
            <div className="w-full h-full" style={{ backgroundColor: bottomColor }} />
            <div className="absolute inset-0 border-2 border-black/20 pointer-events-none" />
        </div>
    );
});
class SoundBoard {
  private ctx: AudioContext | null = null;

  private bgmInterval: any = null;
  private bgmStarted: boolean = false;
  private currentTrack: string | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playBGM(type: 'MENU' | 'ASCENT' | 'SUBMERGED' | 'CREDITS' = 'MENU') {
    this.init();
    if (!this.ctx) return;
    
    // If the same track is already playing, don't restart
    if (this.bgmStarted && this.currentTrack === type) return;
    
    // Stop previous if exists
    this.stopBGM();
    
    this.bgmStarted = true;
    this.currentTrack = type;
    
    let notes: number[] = [];
    let speed = 250;
    let waveType: OscillatorType = 'triangle';
    let volume = 0.03;

    switch(type) {
        case 'MENU':
            // Playful arpeggio (C Major)
            notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // C4, E4, G4, C5, G4, E4
            speed = 180;
            waveType = 'square';
            volume = 0.02;
            break;
        case 'ASCENT':
            // Driven bassline (A Minor)
            notes = [110.00, 110.00, 130.81, 146.83, 110.00, 110.00, 164.81, 146.83]; // A2, A2, C3, D3, A2, A2, E3, D3
            speed = 150;
            waveType = 'triangle';
            volume = 0.05;
            break;
        case 'SUBMERGED':
            // Mystical, slower (D Minor)
            notes = [146.83, 174.61, 220.00, 174.61]; // D3, F3, A3, F3
            speed = 400;
            waveType = 'sine';
            volume = 0.08;
            break;
        case 'CREDITS':
            // Nostalgic, slow arpeggio (G Major / Em)
            notes = [392.00, 493.88, 587.33, 783.99, 587.33, 493.88, 329.63, 415.30]; 
            speed = 450;
            waveType = 'triangle';
            volume = 0.04;
            break;
    }
    
    let step = 0;
    this.bgmInterval = setInterval(() => {
      if (!this.ctx || this.ctx.state === 'suspended') return;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = waveType;
      osc.frequency.setValueAtTime(notes[step % notes.length], this.ctx.currentTime);
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (speed / 1000) * 0.9);
      
      osc.start();
      osc.stop(this.ctx.currentTime + (speed / 1000));
      step++;
    }, speed);
  }

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.bgmStarted = false;
    this.currentTrack = null;
  }

  playJump() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playShoot() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playCollect() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playGameOver() {
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  }
}

const sounds = new SoundBoard();

// --- Components ---

const MushroomSVG = ({ color = "#e70000", opacity = "1" }: { color?: string; opacity?: string }) => {
  const capColor = color;
  const spotColor = "#fb9800";
  const stemColor = "#ffffff";
  const black = "#000000";

  return (
    <svg viewBox="0 0 16 16" className="w-full h-full" style={{ opacity }} shapeRendering="crispEdges">
      {/* Black Outline - Cap */}
      <rect x="4" y="1" width="8" height="1" fill={black} />
      <rect x="2" y="2" width="2" height="1" fill={black} />
      <rect x="12" y="2" width="2" height="1" fill={black} />
      <rect x="1" y="3" width="1" height="6" fill={black} />
      <rect x="14" y="3" width="1" height="6" fill={black} />
      <rect x="2" y="9" width="2" height="1" fill={black} />
      <rect x="12" y="9" width="2" height="1" fill={black} />
      <rect x="4" y="10" width="8" height="1" fill={black} />
      
      {/* Red Cap Fill */}
      <rect x="4" y="2" width="8" height="1" fill={capColor} />
      <rect x="2" y="3" width="12" height="6" fill={capColor} />
      <rect x="4" y="9" width="8" height="1" fill={capColor} />

      {/* Spots */}
      <rect x="6" y="4" width="4" height="4" fill={spotColor} />
      <rect x="1" y="5" width="2" height="2" fill={spotColor} />
      <rect x="13" y="5" width="2" height="2" fill={spotColor} />
      <rect x="7" y="1" width="2" height="1" fill={spotColor} />

      {/* Stem */}
      <rect x="4" y="11" width="8" height="4" fill={stemColor} />
      <rect x="3" y="11" width="1" height="3" fill={stemColor} />
      <rect x="12" y="11" width="1" height="3" fill={stemColor} />
      
      {/* Stem Outline */}
      <rect x="3" y="10" width="1" height="1" fill={black} />
      <rect x="12" y="10" width="1" height="1" fill={black} />
      <rect x="4" y="15" width="8" height="1" fill={black} />
      <rect x="2" y="11" width="1" height="3" fill={black} />
      <rect x="13" y="11" width="1" height="3" fill={black} />
      <rect x="3" y="14" width="1" height="1" fill={black} />
      <rect x="12" y="14" width="1" height="1" fill={black} />

      {/* Eyes */}
      <rect x="6" y="12" width="1" height="2" fill={black} />
      <rect x="9" y="12" width="1" height="2" fill={black} />
    </svg>
  );
};

const MarioCloudSVG = React.memo(() => (
    <svg viewBox="0 0 64 32" className="w-full h-full">
        <rect x="16" y="8" width="32" height="16" fill="white" />
        <rect x="8" y="12" width="48" height="12" fill="white" />
        <rect x="24" y="4" width="16" height="8" fill="white" />
        {/* Smiling Face like the image */}
        <rect x="26" y="14" width="2" height="4" fill="#3b82f6" opacity="0.4" />
        <rect x="36" y="14" width="2" height="4" fill="#3b82f6" opacity="0.4" />
        <path d="M28 22 Q31 24 34 22" stroke="#3b82f6" strokeWidth="1" fill="none" opacity="0.4" />
    </svg>
));

const CoralSVG = React.memo(() => (
    <svg viewBox="0 0 20 60" className="w-full h-full">
        <rect x="8" y="0" width="4" height="60" fill="#f87171" opacity="0.8" />
        <rect x="4" y="10" width="8" height="4" fill="#f87171" opacity="0.8" />
        <rect x="10" y="25" width="8" height="4" fill="#f87171" opacity="0.8" />
        <rect x="4" y="45" width="8" height="4" fill="#f87171" opacity="0.8" />
    </svg>
));

const DebrisSVG = React.memo(({ type }: { type: string }) => {
  const black = "#000000";
  const white = "#ffffff";
  return (
    <svg viewBox="0 0 16 16" className="w-full h-full" shapeRendering="crispEdges">
      {(() => {
        switch (type) {
          case 'TRONCO': // Log
            return (
              <g>
                <rect x="2" y="4" width="12" height="8" fill="#5D4037" />
                <rect x="1" y="5" width="1" height="6" fill="#5D4037" />
                <rect x="14" y="5" width="1" height="6" fill="#5D4037" />
                {/* Lines */}
                <rect x="3" y="6" width="10" height="1" fill="#3E2723" />
                <rect x="3" y="9" width="10" height="1" fill="#3E2723" />
                {/* Outline */}
                <rect x="2" y="3" width="12" height="1" fill={black} />
                <rect x="2" y="12" width="12" height="1" fill={black} />
                <rect x="1" y="4" width="1" height="1" fill={black} />
                <rect x="14" y="4" width="1" height="1" fill={black} />
                <rect x="0" y="5" width="1" height="6" fill={black} />
                <rect x="15" y="5" width="1" height="6" fill={black} />
              </g>
            );
          case 'HOJA': // Leaf
            return (
              <g>
                <path d="M8 2 L12 6 L8 14 L4 6 Z" fill="#2E7D32" />
                <path d="M8 2 L13 7 L8 15 L3 7 Z" fill={black} opacity="0.2" />
                <rect x="7" y="3" width="2" height="10" fill="#1B5E20" />
              </g>
            );
          case 'CASCARA': // Shell
            return (
              <g>
                <rect x="3" y="5" width="10" height="7" fill="#FFB300" />
                <rect x="4" y="4" width="8" height="1" fill="#FFB300" />
                <rect x="4" y="12" width="8" height="1" fill="#FFB300" />
                {/* Eyes on shell */}
                <rect x="5" y="8" width="2" height="2" fill={white} />
                <rect x="9" y="8" width="2" height="2" fill={white} />
                <rect x="6" y="9" width="1" height="1" fill={black} />
                <rect x="10" y="9" width="1" height="1" fill={black} />
                {/* Outline */}
                <rect x="3" y="4" width="1" height="1" fill={black} />
                <rect x="12" y="4" width="1" height="1" fill={black} />
                <rect x="4" y="3" width="8" height="1" fill={black} />
              </g>
            );
          case 'ESQUELETO': // Skeleton / Bone Fish style
            return (
              <g>
                <rect x="4" y="6" width="8" height="4" fill={white} />
                <rect x="12" y="5" width="2" height="6" fill={white} />
                {/* Ribs */}
                <rect x="5" y="4" width="1" height="8" fill={white} />
                <rect x="7" y="4" width="1" height="8" fill={white} />
                <rect x="9" y="4" width="1" height="8" fill={white} />
                {/* Tail */}
                <rect x="2" y="5" width="2" height="2" fill={white} />
                <rect x="2" y="9" width="2" height="2" fill={white} />
                {/* Head Eye */}
                <rect x="13" y="7" width="1" height="1" fill={black} />
                {/* Outlines */}
                <rect x="4" y="10" width="8" height="1" fill="#cccccc" />
                <rect x="12" y="11" width="2" height="1" fill="#cccccc" />
              </g>
            );
          case 'SQUID': // Squid / Blooper style
            return (
              <g>
                <rect x="5" y="2" width="6" height="10" fill={white} />
                <rect x="4" y="4" width="8" height="6" fill={white} />
                {/* Eyes */}
                <rect x="6" y="5" width="2" height="3" fill={black} />
                <rect x="9" y="5" width="2" height="3" fill={black} />
                {/* Tentacles */}
                <rect x="5" y="12" width="2" height="3" fill={white} />
                <rect x="9" y="12" width="2" height="3" fill={white} />
                <rect x="7" y="11" width="2" height="3" fill={white} />
              </g>
            );
          case 'COIN': // Coin style
            return (
              <g>
                <ellipse cx="8" cy="8" rx="4" ry="6" fill="#fbbf24" />
                <ellipse cx="8" cy="8" rx="3" ry="5" fill="none" stroke="#d97706" strokeWidth="1" />
                <rect x="7.5" y="4" width="1" height="8" fill="#fef3c7" opacity="0.6" />
              </g>
            );
          default:
            return <rect x="4" y="4" width="8" height="8" fill="gray" />;
        }
      })()}
    </svg>
  );
});

const RippleEffect = () => {
  return useMemo(() => (
    <>
      {Array.from({ length: 20 }).map((_, i) => (
        <div key={`ripple-${i}`} className="w-16 h-full flex-shrink-0 bg-white/20" style={{ clipPath: 'polygon(0% 100%, 25% 0%, 50% 100%, 75% 0%, 100% 100%)' }} />
      ))}
    </>
  ), []);
};

const DecorativeBackground = React.memo(({ phase, camera }: { phase: GamePhase; camera: Camera }) => {
  const clouds = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    left: (i % 5) * 200 + (Math.sin(i) * 50),
    top: (Math.floor(i / 5) * -400) + (Math.cos(i) * 100),
  })), []);

  const corals = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    left: (i % 10) * 150 + (Math.sin(i) * 30),
    top: (Math.floor(i / 10) * 200) + (Math.cos(i) * 50),
  })), []);

  const ramas = useMemo(() => Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    left: (i % 3) * 150 - 50,
    top: (Math.floor(i / 3) * 120),
    rotation: i * 45,
    scale: 0.8 + Math.random() * 0.5
  })), []);

  return (
    <div 
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{ transform: `translate(${-camera.x * 0.3}px, ${-camera.y * 0.3}px)` }}
    >
        {phase === 'ASCENT' ? (
        clouds.map(c => (
            <div key={`cloud-${c.id}`} className="absolute w-24 h-12" style={{ left: c.left, top: c.top }}>
                <MarioCloudSVG />
            </div>
        ))
        ) : (
        <>
          {ramas.map(r => (
              <div 
                key={`rama-${r.id}`} 
                className="absolute w-32 h-4 opacity-30" 
                style={{ 
                    left: r.left, 
                    top: r.top, 
                    backgroundColor: '#3d2b1f', 
                    transform: `rotate(${r.rotation}deg) scale(${r.scale})`,
                    borderRadius: '20px' 
                }} 
              />
          ))}
          {corals.map(c => (
              <div key={`coral-${c.id}`} className="absolute w-12 h-36" style={{ left: c.left, top: c.top }}>
                  <CoralSVG />
              </div>
          ))}
          {/* Seafloor Sand Grains */}
          {Array.from({ length: 30 }).map((_, i) => (
            <div 
              key={`sand-${i}`} 
              className="absolute w-1 h-1 bg-yellow-600/30 rounded-full" 
              style={{ left: (i * 200) % 2000, top: 435 + (Math.sin(i) * 5) }} 
            />
          ))}
        </>
        )}
    </div>
  );
});

export default function App() {
  const [gameState, setGameState] = useState<GameState>('AUTH');
  // User Data
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lbCategory, setLbCategory] = useState<'STORY' | 'INFINITE'>('STORY');
  const [leaderboardData, setLeaderboardData] = useState<AppUser[]>([]);
  const [selectedLbUser, setSelectedLbUser] = useState<AppUser | null>(null);

  // Transition states
  const [phase, setPhase] = useState<GamePhase>('ASCENT');
  const [isInfinite, setIsInfinite] = useState(false);
  const [isStoryMode, setIsStoryMode] = useState(true);
  const [infiniteEnv, setInfiniteEnv] = useState<GamePhase>('ASCENT');
  const [isPaused, setIsPaused] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [introWarning, setIntroWarning] = useState<string | null>(null);

  // New state variables for Registration
  const [regName, setRegName] = useState('');
  const [regGrade, setRegGrade] = useState('');

  // Simplified identification: No Auth listeners needed anymore.
  // We identify solely by the email string the user provides.

  // Test Firestore Connection
  useEffect(() => {
    const test = async () => {
      try {
        const { getDocFromServer } = await import('firebase/firestore');
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore Connected successfully");
      } catch (error: any) {
        if(error.message?.includes('offline')) {
          console.error("Please check your Firebase configuration.");
          setAuthError("Error de conexión con la base de datos.");
        }
      }
    };
    test();
  }, []);

  // Game specific refs
  const playerRef = useRef({ x: 200, y: 300, vx: 0, vy: 0, grounded: false, swimming: false, direction: 1 });
  // Consolidated Frame State for Performance
  const [frameData, setFrameData] = useState({
    score: 0,
    waterLevel: GAME_HEIGHT,
    camera: { x: 0, y: 0 },
    entities: [] as Entity[],
    platforms: [] as Entity[],
    projectiles: [] as Entity[]
  });

  const waterLevelRef = useRef(GAME_HEIGHT);
  const cameraRef = useRef<Camera>({ x: 0, y: 0 });
  const entitiesRef = useRef<Entity[]>([]);
  const projectilesRef = useRef<Entity[]>([]);
  const platformsRef = useRef<Entity[]>([]);
  const requestIdRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const scoreRef = useRef(0);
  const eliminationsRef = useRef(0); // For story mode win condition
  const timeLeftRef = useRef(90);
  const invincibilityRef = useRef(0);
  const waterDamageTimerRef = useRef(0);
  const uidRef = useRef(0);
  const getNextId = useCallback(() => { uidRef.current += 1; return uidRef.current; }, []);

  // Resolution handling
  const screenRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Ensure state is clean when returning to menu
  useEffect(() => {
    if (gameState === 'MENU' || gameState === 'SELECT_MODE' || gameState === 'SELECT_ENVIRONMENT' || gameState === 'INFINITE_INFO' || gameState === 'AUTH' || gameState === 'REGISTRATION' || gameState === 'LEADERBOARD') {
      setIsPaused(false);
      setShowTransition(false);
      sounds.playBGM('MENU');
      if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
    } else if (gameState === 'CREDITS') {
      sounds.playBGM('CREDITS');
    } else if (gameState === 'PLAYING' && !isPaused) {
      sounds.playBGM(phase === 'ASCENT' ? 'ASCENT' : 'SUBMERGED');
    } else if (isPaused || gameState === 'GAME_OVER' || gameState === 'WIN' || gameState === 'NEXT_LEVEL_PROMPT') {
      sounds.stopBGM();
    }
  }, [gameState, isPaused, phase]);

  useEffect(() => {
    const handleResize = () => {
      if (screenRef.current) {
        const { width, height } = screenRef.current.getBoundingClientRect();
        const scaleW = width / GAME_WIDTH;
        const scaleH = height / GAME_HEIGHT;
        setScale(Math.min(scaleW, scaleH));
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Controls
  const keysRef = useRef<{ [key: string]: boolean }>({});

  const resetGame = useCallback((initialPhase: GamePhase = 'ASCENT', storyMode = false, infinite = false) => {
    if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
    
    scoreRef.current = 0;
    eliminationsRef.current = 0;
    timeLeftRef.current = 90;
    invincibilityRef.current = 0;
    waterDamageTimerRef.current = 0;
    uidRef.current = 0; 
    setPhase(initialPhase);
    setIsStoryMode(storyMode);
    setIsInfinite(infinite);
    cameraRef.current = { x: 0, y: 0 };
    setGameState('PLAYING');
    setIsPaused(false);
    setShowTransition(false);
    playerRef.current.direction = 1;

    if (storyMode) {
      if (initialPhase === 'ASCENT') {
        setIntroWarning("Descompone todos los residuos antes de que caigan al agua, y antes de que se te acabe el tiempo.");
      } else {
        setIntroWarning("Ahora evita que los restos de animales marinos se desperdicien");
      }
      setIsPaused(true);
      setTimeout(() => {
        setIntroWarning(null);
        setIsPaused(false);
      }, 3000);
    } else {
      setIntroWarning(null);
      setIsPaused(false);
    }
    
    // Initial platforms - HIGHER DENSITY
    if (initialPhase === 'ASCENT') {
      const basePlatform = {
        id: getNextId(),
        x: 0,
        y: GAME_HEIGHT - 20,
        width: GAME_WIDTH,
        height: 20,
        type: 'PLATFORM'
      };
      
      platformsRef.current = [
        basePlatform,
        ...Array.from({ length: 30 }, (_, i) => ({
          id: getNextId(),
          x: Math.random() * (GAME_WIDTH - 80),
          y: GAME_HEIGHT - ((i + 1) * 70) - 50, // Start higher to leave room for base
          width: 80,
          height: 15,
          type: 'PLATFORM'
        }))
      ];
      
      playerRef.current = { 
        x: GAME_WIDTH / 2 - PLAYER_SIZE / 2, 
        y: GAME_HEIGHT - 20 - PLAYER_SIZE, 
        vx: 0, 
        vy: 0, 
        grounded: true, 
        swimming: false 
      };
      
      waterLevelRef.current = GAME_HEIGHT + 150; // More delay for the first climb
      entitiesRef.current = [];
    } else {
      playerRef.current = { x: 200, y: 440 - PLAYER_SIZE, vx: 0, vy: 0, grounded: true, swimming: true, direction: 1 };
      waterLevelRef.current = -500;
      
      // Fixed Floor for Submerged Phase
      platformsRef.current = [
        {
          id: getNextId(),
          x: -100,
          y: 440,
          width: GAME_WIDTH + 200,
          height: 200,
          type: 'PLATFORM'
        }
      ];

      entitiesRef.current = [];
    }
    projectilesRef.current = [];
    
    // Initial State Sync
    setFrameData({
        score: 0,
        waterLevel: waterLevelRef.current,
        camera: { ...cameraRef.current },
        entities: [...entitiesRef.current],
        platforms: [...platformsRef.current],
        projectiles: [],
        timeLeft: storyMode ? 90 : 0
    });
  }, [getNextId]);

  const spawnDebrisInternal = (currentCameraY: number, currentScore: number, currentPhase: string) => {
    if (currentPhase === 'ASCENT') {
      // Significantly adjusted spawn chance to make it a challenge to reach score
      const spawnChance = isStoryMode ? 0.05 : 0.03;
      if (Math.random() < spawnChance) {
        entitiesRef.current.push({
          id: getNextId(),
          x: Math.random() * (GAME_WIDTH - 60),
          y: currentCameraY - 100,
          width: 60,
          height: 60,
          type: DEBRIS_TYPES[Math.floor(Math.random() * 3)],
          vy: 1.5 // Constant moderate speed
        });
      }
    }
  };

  const shoot = useCallback(() => {
    sounds.playShoot();
    projectilesRef.current.push({
      id: getNextId(),
      x: playerRef.current.x + 10,
      y: playerRef.current.y + 10,
      width: 15,
      height: 15,
      type: 'PROJECTILE',
      vx: playerRef.current.swimming ? (7 * (playerRef.current.direction || 1)) : 0,
      vy: playerRef.current.swimming ? 0 : -10
    });
  }, []);

  const update = useCallback((time: number) => {
    // Story mode win condition - CHECK BEFORE EVERYTHING ELSE
    if (isStoryMode && scoreRef.current >= 10000 && gameState === 'PLAYING') {
        handleEndGame(true);
        return;
    }

    if (isPaused || gameState !== 'PLAYING') return;
    if (time <= lastTimeRef.current && lastTimeRef.current !== 0) return;
    
    // Standard delta time for physics
    const physicsDt = Math.min((time - lastTimeRef.current) / 16, 2); 
    // Absolute delta time in seconds for timer
    const secondsDt = (time - lastTimeRef.current) / 1000;
    
    lastTimeRef.current = time;

    if (isStoryMode) {
      timeLeftRef.current -= secondsDt;
      if (invincibilityRef.current > 0) invincibilityRef.current -= secondsDt;
    }

    const p = playerRef.current;
    
    // Use physicsDt for movement
    const dt = physicsDt;
    
    // Controls logic - NORMALIZE
    const left = keysRef.current['ArrowLeft'] || keysRef.current['a'] || keysRef.current['A'];
    const right = keysRef.current['ArrowRight'] || keysRef.current['d'] || keysRef.current['D'];
    const up = keysRef.current['ArrowUp'] || keysRef.current['w'] || keysRef.current['W'] || keysRef.current[' '];
    const down = keysRef.current['ArrowDown'] || keysRef.current['s'] || keysRef.current['S'];

    if (left) {
      p.vx = -MOVE_SPEED;
      p.direction = -1;
    }
    else if (right) {
      p.vx = MOVE_SPEED;
      p.direction = 1;
    }
    else p.vx = 0;

    if (up && p.grounded) {
      sounds.playJump();
      p.vy = JUMP_FORCE;
      p.grounded = false;
    } else if (p.swimming && down) {
      p.vy = 2;
    } else if (p.swimming && !up && !down) {
        p.vy = 0;
    }

    // Physics
    p.x += p.vx * dt;
    
    // Screen boundaries (400px canvas)
    if (p.x < 15) p.x = 15;
    if (p.x > 385) p.x = 385;

    if (p.swimming && phase === 'SUBMERGED') {
      // Dino style physics even underwater as requested ("la gravedad no se cambia")
      p.vy += GRAVITY * dt;
    } else if (p.swimming) {
      // Transition swimming (Mario style)
      p.vy += 0.1 * dt; 
      if (p.vy > 2) p.vy = 2;
    } else {
      p.vy += GRAVITY * dt;
    }
    p.y += p.vy * dt;

    // Boundaries
    if (p.x < 0) p.x = 0;
    if (p.swimming && p.x > GAME_WIDTH - PLAYER_SIZE) p.x = GAME_WIDTH - PLAYER_SIZE;
    if (!p.swimming && p.x > 1000000) p.x = 1000000; 
    if (p.y > GAME_HEIGHT + 100) {
      sounds.playGameOver();
      handleEndGame(false);
      return;
    }

    // Movement & Water Logic
    if (!p.swimming) {
      if (isStoryMode) {
        // Constant rise speed in story mode as requested
        const storyRiseSpeed = 0.9; 
        waterLevelRef.current -= storyRiseSpeed * dt;

        // Damage while fully covered (p.y > waterLevel means top of mushroom is below surface)
        if (p.y > waterLevelRef.current) {
          waterDamageTimerRef.current -= secondsDt;
          if (waterDamageTimerRef.current <= 0) {
            timeLeftRef.current -= 10;
            sounds.playGameOver(); // Reuse game over as hit sound
            waterDamageTimerRef.current = 2.0;
          }
        } else {
          // Reset timer so it hits immediately upon submerging next time
          waterDamageTimerRef.current = 0;
        }
      } else {
        // Speed increases directly with EVERY point (0.04 growth per point) in Infinite mode
        const riseSpeed = WATER_RISE_INITIAL + (scoreRef.current * 0.04);
        waterLevelRef.current -= riseSpeed * dt;
      }
      
      // Camera follows player UP and DOWN smoothly
      const targetCamY = p.y - 250;
      // Linear interpolation for smooth camera
      cameraRef.current.y += (targetCamY - cameraRef.current.y) * CAM_SMOOTHING;

      // Generation of endless platforms - More frequent generation
      if (platformsRef.current[platformsRef.current.length - 1].y > cameraRef.current.y - 800) {
        const last = platformsRef.current[platformsRef.current.length - 1];
        platformsRef.current.push({
          id: getNextId(),
          x: Math.random() * (GAME_WIDTH - 80),
          y: last.y - 70, // Consistent shorter gap
          width: 80,
          height: 15,
          type: 'PLATFORM'
        });
      }

      // Platform collisions
      p.grounded = false;
      const prevBottom = p.y + PLAYER_SIZE - (p.vy * dt);
      for (const plat of platformsRef.current) {
        // Only collide if falling and the player was above the platform top in the previous frame
        if (p.vy >= 0 && 
            p.x < plat.x + plat.width && 
            p.x + PLAYER_SIZE > plat.x && 
            p.y + PLAYER_SIZE >= plat.y && 
            p.y + PLAYER_SIZE <= plat.y + 25) {
          p.y = plat.y - PLAYER_SIZE;
          p.vy = 0;
          p.grounded = true;
          break;
        }
      }

      // Transition check handled via effect or state but we stay in loop
    } else {
      // Submerged: Fixed-screen horizontal bounds for optimization & challenge
      cameraRef.current.x = 0;
      waterLevelRef.current = -500; 

      // Spawn obstacles & enemies from sides - Balanced for fixed-screen
      const skeletonCount = entitiesRef.current.filter(e => e.type === 'ESQUELETO').length;
      const spawnChance = Math.random();
      // Adjusted limit and chance to make it harder to reach the score goal
      const maxSkeletons = isStoryMode ? 10 : (isInfinite ? 10 : 6);
      const spawnThreshold = isStoryMode ? 0.08 : 0.04;
      
      if (spawnChance < spawnThreshold && skeletonCount < maxSkeletons) { 
         const fromRight = Math.random() < 0.5;
         entitiesRef.current.push({
           id: getNextId(),
           x: fromRight ? GAME_WIDTH + 50 : -100,
           y: 230 + Math.random() * 150, 
           width: 60,
           height: 60,
           type: 'ESQUELETO', 
           vx: fromRight ? -2.0 : 2.0 // Constant speed
         });
      }

      // Floor collisions - Static floor for fixed-screen Submerged
      p.grounded = false;
      for (const plat of platformsRef.current) {
        if (p.vy >= 0 && 
            p.x < plat.x + plat.width && 
            p.x + PLAYER_SIZE > plat.x && 
            p.y + PLAYER_SIZE >= plat.y && 
            p.y + PLAYER_SIZE <= plat.y + 25) {
          p.y = plat.y - PLAYER_SIZE;
          p.vy = 0;
          p.grounded = true;
          break;
        }
      }
    }

    // Projectiles
    projectilesRef.current = projectilesRef.current.filter(pj => {
      pj.x += (pj.vx || 0) * dt;
      pj.y += (pj.vy || 0) * dt;
      return pj.y > cameraRef.current.y - 100 && pj.y < cameraRef.current.y + GAME_HEIGHT + 100 && pj.x > cameraRef.current.x - 100 && pj.x < cameraRef.current.x + GAME_WIDTH + 100;
    });

    // Debris behavior & Collisions
    entitiesRef.current = entitiesRef.current.filter(ent => {
      let hit = false;
      let outOfBounds = false;
      
      // Apply movement to entities (vx/vy)
      ent.x += (ent.vx || 0) * dt;
      ent.y += (ent.vy || 0) * dt;
      
      // Penalty check for ASCENT mode: debris falls into water
      if (!p.swimming && ent.y > waterLevelRef.current) {
        scoreRef.current = Math.max(0, scoreRef.current - 150);
        sounds.playGameOver(); // Damage sound
        outOfBounds = true;
      }
      
      // Penalty check for SUBMERGED mode: debris escapes sides
      if (p.swimming && (ent.x < -120 || ent.x > GAME_WIDTH + 70)) {
        scoreRef.current = Math.max(0, scoreRef.current - 150);
        sounds.playGameOver(); // Damage sound
        outOfBounds = true;
      }

      if (outOfBounds) return false;
      if (p.x < ent.x + ent.width && p.x + PLAYER_SIZE > ent.x && p.y < ent.y + ent.height && p.y + PLAYER_SIZE > ent.y) {
        if (ent.type === 'COIN') {
            sounds.playCollect();
            hit = true;
            scoreRef.current += isStoryMode ? 100 : 1;
        } else {
            if (isStoryMode && invincibilityRef.current <= 0) {
              timeLeftRef.current -= 5;
              invincibilityRef.current = 1.5; // 1.5s of immunity
              sounds.playGameOver(); // Reuse game over sound for hit feedback
              hit = true;
            } else if (!isStoryMode) {
              sounds.playGameOver();
              handleEndGame(false);
              hit = true; // Optimization: stop processing this entity
            }
        }
      }

      // Projectile collision
      if (!hit) {
        for (const pj of projectilesRef.current) {
          if (pj.x < ent.x + ent.width && pj.x + pj.width > ent.x && pj.y < ent.y + ent.height && pj.y + pj.height > ent.y) {
            sounds.playCollect();
            hit = true;
            scoreRef.current += isStoryMode ? 100 : 1;
            eliminationsRef.current += 1;
            projectilesRef.current = projectilesRef.current.filter(prj => prj.id !== pj.id);
            break;
          }
        }
      }
      
      return !hit && ent.y < cameraRef.current.y + GAME_HEIGHT + 300 && ent.y > cameraRef.current.y - 300 && ent.x > cameraRef.current.x - 200 && ent.x < cameraRef.current.x + GAME_WIDTH + 200;
    });

    // Water collision - Skip instant death in Story Mode
    if (!isStoryMode && !p.swimming && p.y + PLAYER_SIZE > waterLevelRef.current) {
      sounds.playGameOver();
      handleEndGame(false);
      return;
    }

    // Win/Prompt conditions
    if (isStoryMode) {
      // Automatic phase transition when time runs out
      if (timeLeftRef.current <= 0) {
        if (!p.swimming) {
          setGameState('NEXT_LEVEL_PROMPT');
          return;
        } else {
          // End of aquatic phase, check total score
          if (scoreRef.current >= 10000) {
            handleEndGame(true);
          } else {
            handleEndGame(false);
          }
          return;
        }
      }
    }

    spawnDebrisInternal(cameraRef.current.y, scoreRef.current, p.swimming ? 'SUBMERGED' : 'ASCENT');
    
    // Sync state for rendering directly in the loop (Single batched update)
    setFrameData({
        score: scoreRef.current,
        camera: { ...cameraRef.current },
        waterLevel: waterLevelRef.current,
        entities: [...entitiesRef.current],
        platforms: [...platformsRef.current],
        projectiles: [...projectilesRef.current],
        timeLeft: Math.max(0, Math.ceil(timeLeftRef.current))
    });
  }, [isPaused, isInfinite, isStoryMode, gameState, phase, currentUser]); // gameState is needed here to update logic if phase changes

  const handleEndGame = async (isWin: boolean) => {
    // Prevent double calls
    if (gameState !== 'PLAYING' && gameState !== 'NEXT_LEVEL_PROMPT') return;
    
    // Set state immediately to prevent logic from running while async saving happens
    setGameState(isWin ? 'WIN' : 'GAME_OVER');

    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.email);
      
      if (isStoryMode) {
        // Story Mode: Permanent record only on the first completion/death
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // If score_historia_v2 is not yet set (or is 0), save it now
          if (userData.score_historia_v2 === undefined || userData.score_historia_v2 === null || userData.score_historia_v2 === 0) {
            const finalScore = isWin ? 10000 : scoreRef.current;
            await updateDoc(userRef, {
              score_historia_v2: finalScore
            });
            // Update local state
            setCurrentUser(prev => prev ? { ...prev, score_historia_v2: finalScore } : null);
          }
        }
      } else {
        // Infinite Mode: Cumulative
        await updateDoc(userRef, {
          score_infinito_v2: increment(scoreRef.current)
        });
        // Update local state
        setCurrentUser(prev => prev ? { ...prev, score_infinito_v2: (currentUser.score_infinito_v2 || 0) + scoreRef.current } : null);
      }
    } catch (e) {
      console.error("Error saving score:", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authEmail.includes('@')) {
      setAuthError("Por favor ingresa un correo válido.");
      return;
    }
    
    setIsBusy(true);
    setAuthError(null);
    try {
      const email = authEmail.toLowerCase().trim();
      const userRef = doc(db, 'users', email);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        setCurrentUser(userDoc.data() as AppUser);
        setGameState('MENU');
      } else {
        setGameState('REGISTRATION');
      }
    } catch (err: any) {
      console.error("Login error:", err);
      // Detailed error for better diagnosis
      const errorMessage = err?.message || err?.code || "Error desconocido";
      setAuthError(`Error al verificar correo: ${errorMessage}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = authEmail.toLowerCase().trim();
    if (!regName || !regGrade || !email) {
      setAuthError("Por favor completa todos los campos.");
      return;
    }
    setIsBusy(true);
    setAuthError(null);
    try {
      const newUser: AppUser = {
        email,
        fullName: regName,
        grade: regGrade,
        score_historia_v2: 0,
        score_infinito_v2: 0,
        createdAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', email), newUser);
      setCurrentUser(newUser);
      setGameState('MENU');
    } catch (err: any) {
      console.error("Registration error:", err);
      const errorMessage = err?.message || err?.code || "Error desconocido";
      setAuthError(`Error al registrar: ${errorMessage}`);
    } finally {
      setIsBusy(false);
    }
  };

  const fetchLeaderboard = async (mode: 'STORY' | 'INFINITE') => {
    setIsBusy(true);
    setLbCategory(mode);
    setSelectedLbUser(null);
    try {
      const scoreField = mode === 'STORY' ? 'score_historia_v2' : 'score_infinito_v2';
      const usersCol = collection(db, 'users');
      
      const q = query(
        usersCol, 
        where(scoreField, '>', 0),
        orderBy(scoreField, 'desc'), 
        limit(50)
      );
      
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => doc.data() as AppUser);
      
      setLeaderboardData(data);
      setGameState('LEADERBOARD');
    } catch (err) {
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  };

  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  const startSubmergedPhase = useCallback(() => {
    playerRef.current.swimming = true;
    setPhase('SUBMERGED');
    eliminationsRef.current = 0; // Reset eliminations for second phase
    timeLeftRef.current = 90; // Reset timer for second scenario
    setShowTransition(true);
    setTimeout(() => setShowTransition(false), 2000);
    playerRef.current.x = 200;
    playerRef.current.y = 440 - PLAYER_SIZE; // On the surface
    playerRef.current.vy = 0;
    playerRef.current.grounded = true;
    cameraRef.current = { x: 0, y: 0 };
    waterLevelRef.current = -500;
    setGameState('PLAYING');
    
    // Initial Submerged Floor (Continuous Sand)
    const nextPlatforms = Array.from({ length: 10 }, (_, i) => ({
      id: getNextId(),
      x: i * 400,
      y: 440,
      width: 405, // Slight overlap
      height: 200, // Cover to bottom
      type: 'PLATFORM'
    }));

    const nextEntities: Entity[] = [];
    
    platformsRef.current = nextPlatforms;
    entitiesRef.current = nextEntities;
    
    setFrameData({
        score: scoreRef.current,
        waterLevel: -500,
        camera: { x: 0, y: 0 },
        entities: [...nextEntities],
        platforms: [...nextPlatforms],
        projectiles: []
    });
  }, [getNextId]);

  // Animation Frame Loop
  useEffect(() => {
    let active = true;
    let lastT = performance.now();
    const loop = (time: number) => {
      if (!active) return;
      // Use time from raf or performance.now if time is undefined
      const frameTime = time || performance.now();
      updateRef.current(frameTime);
      requestIdRef.current = requestAnimationFrame(loop);
    };

    if (gameState === 'PLAYING' && !isPaused) {
      lastTimeRef.current = performance.now();
      requestIdRef.current = requestAnimationFrame(loop);
    }
    
    return () => {
      active = false;
      if (requestIdRef.current) cancelAnimationFrame(requestIdRef.current);
    };
  }, [gameState, isPaused]);

  // Keyboard & Mouse listeners
  useEffect(() => {
    const down = (e: KeyboardEvent) => { 
      // Only prevent default if we are actually playing, so we don't break typing in the login screen
      if (gameState === 'PLAYING' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current[e.key] = true;
      if (e.key === ' ' || e.key === 'z' || e.key === 'Z' || e.key === 'j' || e.key === 'J') shoot();
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (gameState === 'PLAYING') setIsPaused(prev => !prev);
      }
    };
    const up = (e: KeyboardEvent) => { keysRef.current[e.key] = false; };
    const blur = () => { keysRef.current = {}; };
    const click = (e: MouseEvent) => {
      // Don't shoot if clicking UI buttons
      if ((e.target as HTMLElement).closest('button')) return;
      if (gameState === 'PLAYING') shoot();
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('mousedown', click);
    };
  }, [gameState, shoot]);

  const handleShoot = () => {
    shoot();
  };

  return (
    <div className="game-wrapper flex flex-col h-[100dvh] w-full max-w-[800px] mx-auto bg-black select-none overflow-hidden">
      {/* Game Screen Area */}
      <div 
        className="game-container flex-1 relative bg-black overflow-hidden border-b-4 border-[#333]" 
        ref={screenRef}
      >
        <div 
          className="absolute origin-top-left"
          style={{ transform: `scale(${scale})`, width: GAME_WIDTH, height: GAME_HEIGHT, left: '50%', marginLeft: `-${(GAME_WIDTH * scale) / 2}px` }}
        >
          {/* Global CRT Effect Overlay - Always visible for retro feel */}
          <div className="crt-overlay absolute inset-0 z-[1000] pointer-events-none" />
          
          <AnimatePresence mode="wait">
            
            {/* Intro Warning Overlay */}
            {introWarning && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-4 top-20 z-[200] bg-black/90 border-4 border-red-500 p-6 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
              >
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-red-500">
                        <Zap size={20} className="animate-pulse" />
                        <h2 className="text-[12px] pixel-text">¡ADVERTENCIA!</h2>
                    </div>
                    <p className="text-[8px] leading-relaxed text-white text-justify">{introWarning}</p>
                    <div className="h-1 bg-red-500/30 w-full overflow-hidden">
                        <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 5, ease: "linear" }}
                            className="h-full bg-red-500"
                        />
                    </div>
                </div>
              </motion.div>
            )}
            {/* Auth / Login State */}
            {gameState === 'AUTH' && (
              <motion.div 
                key="auth"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black p-6"
              >
                <div className="w-24 h-24 mb-8">
                  <MushroomSVG />
                </div>
                <h2 className="text-sm mb-4 pixel-text text-white">¡BIENVENIDO!</h2>
                <p className="text-[7px] text-gray-400 mb-8 pixel-text">INGRESA TU CORREO PARA GUARDAR TUS PUNTUACIONES</p>
                
                {authError && (
                  <div className="mb-6 p-3 bg-red-900/50 border border-red-500 text-red-200 text-[6px] pixel-text w-full text-center">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleLogin} className="flex flex-col gap-4 w-full max-w-64">
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input 
                      type="email" 
                      placeholder="CORREO@EJEMPLO.COM" 
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      required
                      className="w-full bg-[#111] border-2 border-[#333] p-4 pl-12 text-[8px] pixel-text text-white focus:border-emerald-500 outline-none"
                    />
                  </div>
                  <button 
                    disabled={isBusy}
                    className="bg-white hover:bg-gray-200 text-black p-4 pixel-border text-[10px] flex items-center justify-center gap-2 transition-all"
                  >
                    {isBusy ? (
                      <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin" />
                        <span>ENTRANDO...</span>
                      </div>
                    ) : 'CONTINUAR'}
                  </button>
                </form>

                <p className="text-[5px] text-gray-500 mt-12 text-center max-w-[200px] pixel-text">
                  TUS DATOS SE GUARDARÁN AUTOMÁTICAMENTE EN LA BASE DE DATOS USANDO TU CORREO COMO IDENTIFICADOR.
                </p>
              </motion.div>
            )}

            {/* Registration State */}
            {gameState === 'REGISTRATION' && (
              <motion.div 
                key="registration"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-black"
              >
                <div className="w-full h-full flex flex-col p-4 gap-4">
                  <div className="h-1/2 bg-[#111] border-4 border-white p-6 flex flex-col items-center justify-center gap-4">
                    <h3 className="text-[10px] pixel-text text-white">NOMBRE COMPLETO</h3>
                    <input 
                      type="text" 
                      placeholder="TU NOMBRE AQUÍ" 
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full bg-black border-2 border-white p-4 text-[8px] pixel-text text-white text-center"
                    />
                  </div>
                  <div className="h-1/2 bg-[#111] border-4 border-white p-6 flex flex-col items-center justify-center gap-4">
                    <h3 className="text-[10px] pixel-text text-white">GRADO</h3>
                    <input 
                      type="text" 
                      placeholder="EJ: 11-01" 
                      value={regGrade}
                      onChange={(e) => setRegGrade(e.target.value)}
                      className="w-full bg-black border-2 border-white p-4 text-[8px] pixel-text text-white text-center"
                    />
                  </div>
                  <button 
                    onClick={handleRegister}
                    disabled={isBusy}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white text-black p-4 pixel-border text-[10px] w-48"
                  >
                    {isBusy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'REGISTRAR'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Leaderboard State */}
            {gameState === 'LEADERBOARD' && (
              <motion.div 
                key="leaderboard"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black flex flex-col p-4"
              >
                <div className="flex justify-between items-center mb-6">
                  <button onClick={() => setGameState('MENU')} className="text-[8px] text-gray-400 flex items-center gap-1">
                    <ArrowLeft size={12} /> VOLVER
                  </button>
                  <h2 className="text-[10px] pixel-text text-blue-400">LEADERBOARDS</h2>
                </div>

                <div className="flex gap-2 mb-4">
                  <button 
                    onClick={() => fetchLeaderboard('STORY')}
                    className={`flex-1 text-[8px] p-2 pixel-border ${lbCategory === 'STORY' ? 'bg-emerald-600' : 'bg-[#222]'}`}
                  >
                    ONE MORE TIME
                  </button>
                  <button 
                    onClick={() => fetchLeaderboard('INFINITE')}
                    className={`flex-1 text-[8px] p-2 pixel-border ${lbCategory === 'INFINITE' ? 'bg-blue-600' : 'bg-[#222]'}`}
                  >
                    ALL TIME
                  </button>
                </div>

                <div className="flex-1 bg-[#111] pixel-border p-2 overflow-y-auto custom-scrollbar">
                  {isBusy ? (
                    <div className="h-full flex items-center justify-center">
                      <Loader2 className="animate-spin text-white" />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {leaderboardData.length === 0 ? (
                        <p className="text-[8px] text-center opacity-40 mt-10">SIN REGISTROS</p>
                      ) : (
                        leaderboardData.map((user, idx) => {
                          const score = lbCategory === 'STORY' ? user.score_historia_v2 : user.score_infinito_v2;
                          // Use 10000 as requested
                          const isSuccess = lbCategory === 'STORY' ? ((score || 0) >= 10000) : true;
                          const underlineClass = lbCategory === 'STORY' ? (isSuccess ? "decoration-emerald-500 text-emerald-400" : "decoration-red-500 text-red-400") : "decoration-blue-500 text-blue-400";
                          
                          return (
                            <button 
                              key={user.email} 
                              onClick={() => setSelectedLbUser(selectedLbUser?.email === user.email ? null : user)}
                              className="flex flex-col w-full text-left bg-black/40 p-2 border-b border-white/5 active:bg-white/5"
                            >
                              <div className="flex justify-between items-center w-full">
                                <div className="flex items-center gap-2">
                                  <span className="text-[7px] text-gray-500">{idx + 1}º</span>
                                  <span className={`text-[8px] underline underline-offset-4 ${underlineClass}`}>
                                    {user.fullName.toUpperCase()}
                                  </span>
                                </div>
                                <span className={`text-[8px] ${lbCategory === 'STORY' ? (isSuccess ? 'text-emerald-400' : 'text-red-400') : 'text-blue-400'}`}>
                                  {score?.toLocaleString()}
                                </span>
                              </div>
                              {selectedLbUser?.email === user.email && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  className="mt-2 text-[7px] text-gray-400 flex items-center gap-2"
                                >
                                  <GraduationCap size={10} />
                                  <span>GRADO: {user.grade}</span>
                                </motion.div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Stage Transition Overlay */}
            {showTransition && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-x-4 top-1/4 z-50 flex flex-col items-center justify-center bg-[#0a1d37]/90 border-4 border-blue-400 p-6 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
              >
                <div className="flex flex-col items-center gap-6 p-6">
                  <div className="w-16 h-16 animate-spin-slow">
                    <MushroomSVG color="#3b82f6" opacity="0.5" />
                  </div>
                  <h2 className="text-sm pixel-text text-white text-center">ESCENARIO {phase === 'ASCENT' ? '1' : '2'}</h2>
                  <div className="h-1 w-32 bg-blue-500 animate-width" />
                  <p className="text-[8px] text-blue-200 text-center uppercase tracking-widest">{phase === 'ASCENT' ? 'Bosques Inundados' : 'Bosques Sumergidos'}</p>
                </div>
              </motion.div>
            )}

            {/* Main Menu */}
            {gameState === 'MENU' && (
              <motion.div 
                key="menu"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#5c94fc] to-[#b4d2fe]"
              >
                <div className="absolute inset-0 opacity-20 pointer-events-none">
                    <div className="absolute top-[10%] left-[15%] w-24 h-12"><MarioCloudSVG /></div>
                    <div className="absolute top-[40%] left-[60%] w-24 h-12"><MarioCloudSVG /></div>
                    <div className="absolute top-[70%] left-[10%] w-24 h-12"><MarioCloudSVG /></div>
                </div>
                <div className="mb-6 w-32 h-32 animate-bounce">
                  <MushroomSVG />
                </div>
                <h1 className="text-xl mb-10 pixel-text text-center text-white leading-relaxed px-4 underline underline-offset-8 decoration-emerald-500">FUNGUS ADVENTURE<br/><span className="text-[10px] opacity-60">Bosques inundados colombia</span></h1>
                <div className="flex flex-col gap-4 w-48">
                  <button onClick={() => setGameState('SELECT_MODE')} className="bg-emerald-500 active:bg-emerald-600 p-4 pixel-border text-[10px] flex items-center justify-center gap-2">
                    <Play size={16} /> JUGAR
                  </button>
                  <div className="flex flex-col items-center gap-4">
                    <button onClick={() => setGameState('CREDITS')} className="bg-gray-600 active:bg-gray-700 p-4 pixel-border text-[10px] flex items-center justify-center gap-2 w-full">
                      <Credits size={16} /> CRÉDITOS
                    </button>
                    <button onClick={() => fetchLeaderboard('STORY')} className="bg-blue-600 active:bg-blue-700 p-4 pixel-border text-[10px] flex items-center justify-center gap-2 w-full">
                      <Target size={16} /> LEADERBOARD
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Credits */}
            {gameState === 'CREDITS' && (
              <motion.div 
                key="credits"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black flex flex-col items-center overflow-hidden"
              >
                <div 
                  className="credits-scroll flex flex-col items-center gap-8 py-20 text-center"
                  onAnimationEnd={() => setGameState('MENU')}
                >
                  <div className="text-[10px] space-y-6 px-4 leading-loose">
                    <p className="text-emerald-400">I.E Josefa Campos</p>
                    <p>2026</p>
                    <p>Dayana Jojoa</p>
                    <p className="text-emerald-200">Área: Biología</p>
                    <div className="pt-8">
                      <p className="opacity-60 mb-2">Creadores:</p>
                      <p>Juan Pablo García</p>
                      <p>Joan David Argumedo</p>
                    </div>
                    <p>Grado 11-01</p>
                    <div className="pt-4 pb-10">
                      <p className="text-[8px] text-emerald-400 italic">Bienvenidos a la aventura de bosques inundados de Colombia</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setGameState('MENU')}
                  className="absolute bottom-6 left-6 text-[10px] opacity-50 hover:opacity-100 flex items-center gap-2"
                >
                  <ArrowLeft size={12} /> SALIR
                </button>
              </motion.div>
            )}

            {/* Playing State */}
            {gameState === 'PLAYING' && (
              <div className="absolute inset-0 overflow-hidden">
                {/* Background Layer */}
                <div 
                  className={`absolute inset-0 transition-colors duration-1000 ${
                    phase === 'ASCENT' ? 'bg-gradient-to-b from-[#5c94fc] to-[#b4d2fe]' : 'bg-gradient-to-b from-[#0a1d37] to-[#1e4ad6]'
                  }`}
                />

                {/* Decorative Parallax Background Layer */}
                <DecorativeBackground phase={phase} camera={frameData.camera} />

                {/* Water Surface Ripple (Submerged Phase) */}
                {phase === 'SUBMERGED' && (
                  <div className="absolute top-0 left-0 right-0 h-8 flex overflow-hidden z-0 opacity-80" style={{ transform: `translateX(${-frameData.camera.x % 64}px)` }}>
                    <RippleEffect />
                  </div>
                )}

                {/* Camera mover */}
                <div 
                  className="absolute inset-0"
                  style={{ transform: `translate(${-frameData.camera.x}px, ${-frameData.camera.y}px)` }}
                >
                  {frameData.platforms.map((plat: Entity) => (
                    <Platform key={`plat-${plat.id}`} plat={plat} phase={phase} />
                  ))}

                  {frameData.entities.map(ent => (
                    <div key={`ent-${ent.id}`} className="absolute flex items-center justify-center" style={{ left: ent.x, top: ent.y, width: ent.width, height: ent.height }}>
                        <DebrisSVG type={ent.type} />
                    </div>
                  ))}

                  {frameData.projectiles.map(pj => (
                    <div key={`proj-${pj.id}`} className="absolute animate-pulse" style={{ left: pj.x, top: pj.y, width: pj.width, height: pj.height }}>
                        <MushroomSVG color="#ffcc00" />
                    </div>
                  ))}

                  <div 
                    className="absolute"
                    style={{ 
                      left: playerRef.current.x, 
                      top: playerRef.current.y, 
                      width: PLAYER_SIZE, 
                      height: PLAYER_SIZE,
                      transform: `scaleX(${playerRef.current.direction || 1})`,
                      transition: 'transform 0.1s ease-out'
                    }}
                  >
                    <MushroomSVG />
                  </div>
                </div>

                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start pointer-events-none">
                  <div className="flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6"><MushroomSVG /></div>
                        <p className="text-sm">{frameData.score}</p>
                    </div>
                    {isStoryMode && (
                        <div className="flex items-center gap-2 text-white/80">
                            <Clock size={12} />
                            <p className="text-[10px] pixel-text">{frameData.timeLeft}s</p>
                        </div>
                    )}
                  </div>
                  {!introWarning && (
                  <button 
                    onClick={() => setIsPaused(true)}
                    className="pointer-events-auto w-10 h-10 bg-black/40 border-2 border-white/20 rounded flex items-center justify-center active:bg-white/20"
                  >
                    <Pause size={18} className="text-white" />
                  </button>
                  )}
                </div>

                {phase === 'ASCENT' && (
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-[#3b82f6]/60 pointer-events-none"
                    style={{ top: frameData.waterLevel - frameData.camera.y, borderTop: '4px solid white' }}
                  >
                     <div className="absolute top-0 left-0 right-0 h-4 bg-white/30 animate-pulse" />
                  </div>
                )}
                {phase === 'SUBMERGED' && <div className="absolute inset-0 bg-blue-500/20 pointer-events-none" />}
              </div>
            )}

            {gameState === 'NEXT_LEVEL_PROMPT' && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-8 text-center z-[100]"
              >
                <div className="bg-emerald-900 border-4 border-emerald-400 p-8 pixel-border max-w-[320px]">
                  <h2 className="text-sm mb-4 text-emerald-100 italic">Nada mal, ahora veamos como te va bajo el agua</h2>
                  
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        startSubmergedPhase();
                        if (isStoryMode) {
                            setIntroWarning("Ahora evita que los restos de animales marinos se desperdicien");
                            setIsPaused(true);
                            setTimeout(() => {
                              setIntroWarning(null);
                              setIsPaused(false);
                            }, 3000);
                        }
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-black p-4 text-[10px] pixel-border"
                    >
                      DESCENDER
                    </button>
                    <button 
                      onClick={() => setGameState('MENU')}
                      className="text-[8px] opacity-60 hover:opacity-100"
                    >
                      VOLVER AL MENU
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* States like Game Over, Win use similar full-screen overlays */}
            {gameState === 'GAME_OVER' && (
              <motion.div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center p-8 text-center">
                <h2 className="text-lg mb-4">GAME OVER</h2>
                <div className="flex flex-col gap-4 w-40">
                  <button onClick={() => resetGame(phase, isStoryMode, isInfinite)} className="bg-white text-black p-4 text-[10px] pixel-border">REINTENTAR</button>
                  <button onClick={() => setGameState('MENU')} className="text-xs opacity-60">MENU</button>
                </div>
              </motion.div>
            )}

            {gameState === 'WIN' && (
              <motion.div className="absolute inset-0 bg-blue-900/95 flex flex-col items-center justify-center p-8 text-center z-[300]">
                <h2 className="text-emerald-400 mb-6 pixel-text text-lg">¡VICTORIA!</h2>
                <div className="bg-white/5 p-6 border border-white/10 mb-8 max-w-[320px]">
                    <p className="text-[7px] leading-loose text-emerald-100 text-justify">
                        ¡Victoria! Como hongo del bosque inundado, has cumplido tu misión: transformaste la madera muerta, la hojarasca y restos de animales acuáticos en vida. Gracias a tu labor, los nutrientes vuelven al suelo y el ecosistema sigue floreciendo. ¡El ciclo continúa!
                    </p>
                </div>
                <div className="flex flex-col gap-4 w-48">
                  <button onClick={() => resetGame(isStoryMode ? 'ASCENT' : 'SUBMERGED', isStoryMode, isInfinite)} className="bg-emerald-500 p-4 text-[10px] pixel-border text-black">VOLVER A JUGAR</button>
                  <button onClick={() => setGameState('MENU')} className="bg-blue-600 p-4 text-[10px] pixel-border">VOLVER AL MENU</button>
                  <button onClick={() => setGameState('CREDITS')} className="text-[8px] opacity-60 hover:underline">VER CRÉDITOS</button>
                </div>
              </motion.div>
            )}

            {isPaused && !introWarning && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-[200]">
                <h2 className="mb-8 pixel-text">PAUSA</h2>
                <div className="flex flex-col gap-4 w-48">
                  <button onClick={() => setIsPaused(false)} className="bg-emerald-500 p-4 text-[10px] pixel-border text-black">RESUMIR</button>
                  {isInfinite && (
                    <button 
                      onClick={() => {
                        const nextEnv = phase === 'ASCENT' ? 'SUBMERGED' : 'ASCENT';
                        resetGame(nextEnv, false, true);
                      }} 
                      className="bg-blue-600 p-4 text-[10px] pixel-border"
                    >
                      CAMBIAR ENTORNO
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      setIsPaused(false);
                      setGameState('MENU');
                    }} 
                    className="text-[10px] opacity-50 hover:opacity-100"
                  >
                    MENU
                  </button>
                </div>
              </div>
            )}

            {gameState === 'SELECT_MODE' && (
              <motion.div 
                key="select-mode"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black flex flex-col items-center justify-center p-8 gap-8"
              >
                <h2 className="text-xs pixel-text text-white">ELIGE TU AVENTURA</h2>
                <div className="flex flex-col gap-6 w-full max-w-[280px]">
                  <button 
                    onClick={() => resetGame('ASCENT', true)} 
                    className="group relative overflow-hidden bg-emerald-600 hover:bg-emerald-500 p-6 pixel-border text-[10px]"
                  >
                    <span className="relative z-10 flex flex-col gap-1 items-center">
                        <Book size={24} className="mb-1" />
                        MODO HISTORIA
                        <span className="text-[6px] opacity-60">¡CUMPLE TU MISIÓN!</span>
                    </span>
                  </button>
                  <button 
                    onClick={() => setGameState('INFINITE_INFO')} 
                    className="group relative overflow-hidden bg-blue-600 hover:bg-blue-500 p-6 pixel-border text-[10px]"
                  >
                    <span className="relative z-10 flex flex-col gap-1 items-center">
                        <InfiniteIcon size={24} className="mb-1" />
                        MODO INFINITO
                        <span className="text-[6px] opacity-60">DIVERSIÓN SIN FIN</span>
                    </span>
                  </button>
                </div>
                <button onClick={() => setGameState('MENU')} className="text-[8px] opacity-40 hover:opacity-100 flex items-center gap-2">
                  <ArrowLeft size={10} /> VOLVER
                </button>
              </motion.div>
            )}

            {gameState === 'INFINITE_INFO' && (
              <motion.div 
                key="infinite-info"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="bg-blue-900 border-4 border-blue-400 p-8 pixel-border max-w-[320px]">
                  <h2 className="text-xs mb-4 text-blue-100 flex items-center justify-center gap-2">
                    <InfiniteIcon size={16} /> MODO INFINITO
                  </h2>
                  <p className="text-[8px] mb-8 leading-loose text-blue-200">
                    En este modo debes descomponer sin fin, pero deberas esquivar todo lo que te amenaze.
                  </p>
                  <button 
                    onClick={() => setGameState('SELECT_ENVIRONMENT')}
                    className="w-full bg-blue-500 hover:bg-blue-400 text-white p-4 text-[10px] pixel-border"
                  >
                    ENTENDIDO
                  </button>
                </div>
              </motion.div>
            )}

            {gameState === 'SELECT_ENVIRONMENT' && (
              <motion.div 
                key="select-env"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black flex flex-col items-center justify-center p-8 gap-8"
              >
                <h2 className="text-xs pixel-text text-white">ELIGE EL ENTORNO</h2>
                <div className="grid grid-cols-2 gap-4 w-full h-40">
                  <button onClick={() => resetGame('ASCENT', false, true)} className="bg-emerald-900 border-2 border-emerald-400 flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12"><MarioCloudSVG /></div>
                    <span className="text-[8px]">SECO</span>
                  </button>
                  <button onClick={() => resetGame('SUBMERGED', false, true)} className="bg-blue-900 border-2 border-blue-400 flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12"><CoralSVG /></div>
                    <span className="text-[8px]">INUNDADO</span>
                  </button>
                </div>
                <button onClick={() => setGameState('SELECT_MODE')} className="text-[8px] opacity-40 hover:opacity-100">VOLVER</button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* Controller Area - Enhanced for precision */}
      <div className="bg-[#111] py-8 px-4 lg:hidden relative border-t-4 border-[#333]">
        <div className="flex w-full justify-between items-center max-w-[500px] mx-auto">
          {/* Movement Group */}
          <div className="flex gap-4">
            <button 
              onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture(e.pointerId); keysRef.current['a'] = true; keysRef.current['d'] = false; }}
              onPointerUp={() => { keysRef.current['a'] = false }}
              onPointerCancel={() => { keysRef.current['a'] = false }}
              onPointerLeave={() => { keysRef.current['a'] = false }}
              onContextMenu={(e) => e.preventDefault()}
              className="w-16 h-16 bg-[#333] active:bg-emerald-600 rounded-xl flex items-center justify-center text-white border-b-4 border-black transition-all active:translate-y-1 touch-none"
            >
              <ArrowLeft size={32} />
            </button>
            <button 
              onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture(e.pointerId); keysRef.current['d'] = true; keysRef.current['a'] = false; }}
              onPointerUp={() => { keysRef.current['d'] = false }}
              onPointerCancel={() => { keysRef.current['d'] = false }}
              onPointerLeave={() => { keysRef.current['d'] = false }}
              onContextMenu={(e) => e.preventDefault()}
              className="w-16 h-16 bg-[#333] active:bg-emerald-600 rounded-xl flex items-center justify-center text-white border-b-4 border-black transition-all active:translate-y-1 touch-none"
            >
              <ArrowRight size={32} />
            </button>
          </div>

          {/* Action Group */}
          <div className="flex gap-4">
            <button 
                onPointerDown={(e) => { e.preventDefault(); shoot(); }}
                onContextMenu={(e) => e.preventDefault()}
                className="w-16 h-16 bg-red-600 active:bg-red-500 rounded-full flex items-center justify-center text-white border-b-8 border-black shadow-lg transition-all active:translate-y-2 touch-none"
            >
                <Zap size={32} fill="white" />
            </button>
            <button 
              onPointerDown={(e) => { (e.target as HTMLElement).releasePointerCapture(e.pointerId); keysRef.current['w'] = true }}
              onPointerUp={() => { keysRef.current['w'] = false }}
              onPointerCancel={() => { keysRef.current['w'] = false }}
              onPointerLeave={() => { keysRef.current['w'] = false }}
              onContextMenu={(e) => e.preventDefault()}
              className="w-16 h-16 bg-blue-600 active:bg-blue-500 rounded-full flex items-center justify-center text-white border-b-8 border-black shadow-lg transition-all active:translate-y-2 touch-none"
            >
              <ArrowUp size={32} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
