'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Coins, 
  User, 
  Hash, 
  Play, 
  RotateCcw, 
  ArrowRight, 
  Dices, 
  LogOut,
  AlertCircle,
  Info,
  ChevronLeft,
  Trophy,
  Circle as CircleIcon,
  Square as SquareIcon,
  Triangle as TriangleIcon,
  HelpCircle,
  Settings,
  Volume2,
  VolumeX,
  Eye,
  Pin,
  PinOff
} from 'lucide-react';
import { GameState, Player, Card, CardType, evaluateHand, CardSuit } from '@/lib/game-logic';

const SuitIcon = ({ suit, className }: { suit: CardSuit, className?: string }) => {
  switch (suit) {
    case CardSuit.CIRCLE: return <CircleIcon className={className} />;
    case CardSuit.SQUARE: return <SquareIcon className={className} />;
    case CardSuit.TRIANGLE: return <TriangleIcon className={className} />;
    default: return null;
  }
};

export default function SabaccGame() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [startingCredits, setStartingCredits] = useState('1000');
  const [isSpectator, setIsSpectator] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isRulesPinned, setIsRulesPinned] = useState(false);
  const [betAmount, setBetAmount] = useState('10');
  const [volume, setVolume] = useState(0.8);
  const [chatMessage, setChatMessage] = useState('');
  const [isRollingDice, setIsRollingDice] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAllInConfirm, setShowAllInConfirm] = useState(false);
  const [showBuyIn, setShowBuyIn] = useState(false);

  // Web Audio Context for synthesized sounds
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const volumeRef = useRef(volume);
  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  // Sound effects synthesizer
  const playSound = React.useCallback((type: 'card' | 'chips' | 'dice' | 'win' | 'fold' | 'click' | 'check') => {
    if (!audioCtxRef.current) return;
    
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(volumeRef.current * 0.5, now); // Global volume adjustment
    masterGain.connect(ctx.destination);

    switch (type) {
      case 'click': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(now + 0.05);
        break;
      }
      case 'check': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(now + 0.1);
        break;
      }
      case 'card': {
        // "Swish" sound using noise and filter
        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        filter.Q.setValueAtTime(1, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        noise.start();
        break;
      }
      case 'chips': {
        // Metallic "clink" - two sine waves with different frequencies
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(2800, now);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(3400, now);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(masterGain);
        
        osc1.start();
        osc2.start();
        osc1.stop(now + 0.08);
        osc2.stop(now + 0.08);
        break;
      }
      case 'dice': {
        // Multiple short thumps with a bit of high freq content
        for (let i = 0; i < 3; i++) {
          const t = now + i * 0.08;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);
          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + 0.06);
        }
        break;
      }
      case 'win': {
        // Bright success chime
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        freqs.forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now + i * 0.08);
          gain.gain.setValueAtTime(0, now + i * 0.08);
          gain.gain.linearRampToValueAtTime(0.2, now + i * 0.08 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.08 + 0.2);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.2);
        });
        break;
      }
      case 'fold': {
        // Low frequency "thud"
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(now + 0.2);
        break;
      }
    }
  }, []);

  const leaveRoom = () => {
    socket?.disconnect();
    setGameState(null);
    setSocket(null);
    setIsJoined(false);
  };
  const logsEndRef = useRef<HTMLDivElement>(null);

  const playerNameRef = useRef(playerName);
  const roomIdRef = useRef(roomId);
  const startingCreditsRef = useRef(startingCredits);

  const isSpectatorRef = useRef(isSpectator);

  useEffect(() => {
    playerNameRef.current = playerName;
    roomIdRef.current = roomId;
    startingCreditsRef.current = startingCredits;
    isSpectatorRef.current = isSpectator;
  }, [playerName, roomId, startingCredits, isSpectator]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!isJoined) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        // Avoid synchronous setState in effect
        Promise.resolve().then(() => setSocket(null));
      }
      return;
    }

    if (socketRef.current) return;

    const newSocket = io();
    socketRef.current = newSocket;
    
    newSocket.on('connect', () => {
      setSocket(newSocket);
      // Re-join if we were already in a room (e.g. after a manual reconnect)
      newSocket.emit('joinRoom', { 
        roomId: roomIdRef.current, 
        playerName: playerNameRef.current, 
        startingCredits: startingCreditsRef.current,
        isSpectator: isSpectatorRef.current
      });
    });

    newSocket.on('gameStateUpdate', (state: GameState) => {
      // Play sounds based on phase changes or actions
      setGameState(prev => {
        if (prev) {
          if (state.currentPhase !== prev.currentPhase) {
            if (state.currentPhase === 'DICE') {
              playSound('dice');
              setIsRollingDice(true);
              setTimeout(() => setIsRollingDice(false), 2000);
            }
            if (state.currentPhase === 'SHOWDOWN') playSound('win');
          }
          if (state.logs.length > prev.logs.length) {
            const lastLog = state.logs[state.logs.length - 1];
            if (lastLog.includes('drew') || lastLog.includes('swapped')) playSound('card');
            if (lastLog.includes('bet') || lastLog.includes('raised') || lastLog.includes('called')) playSound('chips');
            if (lastLog.includes('folded')) playSound('fold');
          }
        }
        return state;
      });
    });

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [isJoined, playSound]); // Only depend on isJoined and playSound (which is stable)

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.logs]);

  const joinRoom = () => {
    if (!playerName || !roomId) return;
    socket?.emit('joinRoom', { roomId, playerName, startingCredits, isSpectator });
    setIsJoined(true);
  };

  const setReady = () => {
    socket?.emit('ready', { roomId });
  };

  const toggleSpectator = () => {
    socket?.emit('toggleSpectator', { roomId });
  };

  const addAI = () => {
    socket?.emit('addAI', { roomId });
  };

  const handleJoinGame = () => {
    playSound('click');
    if ((me?.credits || 0) < 15) {
      setShowBuyIn(true);
    } else {
      toggleSpectator();
    }
  };

  const removeAI = (aiId: string) => {
    socket?.emit('removeAI', { roomId, aiId });
  };

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [displayedPlayers, setDisplayedPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (gameState?.players && !isRollingDice) {
      const players = gameState.players;
      Promise.resolve().then(() => setDisplayedPlayers(players));
    }
  }, [gameState?.players, isRollingDice]);

  const cardAction = (action: 'draw' | 'swap_deck' | 'swap_discard' | 'stand', cardId?: string) => {
    socket?.emit('cardAction', { roomId, action, cardId });
    setSelectedCardId(null);
  };

  const betAction = (action: 'call' | 'raise' | 'fold' | 'check' | 'bet' | 'all_in', amount?: string) => {
    socket?.emit('betAction', { roomId, action, amount });
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage.trim()) return;
    socket?.emit('chatMessage', { roomId, text: chatMessage });
    setChatMessage('');
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-[#1a1a1a] border border-amber-500/30 rounded-2xl p-8 shadow-[0_0_50px_rgba(245,158,11,0.1)]">
          <h1 className="text-4xl font-bold text-center mb-8 tracking-tighter text-amber-500 uppercase italic">
            Corellian Spike
          </h1>
          <div className="space-y-6">
            <div>
              <label className="block text-xs uppercase tracking-widest text-amber-500/60 mb-2">Pilot Name</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/40" />
                <input 
                  type="text" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-black/40 border border-amber-500/20 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder="Han Solo"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-amber-500/60 mb-2">Sector ID (Room)</label>
              <div className="relative">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/40" />
                <input 
                  type="text" 
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full bg-black/40 border border-amber-500/20 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-amber-500 transition-colors"
                  placeholder="CORELLIA-1"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-amber-500/60 mb-2">Buy-in Amount (Credits)</label>
              <div className="relative">
                <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/40" />
                <input 
                  type="number" 
                  value={startingCredits}
                  onChange={(e) => setStartingCredits(e.target.value)}
                  className="w-full bg-black/40 border border-amber-500/20 rounded-lg py-3 pl-10 pr-4 focus:outline-none focus:border-amber-500 transition-colors"
                  min="100"
                  max="10000"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  playSound('click');
                  setIsSpectator(!isSpectator);
                }}
                className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-all ${isSpectator ? 'bg-amber-500/20 border-amber-500/50' : 'bg-white/5 border-white/10'}`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center ${isSpectator ? 'bg-amber-500 border-amber-500' : 'border-white/20'}`}>
                  {isSpectator && <Play className="w-3 h-3 text-black fill-current" />}
                </div>
                <span className="text-[10px] uppercase tracking-widest text-white/60 cursor-pointer select-none">
                  Spectate
                </span>
              </button>
            </div>
            <button 
              onClick={() => {
                initAudio();
                playSound('chips');
                joinRoom();
              }}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold py-4 rounded-lg transition-all transform active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest"
            >
              Enter Cantina <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!gameState) return <div className="min-h-screen bg-black flex items-center justify-center text-amber-500">Connecting to Holonet...</div>;

  const me = gameState.players.find(p => p.id === socket?.id);
  const isMyTurn = gameState.players[gameState.turnIndex]?.id === socket?.id;
  const myDisplayedPlayer = displayedPlayers.find(p => p.id === socket?.id);

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-hidden flex flex-col">
      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && !isRulesPinned && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-8 shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-amber-500 font-mono uppercase tracking-tighter">Corellian Spike Rules</h2>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsRulesPinned(true)} 
                    className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/40 hover:text-amber-500 transition-colors"
                    title="Pin to screen"
                  >
                    <Pin className="w-3 h-3" /> Pin
                  </button>
                  <button onClick={() => setShowRules(false)} className="text-white/40 hover:text-white transition-colors">
                    <RotateCcw className="w-6 h-6" />
                  </button>
                </div>
              </div>
              
              <div className="space-y-6 text-sm text-white/70 font-sans leading-relaxed">
                <section>
                  <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">The Objective</h3>
                  <p>In Corellian Spike Sabacc, the goal is to have a hand with a total value as close to <span className="text-amber-500 font-bold">0</span> as possible. Positive totals beat negative totals in a tie (e.g., +1 beats -1). Special hands (Sabaccs) always beat standard Nulrhek hands.</p>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">The Deck</h3>
                  <p>The deck consists of 62 cards: 30 positive (1-10 in 3 suits), 30 negative (-1 to -10 in 3 suits), and 2 Sylops (0). The suits are <span className="text-amber-500">Circle</span>, <span className="text-blue-400">Triangle</span>, and <span className="text-red-400">Square</span>.</p>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Game Flow</h3>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><span className="text-white font-semibold">Ante Phase:</span> Every player pays 10 CR to the Hand Pot and 5 CR to the Sabacc Pot.</li>
                    <li><span className="text-white font-semibold">Card Phase:</span> Players can Draw a card, Swap a card with the deck, Swap with the discard pile, or Stand.</li>
                    <li><span className="text-white font-semibold">Betting Phase:</span> Standard betting (Check, Bet, Raise, Call, Fold). Minimum bet is 10 CR.</li>
                    <li><span className="text-white font-semibold">Spike Dice:</span> Rolled after betting. If the symbols match (doubles), a <span className="text-red-500 font-bold">SABACC SHIFT</span> occurs: everyone discards their hand and gets the same number of cards back from the deck.</li>
                    <li><span className="text-white font-semibold">Showdown:</span> After 3 rounds, players reveal hands. The winner takes the Hand Pot. A &quot;Sabacc&quot; hand (total 0) or better also takes the Sabacc Pot.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Tie-Breaking Rules</h3>
                  <p>If two players have the same score:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Positive scores beat negative scores (e.g., +2 beats -2).</li>
                    <li>Most cards in hand wins.</li>
                    <li>Highest positive card in hand wins.</li>
                    <li>Highest negative card in hand wins.</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-widest">Hand Rankings (Highest to Lowest)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Pure Sabacc:</span> 0 with 2 Sylops</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Full Sabacc:</span> 0 with 1 Sylop + 4 of a kind (10s)</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Fleet:</span> 0 with 1 Sylop + 4 of a kind</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Yee-Haa:</span> 0 with 1 Sylop + 1 pair</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Rhylet:</span> 0 with 3 of a kind + 1 pair</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Squadron:</span> 0 with 4 of a kind</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Gee Whiz:</span> 0 with 1,2,3,4 and -10 (or -1,-2,-3,-4 and 10)</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Straight Khyron:</span> 0 with run of 4</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Banthas Wild:</span> 0 with 3 of a kind</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Rule of Two:</span> 0 with 2 pairs</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-amber-500">Sabacc:</span> 0 with 1 pair or just sum 0</div>
                    <div className="p-2 bg-white/5 rounded border border-white/5"><span className="text-white/40">Nulrhek:</span> Any hand not totaling 0. Closest to 0 wins.</div>
                  </div>
                </section>
              </div>
              
              <button 
                onClick={() => setShowRules(false)}
                className="w-full mt-8 py-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition-all uppercase tracking-widest"
              >
                Got it, Pilot
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 w-full max-w-xs shadow-2xl"
            >
              <h2 className="text-xl font-bold text-amber-500 mb-6 uppercase tracking-widest italic">Settings</h2>
              
              <div className="space-y-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs uppercase tracking-widest text-white/60">Master Volume</label>
                    <span className="text-xs font-mono text-amber-500">{Math.round(volume * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-4">
                    {volume === 0 ? <VolumeX className="w-4 h-4 text-white/20" /> : <Volume2 className="w-4 h-4 text-white/20" />}
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={volume} 
                      onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                      }}
                      className="flex-1 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-white/5">
                  <label className="text-xs uppercase tracking-widest text-white/60">Game Mode</label>
                  <button 
                    onClick={() => {
                      playSound('click');
                      socket?.emit('toggleSpectator', { roomId: gameState.roomId });
                      setShowSettings(false);
                    }}
                    className={`w-full py-3 rounded-xl border transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] font-bold ${me?.isSpectator ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'}`}
                  >
                    {me?.isSpectator ? <Play className="w-3 h-3 fill-current" /> : <Eye className="w-3 h-3" />}
                    {me?.isSpectator ? 'Join Game' : 'Spectate'}
                  </button>
                </div>

                <button 
                  onClick={() => setShowSettings(false)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl uppercase tracking-widest text-xs hover:bg-amber-600 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-In Confirmation Modal */}
      <AnimatePresence>
        {showAllInConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center"
            >
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-widest">All In?</h2>
              <p className="text-white/60 text-sm mb-6">This will bet your entire remaining balance of <span className="text-amber-500 font-bold">{me?.credits} CR</span>. Are you sure?</p>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    playSound('chips');
                    betAction('all_in');
                    setShowAllInConfirm(false);
                  }}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl uppercase tracking-widest text-xs transition-all shadow-lg shadow-red-600/20"
                >
                  Confirm All In
                </button>
                <button 
                  onClick={() => setShowAllInConfirm(false)}
                  className="w-full py-3 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all text-xs uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buy-In Modal */}
      <AnimatePresence>
        {showBuyIn && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              <h2 className="text-xl font-bold text-amber-500 mb-2 uppercase tracking-widest italic">Request Credits</h2>
              <p className="text-white/60 text-xs mb-6">Select an amount to buy back into the game. Remember, the house always takes its cut eventually.</p>
              
              <div className="grid grid-cols-1 gap-3 mb-6">
                {[500, 1000, 5000].map(amount => (
                  <button 
                    key={amount}
                    onClick={() => {
                      playSound('chips');
                      socket?.emit('addCredits', { roomId: gameState.roomId, amount });
                      setShowBuyIn(false);
                    }}
                    className="group flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-amber-500/10 hover:border-amber-500/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/40 transition-colors">
                        <Coins className="w-5 h-5 text-amber-500" />
                      </div>
                      <span className="text-lg font-bold text-white">{amount} CR</span>
                    </div>
                    <ArrowRight className="w-5 h-5 text-white/20 group-hover:text-amber-500 transition-colors" />
                  </button>
                ))}
              </div>
              
              <button 
                onClick={() => setShowBuyIn(false)}
                className="w-full py-3 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all text-xs uppercase tracking-widest"
              >
                Maybe Later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="p-2 sm:p-4 border-b border-white/5 flex justify-between items-center bg-black/50 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <button 
            onClick={leaveRoom}
            className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
            title="Leave Room"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <span className="text-[8px] uppercase tracking-widest text-white/40">{me?.isSpectator ? 'Spectator' : 'Pilot'}</span>
            <span className="text-xs sm:text-sm font-mono text-amber-500">{me?.name}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-[10px] font-mono">
            RD {gameState.currentRound}/3
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg shadow-[0_0_10px_rgba(245,158,11,0.2)]">
            <Coins className="w-3 h-3 text-amber-500" />
            <span className="text-sm font-mono font-bold text-amber-500">{me?.credits || 0}</span>
          </div>
          <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-2">
            <button 
              onClick={() => {
                setShowRules(true);
                setIsRulesPinned(false);
              }}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setShowSettings(true)}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Pinned Rules Sidebar */}
      <AnimatePresence>
        {isRulesPinned && showRules && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed right-2 sm:right-4 top-20 bottom-20 w-48 sm:w-64 bg-black/80 border border-amber-500/20 rounded-2xl z-40 p-3 sm:p-4 overflow-y-auto backdrop-blur-xl shadow-[0_0_30px_rgba(245,158,11,0.1)]"
          >
            <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
              <h3 className="text-[10px] sm:text-xs font-bold text-amber-500 font-mono uppercase tracking-widest">Holographic Rules</h3>
              <button 
                onClick={() => setIsRulesPinned(false)} 
                className="text-white/40 hover:text-white transition-colors"
                title="Unpin"
              >
                <PinOff className="w-3 h-3 sm:w-4 sm:h-4" />
              </button>
            </div>
            <div className="space-y-4 text-[9px] sm:text-[10px] text-white/60 leading-relaxed">
              <section>
                <h4 className="text-white font-bold mb-1 uppercase tracking-widest">The Goal</h4>
                <p>Get a hand total as close to <span className="text-amber-500">0</span> as possible. Positive totals beat negative totals (e.g., +1 beats -1).</p>
              </section>
              <section>
                <h4 className="text-white font-bold mb-1 uppercase tracking-widest">Hand Rankings</h4>
                <ul className="space-y-1">
                  <li className="text-amber-500/80">Pure Sabacc: 2 Sylops (0)</li>
                  <li>Full Sabacc: 1 Sylop + 4x10s</li>
                  <li>Fleet: 1 Sylop + 4 of a kind</li>
                  <li>Yee-Haa: 1 Sylop + 1 pair</li>
                  <li>Rhylet: 3 of a kind + 1 pair</li>
                  <li>Squadron: 4 of a kind</li>
                  <li>Gee Whiz: 1,2,3,4, -10</li>
                  <li>Straight Khyron: Run of 4</li>
                  <li>Banthas Wild: 3 of a kind</li>
                  <li>Rule of Two: 2 pairs</li>
                  <li>Sabacc: Sum 0</li>
                </ul>
              </section>
              <section>
                <h4 className="text-white font-bold mb-1 uppercase tracking-widest">Game Flow</h4>
                <ul className="space-y-1">
                  <li><span className="text-white">Ante:</span> 10 CR Hand, 5 CR Sabacc.</li>
                  <li><span className="text-white">Rounds:</span> 3 rounds total.</li>
                  <li><span className="text-white">Card Phase:</span> Draw, Swap, or Stand.</li>
                  <li><span className="text-white">Betting:</span> Minimum bet is 10 CR.</li>
                  <li><span className="text-white">Dice:</span> Rolled after betting. Doubles = <span className="text-red-500">SHIFT</span> (All redeal).</li>
                </ul>
              </section>
              <section>
                <h4 className="text-white font-bold mb-1 uppercase tracking-widest">Tie-Breaking</h4>
                <ol className="list-decimal pl-3 space-y-1">
                  <li>Positive beats Negative</li>
                  <li>Most cards in hand</li>
                  <li>Highest positive card</li>
                  <li>Highest suit (Circle &gt; Triangle &gt; Square)</li>
                </ol>
              </section>
              <section>
                <h4 className="text-white font-bold mb-1 uppercase tracking-widest">The Pots</h4>
                <p><span className="text-amber-500">Hand Pot:</span> Won by the best hand.</p>
                <p><span className="text-red-500">Sabacc Pot:</span> Won only by a hand totaling 0.</p>
              </section>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Table Area */}
      <main className="flex-1 relative p-4 flex flex-col items-center justify-start overflow-y-auto">
          {me?.isSpectator && (
            <div className="w-full max-w-md bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-center justify-between backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5 text-amber-500" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Spectator Mode</span>
                  <span className="text-[10px] text-amber-500/60">You are watching the game</span>
                </div>
              </div>
            <button 
              onClick={() => {
                playSound('click');
                socket?.emit('toggleSpectator', { roomId: gameState.roomId });
              }}
              className="px-4 py-2 bg-amber-500 text-black font-bold rounded-lg text-[10px] uppercase tracking-widest hover:bg-amber-600 transition-all"
            >
              Join Game
            </button>
            </div>
          )}

          {/* Opponents */}
          <div className="w-full flex justify-center gap-2 sm:gap-4 flex-wrap mb-4 sm:mb-8">
            {displayedPlayers.filter(p => p.id !== socket?.id).map(p => (
              <div key={p.id} className={`flex flex-col items-center p-2 sm:p-3 rounded-xl border transition-all relative min-w-[100px] sm:min-w-[120px] ${p.isFolded ? 'opacity-40 grayscale' : 'bg-white/5 border-white/10'}`}>
                {/* Dealer Button for Opponents */}
                {gameState.players[gameState.dealerIndex]?.id === p.id && (
                  <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full border border-black flex items-center justify-center shadow-lg z-10" title="Dealer">
                    <span className="text-[8px] font-bold text-black">D</span>
                  </div>
                )}
                {gameState.currentPhase === 'JOINING' && p.isAI && (
                  <button 
                    onClick={() => removeAI(p.id)}
                    className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-lg transition-colors z-10"
                    title="Remove Bot"
                  >
                    <LogOut className="w-3 h-3" />
                  </button>
                )}
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center mb-1 shadow-lg">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                </div>
                <span className="text-[10px] sm:text-xs font-medium flex items-center gap-1">
                  {p.name}
                  {p.isAI && <span className="text-[7px] bg-white/10 px-1 rounded text-white/40">AI</span>}
                </span>
                <span className="text-[8px] sm:text-[10px] text-amber-500/60 font-mono">{p.credits} CR</span>
                
                <div className="flex gap-0.5 sm:gap-1 mt-2 flex-wrap justify-center">
                  {p.hand.map((card, i) => (
                    <motion.div 
                      key={card.id} 
                      layoutId={card.id}
                      initial={{ scale: 0, x: 0, y: -50 }}
                      animate={{ scale: 1, x: 0, y: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25, mass: 0.8 }}
                      className={`w-10 h-14 sm:w-14 sm:h-20 rounded-lg border flex items-center justify-center relative overflow-hidden ${gameState.currentPhase === 'SHOWDOWN' ? 'bg-zinc-800 border-white/20' : 'bg-amber-900/40 border-amber-500/30'}`}
                    >
                      {gameState.currentPhase === 'SHOWDOWN' ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-[10px] sm:text-sm font-bold font-mono ${card.type === CardType.POSITIVE ? 'text-blue-400' : card.type === CardType.NEGATIVE ? 'text-red-400' : 'text-amber-400'}`}>
                            {card.value}
                          </span>
                          <SuitIcon suit={card.suit} className="w-2 h-2 sm:w-3 sm:h-3 opacity-40" />
                        </div>
                      ) : (
                        <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(245,158,11,0.1)_2px,rgba(245,158,11,0.1)_4px)]" />
                      )}
                    </motion.div>
                  ))}
                </div>

                {gameState.currentPhase === 'SHOWDOWN' && !p.isFolded && (
                  <div className="mt-1 text-[7px] sm:text-[8px] font-mono text-amber-500/80 bg-black/40 px-1.5 py-0.5 rounded border border-amber-500/20 text-center">
                    {evaluateHand(p.hand).rankName}
                  </div>
                )}

                {gameState.currentPhase === 'JOINING' && (
                  <div className={`mt-1 text-[7px] sm:text-[8px] uppercase tracking-widest ${p.isReady ? 'text-green-500' : 'text-white/20'}`}>
                    {p.isReady ? 'Ready' : 'Waiting'}
                  </div>
                )}
              </div>
            ))}
          </div>

        {/* Center Table */}
        <div className="w-full max-w-xl py-6 sm:py-12 sm:aspect-[2.5/1] rounded-[40px] sm:rounded-[60px] border-2 border-white/5 bg-gradient-to-b from-white/5 to-transparent flex flex-col items-center justify-center gap-2 relative mb-4 sm:mb-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.05)_0%,transparent_70%)]" />
          
          {/* Draw Deck & Discard Pile */}
          <div className="flex gap-6 sm:gap-8 items-center z-10 scale-90 sm:scale-100">
            {/* Draw Deck */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-widest text-white/20">Draw</span>
              <div className="relative">
                <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 bg-amber-900/20 border-amber-500/30 shadow-xl flex items-center justify-center overflow-hidden">
                  <div className="w-full h-full bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(245,158,11,0.05)_2px,rgba(245,158,11,0.05)_4px)]" />
                </div>
                <div className="absolute -top-1 -right-1 w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 bg-amber-900/20 border-amber-500/30 -z-10" />
              </div>
            </div>

            {/* Central Pots */}
            <div className="flex flex-col items-center gap-2 px-6 py-3 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
              <div className="flex flex-col items-center">
                <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] text-white/30">Main Pot</span>
                <span className="text-xl sm:text-2xl font-mono text-amber-500 font-bold">{gameState.handPot}</span>
              </div>
              <div className="w-8 h-px bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] text-white/30">Sabacc Pot</span>
                <span className="text-lg sm:text-xl font-mono text-red-500/80">{gameState.sabaccPot}</span>
              </div>
            </div>

            {/* Discard Pile */}
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] uppercase tracking-widest text-white/20">Discard</span>
              {gameState.discardPile.length > 0 ? (
                <div className={`w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center relative shadow-xl bg-zinc-900 border-white/20`}>
                  <span className={`text-2xl sm:text-3xl font-bold font-mono ${gameState.discardPile[gameState.discardPile.length-1].type === CardType.POSITIVE ? 'text-blue-400' : gameState.discardPile[gameState.discardPile.length-1].type === CardType.NEGATIVE ? 'text-red-400' : 'text-amber-400'}`}>
                    {gameState.discardPile[gameState.discardPile.length-1].value}
                  </span>
                </div>
              ) : (
                <div className="w-16 h-24 sm:w-20 sm:h-28 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center">
                  <span className="text-[8px] uppercase tracking-widest text-white/10">Empty</span>
                </div>
              )}
            </div>
          </div>

          {gameState.currentPhase === 'DICE' && (
            <motion.div 
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 p-3 sm:p-4 bg-black/95 border border-amber-500 rounded-2xl shadow-[0_0_40px_rgba(245,158,11,0.4)] z-20"
            >
              <div className="text-[8px] sm:text-[10px] uppercase tracking-[0.3em] text-amber-500 font-bold">
                {isRollingDice ? "Rolling..." : "Dice Roll"}
              </div>
              <div className="flex gap-3 sm:gap-4">
                {isRollingDice ? (
                  <>
                    <motion.div 
                      animate={{ 
                        rotate: [0, 90, 180, 270, 360], 
                        scale: [1, 1.2, 1],
                        x: [0, -5, 5, -5, 0],
                        y: [0, 5, -5, 5, 0]
                      }}
                      transition={{ repeat: Infinity, duration: 0.15 }}
                      className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/20 border border-amber-500 text-amber-500 rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold"
                    >
                      ?
                    </motion.div>
                    <motion.div 
                      animate={{ 
                        rotate: [360, 270, 180, 90, 0], 
                        scale: [1, 1.2, 1],
                        x: [0, 5, -5, 5, 0],
                        y: [0, -5, 5, -5, 0]
                      }}
                      transition={{ repeat: Infinity, duration: 0.15 }}
                      className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500/20 border border-amber-500 text-amber-500 rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold"
                    >
                      ?
                    </motion.div>
                  </>
                ) : (
                  <>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 text-black rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold">
                      {gameState.lastDiceRoll?.[0]}
                    </div>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 text-black rounded-lg flex items-center justify-center text-xl sm:text-2xl font-bold">
                      {gameState.lastDiceRoll?.[1]}
                    </div>
                  </>
                )}
              </div>
              {!isRollingDice && gameState.lastDiceRoll?.[0] === gameState.lastDiceRoll?.[1] && (
                <div className="text-red-500 font-bold uppercase tracking-widest text-[10px] animate-pulse">
                  Sabacc Shift!
                </div>
              )}
            </motion.div>
          )}

          {gameState.currentPhase === 'JOINING' && (
            <div className="text-center z-10">
              <h2 className="text-xl font-bold text-amber-500 mb-2 uppercase tracking-widest italic">
                {me?.isSpectator ? 'Spectating Room' : 'Waiting for Players'}
              </h2>
              <div className="flex flex-col gap-2">
                {!me?.isSpectator && (
                  !me?.isReady ? (
                    (me?.credits || 0) < 15 ? (
                      <div className="flex flex-col gap-3">
                        <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl max-w-[200px] mx-auto">
                          <p className="text-[10px] text-red-400 uppercase tracking-widest font-bold">Insufficient Credits</p>
                          <p className="text-[9px] text-white/40 mt-1">You need at least 15 CR to pay the ante.</p>
                        </div>
                        <button 
                          onClick={() => {
                            playSound('click');
                            setShowBuyIn(true);
                          }}
                          className="px-6 py-2 bg-amber-500 text-black font-bold rounded-full hover:bg-amber-600 transition-all flex items-center gap-2 mx-auto text-sm shadow-lg shadow-amber-500/20"
                        >
                          <Coins className="w-4 h-4" /> Request Credits
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => {
                          playSound('click');
                          setReady();
                        }}
                        className="px-6 py-2 bg-amber-500 text-black font-bold rounded-full hover:bg-amber-600 transition-all flex items-center gap-2 mx-auto text-sm"
                      >
                        <Play className="w-3 h-3" /> Ready
                      </button>
                    )
                  ) : (
                    <div className="text-white/60 animate-pulse text-xs">Waiting for others...</div>
                  )
                )}
                
                <button 
                  onClick={handleJoinGame}
                  className="px-4 py-1.5 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all text-[10px] uppercase tracking-widest mx-auto mt-2"
                >
                  {me?.isSpectator ? 'Join Game' : 'Sit Out (Spectate)'}
                </button>

                {me?.isSpectator && (
                  <div className="text-white/40 text-[10px] uppercase tracking-widest mt-1">You are observing the game</div>
                )}

                {!me?.isSpectator && gameState.players.length < 6 && (
                  <button 
                    onClick={() => {
                      playSound('click');
                      addAI();
                    }}
                    className="px-4 py-1.5 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-all text-xs flex items-center gap-2 mx-auto"
                  >
                    <User className="w-3 h-3" /> Add AI
                  </button>
                )}
              </div>
            </div>
          )}

          {gameState.currentPhase === 'SHOWDOWN' && (
            <div className="text-center z-10 bg-black/90 p-6 rounded-2xl border-2 border-amber-500 shadow-[0_0_50px_rgba(245,158,11,0.3)] max-w-sm mx-auto">
              <Trophy className="w-12 h-12 text-amber-500 mx-auto mb-4 animate-bounce" />
              <h2 className="text-2xl font-bold text-amber-500 mb-1 uppercase italic tracking-tighter">Winner Announced</h2>
              <div className="text-xl font-mono text-white mb-2">
                {gameState.players.find(p => p.id === gameState.winnerId)?.name || "Unknown Pilot"}
              </div>
              <p className="text-white/60 mb-6 text-xs uppercase tracking-widest">
                {gameState.players.find(p => p.id === gameState.winnerId)?.hand && 
                  evaluateHand(gameState.players.find(p => p.id === gameState.winnerId)!.hand).rankName}
              </p>
              {(me?.credits || 0) < 15 && !me?.isSpectator ? (
                <button 
                  onClick={() => {
                    playSound('click');
                    setShowBuyIn(true);
                  }}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-600 transition-all text-sm uppercase tracking-widest mb-2"
                >
                  Request Credits
                </button>
              ) : (
                <button 
                  onClick={() => {
                    playSound('click');
                    setReady();
                  }}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-600 transition-all text-sm uppercase tracking-widest mb-2"
                >
                  Next Game
                </button>
              )}
              <button 
                onClick={handleJoinGame}
                className="w-full py-2 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all text-[10px] uppercase tracking-widest"
              >
                {me?.isSpectator ? 'Join Next Game' : 'Sit Out (Spectate)'}
              </button>
            </div>
          )}
        </div>

        {/* My Hand */}
        <div className="w-full flex flex-col items-center gap-2 sm:gap-4 mb-4 sm:mb-8">
          {myDisplayedPlayer?.hand.length === 0 && gameState.currentPhase !== 'JOINING' && (
            <div className="text-amber-500/60 font-mono text-sm animate-pulse my-8">
              Waiting for next game to start...
            </div>
          )}
          <div className="flex gap-1 sm:gap-2 flex-wrap justify-center">
            <AnimatePresence mode="popLayout">
              {myDisplayedPlayer?.hand.map((card, i) => (
                <motion.div
                  key={card.id}
                  layoutId={card.id}
                  initial={{ y: 100, opacity: 0, rotateY: 90, scale: 0.5 }}
                  animate={{ 
                    y: selectedCardId === card.id ? -15 : 0, 
                    opacity: 1,
                    rotateY: 0,
                    scale: selectedCardId === card.id ? 1.05 : 1
                  }}
                  exit={{ y: -100, opacity: 0, scale: 0.5 }}
                  transition={{ 
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                    mass: 0.8,
                    delay: i * 0.03 
                  }}
                  onClick={() => isMyTurn && gameState.currentPhase === 'CARD' && setSelectedCardId(card.id === selectedCardId ? null : card.id)}
                  className={`w-14 h-20 sm:w-20 sm:h-28 rounded-lg border-2 flex flex-col items-center justify-center relative shadow-xl cursor-pointer transition-all group ${
                    selectedCardId === card.id ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-black border-amber-500' : ''
                  } ${
                    card.type === CardType.POSITIVE ? 'bg-blue-900/20 border-blue-500/30 text-blue-400 hover:border-blue-400' :
                    card.type === CardType.NEGATIVE ? 'bg-red-900/20 border-red-500/30 text-red-400 hover:border-red-400' :
                    'bg-amber-900/20 border-amber-500/30 text-amber-400 hover:border-amber-400'
                  }`}
                >
                  <div className="absolute top-1 left-1 flex flex-col items-center gap-0 opacity-40 group-hover:opacity-100 transition-opacity">
                    <SuitIcon suit={card.suit} className="w-2 h-2" />
                    <span className="text-[6px] sm:text-[8px] font-mono font-bold leading-none">{card.value}</span>
                  </div>
                  
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-lg sm:text-2xl font-bold font-mono tracking-tighter">{card.value}</span>
                    <SuitIcon suit={card.suit} className="w-4 h-4 sm:w-5 sm:h-5 opacity-20" />
                  </div>

                  <div className="absolute bottom-1 right-1 flex flex-col items-center gap-0 opacity-40 group-hover:opacity-100 transition-opacity rotate-180">
                    <SuitIcon suit={card.suit} className="w-2 h-2" />
                    <span className="text-[6px] sm:text-[8px] font-mono font-bold leading-none">{card.value}</span>
                  </div>
                  
                  {/* Dealer Button */}
                  {gameState.players[gameState.dealerIndex]?.id === myDisplayedPlayer?.id && i === 0 && (
                    <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full border border-black flex items-center justify-center shadow-lg z-10" title="Dealer">
                      <span className="text-[8px] font-bold text-black">D</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {myDisplayedPlayer && !myDisplayedPlayer.isFolded && (
            <div className="px-3 py-1 bg-black/60 border border-white/10 rounded-full text-[10px] font-mono text-white/60 flex gap-3">
              <div>
                Val: <span className={myDisplayedPlayer.hand.reduce((a, c) => a + c.value, 0) === 0 ? 'text-amber-500 font-bold' : 'text-white'}>
                  {myDisplayedPlayer.hand.reduce((a, c) => a + c.value, 0)}
                </span>
              </div>
              <div className="border-l border-white/10 pl-3 text-amber-500/80">
                {evaluateHand(myDisplayedPlayer.hand).rankName}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Controls & Logs */}
      <footer className="p-4 sm:p-6 border-t border-white/5 bg-black/80 backdrop-blur-xl flex flex-col lg:flex-row gap-4 sm:gap-6 min-h-[16rem] lg:h-64">
        {/* Controls */}
        <div className="flex-1 flex flex-col justify-center gap-3 sm:gap-4">
          {me?.isSpectator ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
              <div className="w-12 h-12 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                <User className="w-6 h-6 text-white/20" />
              </div>
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">Spectator Mode</span>
              <span className="text-[10px] text-white/20 italic">Observe the game logic and player strategies</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-1 sm:mb-2">
                <div className={`w-3 h-3 rounded-full ${isMyTurn ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-lg sm:text-2xl font-black uppercase tracking-widest ${isMyTurn ? 'text-amber-500 animate-pulse' : 'text-white/40'}`}>
                  {isMyTurn ? "Your Turn" : `Waiting for ${gameState.players[gameState.turnIndex]?.name}`}
                </span>
                {isMyTurn && gameState.currentPhase === 'CARD' && !selectedCardId && (
                  <span className="text-[10px] text-amber-500/60 animate-pulse ml-auto">Select a card to swap</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 sm:gap-3">
                {me?.credits === 0 && (
                  <div className="w-full flex flex-col items-center gap-2 p-4 bg-red-900/20 border border-red-500/30 rounded-xl">
                    <span className="text-red-500 font-bold uppercase tracking-widest text-sm">Out of Credits</span>
                    <button 
                      onClick={() => { playSound('click'); setShowBuyIn(true); }}
                      className="px-6 py-2 bg-amber-500 text-black font-bold rounded-full hover:bg-amber-600 transition-all uppercase tracking-widest text-xs"
                    >
                      Request Credits
                    </button>
                  </div>
                )}

                {gameState.currentPhase === 'CARD' && isMyTurn && (
                  <>
                    <button onClick={() => { playSound('card'); cardAction('draw'); }} className="flex-1 min-w-[80px] py-3 sm:py-4 bg-black/60 border border-amber-500/50 hover:bg-amber-500/20 text-amber-500 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(245,158,11,0.1)]">DRAW</button>
                    <button 
                      disabled={!selectedCardId}
                      onClick={() => { playSound('card'); cardAction('swap_deck', selectedCardId!); }} 
                      className={`flex-1 min-w-[80px] py-3 sm:py-4 bg-black/60 border border-blue-500/50 hover:bg-blue-500/20 text-blue-400 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(59,130,246,0.1)] ${!selectedCardId ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      SWAP DECK
                    </button>
                    <button 
                      disabled={!selectedCardId || gameState.discardPile.length === 0}
                      onClick={() => { playSound('card'); cardAction('swap_discard', selectedCardId!); }} 
                      className={`flex-1 min-w-[80px] py-3 sm:py-4 bg-black/60 border border-purple-500/50 hover:bg-purple-500/20 text-purple-400 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(168,85,247,0.1)] ${(!selectedCardId || gameState.discardPile.length === 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      SWAP DISCARD
                    </button>
                    <button onClick={() => { playSound('click'); cardAction('stand'); }} className="flex-1 min-w-[80px] py-3 sm:py-4 bg-black/60 border border-white/30 hover:bg-white/10 text-white/80 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs">STAND</button>
                  </>
                )}

                {gameState.currentPhase === 'BETTING' && isMyTurn && (
                  <>
                    <div className="flex-1 min-w-[120px] flex flex-col gap-2">
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => { playSound('click'); setBetAmount(prev => Math.max(1, parseInt(prev) - 10).toString()); }}
                          className="w-7 h-7 sm:w-10 sm:h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                        >
                          -
                        </button>
                        <input 
                          type="number" 
                          value={betAmount}
                          onChange={(e) => setBetAmount(e.target.value)}
                          className="flex-1 bg-black border border-white/20 rounded-lg py-1 text-center font-mono text-sm sm:text-lg w-12"
                        />
                        <button 
                          onClick={() => { playSound('click'); setBetAmount(prev => (parseInt(prev) + 10).toString()); }}
                          className="w-7 h-7 sm:w-10 sm:h-10 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex gap-1">
                        {[10, 50, 100].map(val => (
                          <button 
                            key={val}
                            onClick={() => { playSound('click'); setBetAmount(prev => (parseInt(prev) + val).toString()); }}
                            className="flex-1 py-1 bg-white/5 border border-white/10 rounded text-[9px] hover:bg-white/10 transition-colors"
                          >
                            +{val}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { playSound('chips'); betAction(gameState.currentBet === 0 ? 'bet' : 'raise', betAmount); }} className="w-full py-3 bg-amber-500 text-black hover:bg-amber-400 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                        {gameState.currentBet === 0 ? 'Bet' : 'Raise'}
                      </button>
                    </div>
                    <div className="flex-1 flex flex-col gap-2">
                      {gameState.currentBet > (me?.betThisRound || 0) ? (
                        <button onClick={() => { playSound('chips'); betAction('call'); }} className="w-full py-3 bg-black/60 border border-green-500/50 hover:bg-green-500/20 text-green-400 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(34,197,94,0.1)]">CALL ({gameState.currentBet - (me?.betThisRound || 0)})</button>
                      ) : (
                        <button onClick={() => { playSound('check'); betAction('check'); }} className="w-full py-3 bg-black/60 border border-blue-500/50 hover:bg-blue-500/20 text-blue-400 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(59,130,246,0.1)]">CHECK</button>
                      )}
                      <div className="flex gap-2">
                        <button onClick={() => { playSound('fold'); betAction('fold'); }} className="flex-1 py-3 bg-black/60 border border-red-500/50 hover:bg-red-500/20 text-red-500 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(239,68,68,0.1)]">FOLD</button>
                        <button onClick={() => { playSound('click'); setShowAllInConfirm(true); }} className="flex-1 py-3 bg-black/60 border border-amber-500/50 hover:bg-amber-500/20 text-amber-500 rounded-lg font-bold transition-all uppercase tracking-widest text-[10px] sm:text-xs shadow-[0_0_10px_rgba(245,158,11,0.1)]">ALL IN</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Logs & Chat */}
        <div className="flex-1 lg:w-96 bg-black/40 border border-white/10 rounded-xl p-3 sm:p-4 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] uppercase tracking-widest text-white/40">Comms Log</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar max-h-32 lg:max-h-none">
            {/* System Logs */}
            {gameState.logs.slice(-10).map((log, i) => (
              <div key={`log-${i}`} className="text-[10px] font-mono text-white/40 leading-tight italic">
                {log}
              </div>
            ))}
            {/* Chat Messages */}
            {gameState.messages.map((msg, i) => (
              <div key={`msg-${i}`} className="text-[11px] font-mono leading-tight">
                <span className="text-amber-500 mr-2">{msg.sender}:</span>
                <span className="text-white/80">{msg.text}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
          <form onSubmit={sendChatMessage} className="mt-2 flex gap-2">
            <input 
              type="text" 
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Type message..."
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-amber-500/50 transition-colors"
            />
            <button type="submit" className="p-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-500 hover:bg-amber-500 hover:text-black transition-all">
              <Play className="w-3 h-3" />
            </button>
          </form>
        </div>

        {/* My Stats */}
        <div className="hidden lg:flex w-48 flex-col justify-center items-end gap-1">
          <span className="text-[10px] uppercase tracking-widest text-white/40">Active Pilot</span>
          <span className="text-xl font-mono text-amber-500">{me?.name}</span>
          <div className="flex items-center gap-2 text-[10px] text-white/40 uppercase tracking-widest">
            <User className="w-3 h-3" /> Status: {me?.isFolded ? 'Folded' : 'In Game'}
          </div>
        </div>
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}
