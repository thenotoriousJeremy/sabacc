'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  ChevronLeft,
  Coins,
  Flag,
  Flame,
  HelpCircle,
  Menu,
  Play,
  QrCode,
  Smile,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import { CANTINA_STAGES } from '@/lib/cantina-tour';
import { formatKesselShareCard, getUtcDateKey } from '@/lib/daily-seed';
import {
  BotSkill,
  ClientGameState,
  evaluateHand,
  GameMode,
  HAND_CODEX_META,
  LobbySnapshot,
  Player,
  previewSwap,
  spendableFor,
  StakesTier,
  TieRule,
} from '@/lib/game-logic';
import { armAudio, playCue, setCantinaAmbience, SoundCue, triggerHaptic } from '@/lib/audio';
import { LocalGameTransport } from '@/lib/local-transport';
import { QUICK_EMOTES } from '@/lib/personas';
import {
  claimDailyStipend,
  defaultDossier,
  eraseLocalDossier,
  FELT_THEMES,
  loadDossier,
  PilotDossier,
  saveDossier,
  settleShowdownToDossier,
} from '@/lib/progression';
import { AdminModal } from '@/app/components/admin-modal';
import { AnimatedCredits } from '@/app/components/animated-credits';
import { AuthGate } from '@/app/components/auth-gate';
import { CommandDrawer } from '@/app/components/command-drawer';
import { CreditIngotStack } from '@/app/components/credit-chips';
import { DossierModal, DossierTab } from '@/app/components/dossier-modal';
import { LandingHub } from '@/app/components/landing-hub';
import { LedgerModal } from '@/app/components/ledger-modal';
import { LegalModal } from '@/app/components/legal-modal';
import { QrInviteModal } from '@/app/components/qr-invite-modal';
import { RulesDrawer } from '@/app/components/rules-drawer';
import { SabaccCard } from '@/app/components/sabacc-card';
import { ShowdownOverlay } from '@/app/components/showdown-overlay';
import { SpikeDiceCradle, SpikeDiceOverlay } from '@/app/components/spike-dice';
import { TutorialModal } from '@/app/components/tutorial-modal';

type GameTransport = Socket | LocalGameTransport;

interface StoredSession {
  token: string;
  playerId: string;
  roomId: string;
}

interface AuthStatusResponse {
  locked: boolean;
  authenticated: boolean;
  passwordEnabled: boolean;
  oidcEnabled: boolean;
  oidcProviderName: string;
  adminConfigured: boolean;
  canBootstrapAdmin: boolean;
  user: { name: string; isAdmin: boolean; authMethod: string } | null;
}

const sessionKey = (roomId: string) => `sabacc:session:${roomId.toUpperCase()}`;

function loadSession(roomId: string): StoredSession | null {
  if (typeof window === 'undefined' || !roomId || roomId === 'LOCAL') return null;
  try {
    const raw = window.sessionStorage.getItem(sessionKey(roomId));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession) {
  if (typeof window === 'undefined' || session.roomId === 'LOCAL') return;
  try {
    window.sessionStorage.setItem(sessionKey(session.roomId), JSON.stringify(session));
  } catch {
    // Ignore private-mode storage errors.
  }
}

const LAST_TABLE_KEY = 'sabacc:lastTable';

interface LastTable {
  roomId: string;
  playerName: string;
  isSpectator: boolean;
}

function loadLastTable(): LastTable | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_TABLE_KEY);
    if (!raw) return null;
    const table = JSON.parse(raw) as LastTable;
    return table.roomId && loadSession(table.roomId) ? table : null;
  } catch {
    return null;
  }
}

function saveLastTable(table: LastTable) {
  if (typeof window === 'undefined' || table.roomId === 'LOCAL') return;
  try {
    window.sessionStorage.setItem(LAST_TABLE_KEY, JSON.stringify(table));
  } catch {
    // Ignore.
  }
}

function clearLastTable() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(LAST_TABLE_KEY);
  } catch {
    // Ignore.
  }
}

const HOST_STORAGE_KEY = 'sabacc:serverUrl';

function getServerUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_SERVER_URL) return process.env.NEXT_PUBLIC_SERVER_URL;
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem(HOST_STORAGE_KEY) || undefined;
}

const REQUIRES_HOST_ADDRESS =
  !process.env.NEXT_PUBLIC_SERVER_URL && process.env.NEXT_PUBLIC_REQUIRE_HOST === 'true';

export default function SabaccGame() {
  const [socket, setSocket] = useState<GameTransport | null>(null);
  const [isLocalSolo, setIsLocalSolo] = useState(false);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [dossier, setDossier] = useState<PilotDossier>(defaultDossier);
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isSpectator, setIsSpectator] = useState(false);
  const [isJoined, setIsJoined] = useState(false);

  const [authStatus, setAuthStatus] = useState<AuthStatusResponse>({
    locked: false,
    authenticated: true,
    passwordEnabled: false,
    oidcEnabled: false,
    oidcProviderName: 'SSO',
    adminConfigured: false,
    canBootstrapAdmin: false,
    user: null,
  });
  const [lobbySnapshot, setLobbySnapshot] = useState<LobbySnapshot | null>(null);

  const [showDrawer, setShowDrawer] = useState(false);
  const [unreadChat, setUnreadChat] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isRulesPinned, setIsRulesPinned] = useState(false);
  const [showDossier, setShowDossier] = useState(false);
  const [dossierTab, setDossierTab] = useState<DossierTab>('vault');
  const [showLegal, setShowLegal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLedger, setShowLedger] = useState(false);
  const [showQrInvite, setShowQrInvite] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const [showAllInConfirm, setShowAllInConfirm] = useState(false);
  const [showBuyIn, setShowBuyIn] = useState(false);
  const [buyInAmount, setBuyInAmount] = useState<number>(1000);

  const [betAmount, setBetAmount] = useState('10');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [pendingSwapMode, setPendingSwapMode] = useState<'swap_deck' | 'swap_discard' | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [mutedNames, setMutedNames] = useState<string[]>([]);
  const [seatMenuPlayerId, setSeatMenuPlayerId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [milestoneBanner, setMilestoneBanner] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState('');
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState('');

  const [tumbleFirst, setTumbleFirst] = useState(false);
  const [tumbleSecond, setTumbleSecond] = useState(false);
  const [shiftShock, setShiftShock] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const localSoloSpecRef = useRef<{
    mode: GameMode;
    stakesTier?: StakesTier;
    dailyDateKey?: string;
  } | null>(null);

  const todayKey = useMemo(() => getUtcDateKey(), []);

  const updateDossier = useCallback((patch: Partial<PilotDossier>) => {
    setDossier(prev => {
      const next = { ...prev, ...patch };
      saveDossier(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = dossier.colorMode ?? 'dark';
    }
  }, [dossier.colorMode]);

  const volumeRef = useRef(dossier.volume);
  const hapticsRef = useRef(dossier.haptics);
  const dossierRef = useRef(dossier);
  const showDrawerRef = useRef(showDrawer);
  useEffect(() => {
    showDrawerRef.current = showDrawer;
    if (showDrawer) Promise.resolve().then(() => setUnreadChat(false));
  }, [showDrawer]);

  useEffect(() => {
    dossierRef.current = dossier;
    hapticsRef.current = dossier.haptics;
  }, [dossier]);

  useEffect(() => {
    volumeRef.current = dossier.volume;
    setCantinaAmbience(dossier.ambientHum && isJoined, dossier.volume);
  }, [dossier.volume, dossier.ambientHum, isJoined]);

  const sound = useCallback((cue: SoundCue) => {
    playCue(cue, volumeRef.current);
  }, []);

  const handleClaimStipend = useCallback(() => {
    armAudio();
    setDossier(curr => {
      const res = claimDailyStipend(curr, todayKey);
      if (!res.claimed) return curr;
      saveDossier(res.dossier);
      playCue('bounty', volumeRef.current);
      triggerHaptic([18, 30, 35], curr.haptics);
      setMilestoneBanner(`DAILY BONUS // +${res.rewardCredits} CR · DAY ${res.streak}`);
      setTimeout(() => setMilestoneBanner(null), 3200);
      return res.dossier;
    });
  }, [todayKey]);

  const handleEraseAllData = useCallback(async () => {
    const oldKey = dossierRef.current.pilotKey;
    try {
      const base = getServerUrl() ?? '';
      await fetch(`${base}/api/pilot/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pilotKey: oldKey }),
      });
    } catch {
      // Offline / standalone mode — local data still erased cleanly.
    }
    const fresh = eraseLocalDossier();
    setDossier(fresh);
    setPlayerName('');
    setMutedNames([]);
  }, []);

  const toggleTheme = useCallback(() => {
    sound('click');
    updateDossier({ colorMode: dossier.colorMode === 'light' ? 'dark' : 'light' });
  }, [dossier.colorMode, sound, updateDossier]);

  const refreshAuthAndLobby = useCallback(async () => {
    if (REQUIRES_HOST_ADDRESS && !getServerUrl()) return;
    try {
      const base = getServerUrl() ?? '';
      const authResp = await fetch(`${base}/api/auth/status`, { credentials: 'include' });
      if (authResp.ok) {
        const st = (await authResp.json()) as AuthStatusResponse;
        setAuthStatus(st);
        if (st.user?.name) {
          setPlayerName(curr => curr || st.user!.name);
        }
        if (!st.locked || st.authenticated) {
          const lobResp = await fetch(`${base}/api/lobby`, { credentials: 'include' });
          if (lobResp.ok) {
            setLobbySnapshot((await lobResp.json()) as LobbySnapshot);
          }
        }
      }
    } catch {
      // Offline / standalone mode — handled gracefully.
    }
  }, []);

  useEffect(() => {
    const loaded = loadDossier();
    const storedHost = window.localStorage.getItem(HOST_STORAGE_KEY);
    const params = new URLSearchParams(window.location.search);
    const urlRoom = params.get('room')?.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const table = loadLastTable();

    Promise.resolve().then(() => {
      setDossier(loaded);
      if (loaded.callsign) setPlayerName(loaded.callsign);
      if (storedHost) setServerUrl(storedHost);
      if (urlRoom && urlRoom.length >= 4) {
        setRoomId(urlRoom);
        if (table && table.roomId === urlRoom) {
          setPlayerName(table.playerName);
          setIsSpectator(table.isSpectator);
          setIsJoined(true);
        }
      } else if (table) {
        setPlayerName(table.playerName);
        setRoomId(table.roomId);
        setIsSpectator(table.isSpectator);
        setIsJoined(true);
      }
      refreshAuthAndLobby();
    });
  }, [refreshAuthAndLobby]);

  useEffect(() => {
    if (isJoined) return;
    if (authStatus.locked && !authStatus.authenticated) return;
    if (REQUIRES_HOST_ADDRESS && !serverUrl.trim()) return;

    const watcher = io(getServerUrl(), { withCredentials: true });
    watcher.on('lobbyUpdate', (snap: LobbySnapshot) => {
      setLobbySnapshot(snap);
    });
    return () => {
      watcher.disconnect();
    };
  }, [isJoined, authStatus.locked, authStatus.authenticated, serverUrl]);

  useEffect(() => {
    const arm = () => armAudio();
    const opts = { once: true, passive: true } as const;
    window.addEventListener('pointerdown', arm, opts);
    window.addEventListener('keydown', arm, opts);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, []);

  useEffect(() => {
    if (!gameState?.turnExpires) return;
    const id = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(id);
  }, [gameState?.turnExpires]);

  const playerNameRef = useRef(playerName);
  const roomIdRef = useRef(roomId);
  const isSpectatorRef = useRef(isSpectator);
  const myPlayerIdRef = useRef<string | null>(null);
  const prevStateRef = useRef<ClientGameState | null>(null);
  const socketRef = useRef<GameTransport | null>(null);

  useEffect(() => {
    playerNameRef.current = playerName;
    roomIdRef.current = roomId;
    isSpectatorRef.current = isSpectator;
  }, [playerName, roomId, isSpectator]);

  useEffect(() => {
    myPlayerIdRef.current = myPlayerId;
  }, [myPlayerId]);

  useEffect(() => {
    if (!isJoined) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        Promise.resolve().then(() => setSocket(null));
      }
      return;
    }
    if (socketRef.current) return;

    const transport: GameTransport = localSoloSpecRef.current
      ? new LocalGameTransport(localSoloSpecRef.current)
      : io(getServerUrl(), { withCredentials: true });

    socketRef.current = transport;
    const localMode = !!localSoloSpecRef.current;
    Promise.resolve().then(() => setIsLocalSolo(localMode));

    transport.on('connect', () => {
      setSocket(transport);
      transport.emit('joinRoom', {
        roomId: roomIdRef.current,
        playerName: playerNameRef.current,
        isSpectator: isSpectatorRef.current,
        token: loadSession(roomIdRef.current)?.token,
        pilotKey: dossierRef.current.pilotKey,
        vaultCredits: dossierRef.current.vaultCredits,
      });
    });

    transport.on('session', (session: StoredSession) => {
      saveSession(session);
      myPlayerIdRef.current = session.playerId;
      saveLastTable({
        roomId: session.roomId,
        playerName: playerNameRef.current,
        isSpectator: isSpectatorRef.current,
      });
      setMyPlayerId(session.playerId);
    });

    transport.on('lobbyUpdate', (snap: LobbySnapshot) => {
      setLobbySnapshot(snap);
    });

    transport.on('gameStateUpdate', (state: ClientGameState) => {
      const prev = prevStateRef.current;
      prevStateRef.current = state;
      setGameState(state);

      const myId = myPlayerIdRef.current;

      if (state.currentPhase === 'SHOWDOWN' && state.showdownResult) {
        const meNow = state.players.find(p => p.id === myId);
        setDossier(curr => {
          const prevCodexCount = Object.keys(curr.codex).length;
          const settlement = settleShowdownToDossier(curr, state, myId, todayKey, () =>
            state.daily && meNow ? formatKesselShareCard(state.daily, meNow.credits) : ''
          );
          if (settlement.changed) {
            const updated = settlement.dossier;
            saveDossier(updated);
            if (settlement.rankedUpTo) {
              setTimeout(() => playCue('rank_up', volumeRef.current), 380);
              setMilestoneBanner(`RANK UP // ${settlement.rankedUpTo.toUpperCase()}`);
              setTimeout(() => setMilestoneBanner(null), 3600);
            } else if (settlement.sweepCleared) {
              setTimeout(() => playCue('sabacc_pot', volumeRef.current), 360);
              setMilestoneBanner('DAILY SWEEP // +400 CR BONUS');
              setTimeout(() => setMilestoneBanner(null), 3600);
            } else if (settlement.bountiesCleared.length > 0) {
              setTimeout(() => playCue('bounty', volumeRef.current), 360);
              setMilestoneBanner(`BOUNTY COMPLETE // ${settlement.bountiesCleared[0].toUpperCase()}`);
              setTimeout(() => setMilestoneBanner(null), 3400);
            } else if (Object.keys(updated.codex).length > prevCodexCount) {
              const myStanding = state.showdownResult?.standings.find(s => s.playerId === myId);
              const meta = HAND_CODEX_META.find(m => m.key === myStanding?.evaluation.rankKey);
              if (meta) {
                setMilestoneBanner(`NEW HAND DISCOVERED // ${meta.name.toUpperCase()}`);
                setTimeout(() => setMilestoneBanner(null), 3200);
              }
            } else if (settlement.bailoutGranted) {
              setMilestoneBanner('CANTINA BAILOUT // RESTORED TO 300 CR');
              setTimeout(() => setMilestoneBanner(null), 3200);
            } else if (updated.currentStreak >= 3 && updated.currentStreak > curr.currentStreak) {
              setMilestoneBanner(`WIN STREAK // ${updated.currentStreak}× IN A ROW`);
              setTimeout(() => setMilestoneBanner(null), 2800);
            }
            return updated;
          }
          return curr;
        });
      }

      if (!prev) return;

      if (
        state.messages.length > prev.messages.length &&
        !showDrawerRef.current &&
        dossierRef.current.chatEnabled
      ) {
        setUnreadChat(true);
      }

      if (
        state.gamesPlayed !== prev.gamesPlayed ||
        (prev.currentPhase === 'JOINING' && state.currentPhase === 'CARD')
      ) {
        sound('deal');
        setSelectedCardId(null);
        setPendingSwapMode(null);
        setBetAmount(String(state.settings.ante));
      }

      if (state.currentPhase !== prev.currentPhase) {
        setPendingSwapMode(null);
        setSelectedCardId(null);
        if (state.currentPhase === 'DICE') {
          sound('dice');
          setTumbleFirst(true);
          setTumbleSecond(true);
          setTimeout(() => setTumbleFirst(false), 850);
          setTimeout(() => {
            setTumbleSecond(false);
            if (state.lastDiceRoll && state.lastDiceRoll[0] !== state.lastDiceRoll[1]) {
              sound('no_shift');
            }
          }, 1200);
        }

        if (state.currentPhase === 'SHOWDOWN') {
          const iWon = !!myId && state.winnerIds.includes(myId);
          const wonSabaccPot = state.showdownResult?.payouts.some(
            p => p.label === 'Sabacc Pot' && !!myId && p.winnerIds.includes(myId)
          );
          const iPlayed = state.players.some(p => p.id === myId && !p.isSpectator);
          sound('flip');
          if (iWon) triggerHaptic(wonSabaccPot ? [30, 30, 60] : 25, hapticsRef.current);
          setTimeout(() => {
            sound(wonSabaccPot ? 'sabacc_pot' : iWon ? 'win' : iPlayed ? 'lose' : 'no_shift');
          }, 150);
        }
      }

      if (state.shiftTriggered && !prev.shiftTriggered) {
        sound('sabacc_shift');
        triggerHaptic([40, 25, 65], hapticsRef.current);
        setShiftShock(true);
        setTimeout(() => setShiftShock(false), 600);
      }

      const wasMyTurn = prev.players[prev.turnIndex]?.id === myId;
      const isMyTurn = state.players[state.turnIndex]?.id === myId;
      const actionable = state.currentPhase === 'CARD' || state.currentPhase === 'BETTING';
      if (isMyTurn && !wasMyTurn && actionable && myId) {
        sound('turn');
        setBetAmount(String(Math.max(state.minRaise, state.settings.ante)));
      }

      if (state.players.length > prev.players.length) sound('join');

      if (state.logs.length > prev.logs.length) {
        const lastLog = state.logs[state.logs.length - 1];
        if (lastLog.includes('drew') || lastLog.includes('swapped') || lastLog.includes('took')) sound('card');
        else if (
          lastLog.includes('bet') ||
          lastLog.includes('raised') ||
          lastLog.includes('called') ||
          lastLog.includes('committed')
        )
          sound('chips');
        else if (lastLog.includes('checked')) sound('check');
        else if (lastLog.includes('folded')) sound('fold');
      }
    });

    transport.on('error', (msg: string) => {
      sound('error');
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    });

    transport.on('joinRejected', ({ reason }: { reason: string }) => {
      clearLastTable();
      localSoloSpecRef.current = null;
      setErrorMessage(reason);
      setTimeout(() => setErrorMessage(null), 5500);
      setGameState(null);
      setMyPlayerId(null);
      setIsJoined(false);
    });

    transport.on('connect_error', (err: Error) => {
      if (err?.message === 'AUTH_REQUIRED') {
        clearLastTable();
        setIsJoined(false);
        refreshAuthAndLobby();
        return;
      }
      setErrorMessage('Reconnecting...');
      setTimeout(() => setErrorMessage(null), 4000);
    });

    return () => {
      transport.disconnect();
      socketRef.current = null;
    };
  }, [isJoined, sound, refreshAuthAndLobby, todayKey]);

  const leaveRoom = useCallback(() => {
    clearLastTable();
    localSoloSpecRef.current = null;
    setCantinaAmbience(false);
    if (typeof window !== 'undefined' && window.location.search.includes('room=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setShowDrawer(false);
    setSeatMenuPlayerId(null);
    setMyPlayerId(null);
    prevStateRef.current = null;
    socket?.disconnect();
    setGameState(null);
    setSocket(null);
    setIsJoined(false);
    refreshAuthAndLobby();
  }, [socket, refreshAuthAndLobby]);

  const startLocalOfflineSolo = useCallback(
    (mode: GameMode, stakesTier?: StakesTier) => {
      localSoloSpecRef.current = { mode, stakesTier, dailyDateKey: todayKey };
      setRoomId('LOCAL');
      roomIdRef.current = 'LOCAL';
      setIsJoined(true);
    },
    [todayKey]
  );

  const createAndEnterRoom = useCallback(
    (mode: GameMode, stakesTier?: StakesTier, isPublic = true) => {
      const cleanName = playerName.trim();
      if (!cleanName) return;
      armAudio();
      sound('chips');
      updateDossier({ callsign: cleanName });

      if (mode !== 'party') setIsSpectator(false);

      if (mode !== 'party' && ((REQUIRES_HOST_ADDRESS && !serverUrl.trim()) || !navigator.onLine)) {
        startLocalOfflineSolo(mode, stakesTier);
        return;
      }

      localSoloSpecRef.current = null;
      const lobby = io(getServerUrl(), { withCredentials: true, timeout: 2500 });
      lobby.on('roomCreated', ({ roomId: code }: { roomId: string }) => {
        lobby.close();
        setRoomId(code);
        roomIdRef.current = code;
        setIsJoined(true);
      });
      lobby.on('joinRejected', ({ reason }: { reason: string }) => {
        lobby.close();
        setErrorMessage(reason);
        setTimeout(() => setErrorMessage(null), 5000);
      });
      lobby.on('connect_error', (err: Error) => {
        lobby.close();
        if (err?.message === 'AUTH_REQUIRED') {
          refreshAuthAndLobby();
          return;
        }
        if (mode !== 'party') {
          startLocalOfflineSolo(mode, stakesTier);
          return;
        }
        setErrorMessage('Could not reach the multiplayer server.');
        setTimeout(() => setErrorMessage(null), 5000);
      });
      lobby.emit('createRoom', { mode, stakesTier, dailyDateKey: todayKey, isPublic });
    },
    [playerName, serverUrl, sound, todayKey, updateDossier, startLocalOfflineSolo, refreshAuthAndLobby]
  );

  const startFreshFromInside = useCallback(
    (mode: GameMode) => {
      leaveRoom();
      setTimeout(() => createAndEnterRoom(mode), 60);
    },
    [leaveRoom, createAndEnterRoom]
  );

  const handleJoinExisting = (explicitCode?: string) => {
    const cleanName = playerName.trim();
    const code = (explicitCode ?? roomId).trim().toUpperCase();
    if (!cleanName || code.length < 4) return;
    armAudio();
    sound('chips');
    localSoloSpecRef.current = null;
    if (explicitCode) {
      setRoomId(code);
      roomIdRef.current = code;
    }
    updateDossier({ callsign: cleanName });
    setIsJoined(true);
  };

  // Desktop keyboard shortcuts (invisible on mobile so touch UI stays ultra-clean)
  useEffect(() => {
    if (!isJoined || !gameState || !socket) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (
        showDrawer ||
        showTutorial ||
        showDossier ||
        showLegal ||
        showAdmin ||
        showLedger ||
        showQrInvite ||
        showBuyIn ||
        showAllInConfirm
      ) {
        return;
      }

      const me = gameState.players.find(p => p.id === myPlayerId);
      const isMyTurn = gameState.players[gameState.turnIndex]?.id === myPlayerId;
      const topDiscard = gameState.discardPile[gameState.discardPile.length - 1];

      if (gameState.currentPhase === 'SHOWDOWN' && (e.code === 'Space' || e.key === 'Enter')) {
        e.preventDefault();
        if (gameState.tour?.stageCleared && !gameState.tour.tourCompleted) {
          sound('sabacc_pot');
          socket.emit('advanceTourStage', {});
        } else if (!gameState.tour?.runFailed && !gameState.daily?.finished && !me?.isReady) {
          sound('click');
          socket.emit('ready', {});
        }
        return;
      }

      if (!isMyTurn || !me) return;

      if (gameState.currentPhase === 'CARD') {
        const num = Number(e.key);
        if (num >= 1 && num <= me.hand.length) {
          const target = me.hand[num - 1];
          if (pendingSwapMode) {
            sound('card');
            socket.emit('cardAction', { action: pendingSwapMode, cardId: target.id });
            setPendingSwapMode(null);
            setSelectedCardId(null);
          } else {
            sound('click');
            setSelectedCardId(curr => (curr === target.id ? null : target.id));
          }
          return;
        }
        if (e.key === 'Escape') {
          setSelectedCardId(null);
          setPendingSwapMode(null);
          return;
        }
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault();
          sound('card');
          socket.emit('cardAction', { action: 'draw' });
          setSelectedCardId(null);
          setPendingSwapMode(null);
          return;
        }
        if (e.key.toLowerCase() === 'w') {
          e.preventDefault();
          if (selectedCardId) {
            sound('card');
            socket.emit('cardAction', { action: 'swap_deck', cardId: selectedCardId });
            setSelectedCardId(null);
            setPendingSwapMode(null);
          } else {
            sound('click');
            setPendingSwapMode(curr => (curr === 'swap_deck' ? null : 'swap_deck'));
          }
          return;
        }
        if (e.key.toLowerCase() === 't' && topDiscard) {
          e.preventDefault();
          if (selectedCardId) {
            sound('card');
            socket.emit('cardAction', { action: 'swap_discard', cardId: selectedCardId });
            setSelectedCardId(null);
            setPendingSwapMode(null);
          } else {
            sound('click');
            setPendingSwapMode(curr => (curr === 'swap_discard' ? null : 'swap_discard'));
          }
          return;
        }
        if (e.key.toLowerCase() === 's' || e.code === 'Space') {
          e.preventDefault();
          sound('click');
          socket.emit('cardAction', { action: 'stand' });
          setSelectedCardId(null);
          setPendingSwapMode(null);
        }
      } else if (gameState.currentPhase === 'BETTING') {
        if (e.code === 'Space' || e.key.toLowerCase() === 'c') {
          e.preventDefault();
          if (gameState.currentBet > me.betThisRound) {
            sound('chips');
            socket.emit('betAction', { action: 'call' });
          } else {
            sound('check');
            socket.emit('betAction', { action: 'check' });
          }
          return;
        }
        if (e.key.toLowerCase() === 'r') {
          e.preventDefault();
          sound('chips');
          socket.emit('betAction', {
            action: gameState.currentBet === 0 ? 'bet' : 'raise',
            amount: betAmount,
          });
          return;
        }
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          sound('fold');
          socket.emit('betAction', { action: 'fold' });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isJoined,
    gameState,
    socket,
    myPlayerId,
    selectedCardId,
    pendingSwapMode,
    betAmount,
    sound,
    showDrawer,
    showTutorial,
    showDossier,
    showLegal,
    showAdmin,
    showLedger,
    showQrInvite,
    showBuyIn,
    showAllInConfirm,
  ]);

  const isLight = dossier.colorMode === 'light';

  if (authStatus.locked && !authStatus.authenticated) {
    return (
      <AuthGate
        passwordEnabled={authStatus.passwordEnabled}
        oidcEnabled={authStatus.oidcEnabled}
        oidcProviderName={authStatus.oidcProviderName}
        colorMode={dossier.colorMode}
        onToggleTheme={toggleTheme}
        onAuthenticated={callsign => {
          if (callsign) {
            setPlayerName(callsign);
            updateDossier({ callsign });
          }
          refreshAuthAndLobby();
        }}
      />
    );
  }

  if (!isJoined) {
    return (
      <>
        <LandingHub
          playerName={playerName}
          onPlayerNameChange={setPlayerName}
          roomId={roomId}
          onRoomIdChange={setRoomId}
          isSpectator={isSpectator}
          onToggleSpectator={() => {
            sound('click');
            setIsSpectator(v => !v);
          }}
          needsServerUrl={REQUIRES_HOST_ADDRESS}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
          onServerUrlBlur={() => {
            const trimmed = serverUrl.trim();
            if (trimmed) window.localStorage.setItem(HOST_STORAGE_KEY, trimmed);
            refreshAuthAndLobby();
          }}
          errorMessage={errorMessage}
          dossier={dossier}
          todayKey={todayKey}
          lobby={lobbySnapshot}
          authInfo={{
            oidcEnabled: authStatus.oidcEnabled,
            oidcProviderName: authStatus.oidcProviderName,
            user: authStatus.user,
          }}
          onToggleTheme={toggleTheme}
          onClaimStipend={handleClaimStipend}
          onOpenDossier={tab => {
            sound('click');
            if (tab) setDossierTab(tab);
            setShowDossier(true);
          }}
          onOpenTutorial={() => {
            sound('click');
            setShowTutorial(true);
          }}
          onOpenRules={() => {
            sound('click');
            setIsRulesPinned(false);
            setShowRules(true);
          }}
          onOpenLegal={() => {
            sound('click');
            setShowLegal(true);
          }}
          onOpenAdmin={() => {
            sound('click');
            setShowAdmin(true);
          }}
          onLogout={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            refreshAuthAndLobby();
          }}
          onJoinRoom={handleJoinExisting}
          onCreateRoom={createAndEnterRoom}
        />
        <TutorialModal
          open={showTutorial}
          lightMode={isLight}
          onClose={() => setShowTutorial(false)}
          onComplete={() => {
            updateDossier({ tutorialCompleted: true });
            setShowTutorial(false);
          }}
          onOpenFullRules={() => setShowRules(true)}
          onPlaySound={cue => sound(cue)}
        />
        <RulesDrawer
          open={showRules}
          pinned={false}
          onClose={() => setShowRules(false)}
          onTogglePin={() => {}}
          onOpenTutorial={() => setShowTutorial(true)}
        />
        <DossierModal
          open={showDossier}
          initialTab={dossierTab}
          dossier={dossier}
          todayKey={todayKey}
          lobby={lobbySnapshot}
          onClaimStipend={handleClaimStipend}
          onOpenLegal={() => setShowLegal(true)}
          onClose={() => setShowDossier(false)}
          onUpdateDossier={updateDossier}
        />
        <LegalModal
          open={showLegal}
          onClose={() => setShowLegal(false)}
          onEraseAllData={handleEraseAllData}
        />
        <AdminModal
          open={showAdmin}
          isAdmin={!!authStatus.user?.isAdmin}
          canBootstrapAdmin={authStatus.canBootstrapAdmin}
          onClose={() => setShowAdmin(false)}
          onAdminUnlocked={refreshAuthAndLobby}
        />
      </>
    );
  }

  if (!gameState) {
    return (
      <div className="holotable-stage flex min-h-[100dvh] flex-col items-center justify-center gap-3 font-mono text-cyan-300">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        <span className="text-[11px] uppercase tracking-[0.3em]">DEALING TABLE...</span>
      </div>
    );
  }

  const me = gameState.players.find(p => p.id === myPlayerId);
  const isHost = !!myPlayerId && gameState.hostId === myPlayerId;
  const isMyTurn = gameState.players[gameState.turnIndex]?.id === myPlayerId;
  const isHandInPlay = gameState.currentPhase === 'CARD' || gameState.currentPhase === 'BETTING';
  const reqAnte = gameState.settings.ante + gameState.settings.sabaccAnte;

  const activeFeltId =
    gameState.mode === 'cantina_tour' && gameState.tour
      ? CANTINA_STAGES[gameState.tour.stageIndex]?.feltThemeId ?? dossier.selectedFelt
      : dossier.selectedFelt;
  const feltSpec = FELT_THEMES.find(f => f.id === activeFeltId) ?? FELT_THEMES[0];

  const mySpendable = me ? spendableFor(me, gameState.settings) : 0;
  const callDue = me ? Math.max(0, gameState.currentBet - me.betThisRound) : 0;
  const maxRaiseAdd = Math.max(0, mySpendable - callDue);
  const minRaiseAdd = Math.min(maxRaiseAdd, gameState.minRaise);
  const cappedByLimit = !!me && mySpendable < me.credits;

  const topDiscard =
    gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1] : null;
  const myEval = me && me.hand.length > 0 ? evaluateHand(me.hand) : null;
  const previewTargetCardId =
    selectedCardId ?? (pendingSwapMode === 'swap_discard' ? hoveredCardId : null);
  const swapDiscardPreview =
    me && previewTargetCardId && topDiscard
      ? previewSwap(me.hand, previewTargetCardId, topDiscard)
      : null;

  const opponents = gameState.players.filter(p => p.id !== myPlayerId);
  const turnRemainingSec =
    gameState.turnExpires && isHandInPlay
      ? Math.max(0, Math.ceil((gameState.turnExpires - nowTick) / 1000))
      : null;

  const topDiscardLabel = topDiscard
    ? topDiscard.value > 0
      ? `+${topDiscard.value}`
      : String(topDiscard.value)
    : '';

  return (
    <div
      className={`holotable-stage flex h-[100dvh] flex-col overflow-hidden font-sans text-slate-100 ${
        shiftShock ? 'shift-shockwave' : ''
      }`}
    >
      <CommandDrawer
        open={showDrawer}
        gameState={gameState}
        dossier={dossier}
        mutedNames={mutedNames}
        isSpectator={!!me?.isSpectator}
        isLocalSolo={isLocalSolo}
        chatMessage={chatMessage}
        onChatChange={setChatMessage}
        onSendChat={e => {
          e.preventDefault();
          if (!chatMessage.trim()) return;
          socket?.emit('chatMessage', { text: chatMessage });
          setChatMessage('');
        }}
        onClose={() => setShowDrawer(false)}
        onUpdateDossier={updateDossier}
        onOpenQr={() => setShowQrInvite(true)}
        onOpenLedger={() => setShowLedger(true)}
        onOpenDossier={() => {
          setDossierTab('vault');
          setShowDossier(true);
        }}
        onOpenTutorial={() => setShowTutorial(true)}
        onOpenRules={() => setShowRules(true)}
        onOpenLegal={() => setShowLegal(true)}
        onOpenAdmin={() => setShowAdmin(true)}
        onToggleSpectator={() => socket?.emit('toggleSpectator', {})}
        onLeaveRoom={leaveRoom}
      />
      <TutorialModal
        open={showTutorial}
        lightMode={isLight}
        onClose={() => setShowTutorial(false)}
        onComplete={() => {
          updateDossier({ tutorialCompleted: true });
          setShowTutorial(false);
        }}
        onOpenFullRules={() => setShowRules(true)}
        onPlaySound={cue => sound(cue)}
      />
      <RulesDrawer
        open={showRules}
        pinned={isRulesPinned}
        onClose={() => setShowRules(false)}
        onTogglePin={() => setIsRulesPinned(v => !v)}
        onOpenTutorial={() => setShowTutorial(true)}
      />
      <DossierModal
        open={showDossier}
        initialTab={dossierTab}
        dossier={dossier}
        todayKey={todayKey}
        lobby={lobbySnapshot}
        onClaimStipend={handleClaimStipend}
        onOpenLegal={() => setShowLegal(true)}
        onClose={() => setShowDossier(false)}
        onUpdateDossier={updateDossier}
      />
      <LegalModal
        open={showLegal}
        onClose={() => setShowLegal(false)}
        onEraseAllData={handleEraseAllData}
      />
      <AdminModal
        open={showAdmin}
        isAdmin={!!authStatus.user?.isAdmin}
        canBootstrapAdmin={authStatus.canBootstrapAdmin}
        onClose={() => setShowAdmin(false)}
        onAdminUnlocked={refreshAuthAndLobby}
      />
      <QrInviteModal
        open={showQrInvite}
        roomId={gameState.roomId}
        onClose={() => setShowQrInvite(false)}
      />
      <LedgerModal
        open={showLedger}
        gameState={gameState}
        isHost={isHost}
        onClose={() => setShowLedger(false)}
        onUpdateSettings={(patch: {
          stakesTier?: StakesTier;
          tieRule?: TieRule;
          turnSeconds?: number;
          lockedCredits?: boolean;
          isPublic?: boolean;
        }) => socket?.emit('updateTableSettings', patch)}
        onSkipTurn={() => socket?.emit('skipTurn', {})}
        onResetTable={() => socket?.emit('resetTable', {})}
      />

      {/* All-In / Cap Confirm */}
      <AnimatePresence>
        {showAllInConfirm && me && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              className="sw-cut w-full max-w-xs border border-rose-500/45 bg-[#080d14] p-6 text-center shadow-2xl"
            >
              <div className="font-mono text-xs uppercase tracking-[0.22em] text-rose-400">
                {cappedByLimit ? 'MAX TABLE BET' : 'ALL IN'}
              </div>
              <div className="mt-2 font-mono text-3xl font-bold text-amber-300">{mySpendable} CR</div>
              {cappedByLimit && (
                <p className="mt-1.5 text-xs text-slate-400">
                  {me.credits - mySpendable} CR stays safe in your stack.
                </p>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setShowAllInConfirm(false)}
                  className="sw-cut-sm min-h-[44px] flex-1 border border-white/15 font-mono text-xs uppercase text-white/70 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    sound('chips');
                    socket?.emit('betAction', { action: 'all_in' });
                    setShowAllInConfirm(false);
                  }}
                  className="sw-cut-sm min-h-[44px] flex-1 bg-rose-500 font-mono text-xs font-bold uppercase text-white hover:bg-rose-400"
                >
                  Confirm
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
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              className="sw-cut w-full max-w-xs border border-amber-400/45 bg-[#080d14] p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.22em] text-amber-400">
                  Add Chips
                </span>
                <button
                  onClick={() => setShowBuyIn(false)}
                  aria-label="Close Add Chips"
                  className="flex h-10 w-10 items-center justify-center text-white/45 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="number"
                value={buyInAmount}
                onChange={e => setBuyInAmount(Math.max(50, Number(e.target.value) || 0))}
                step={100}
                min={50}
                className="sw-cut-sm mt-3 min-h-[46px] w-full border border-amber-400/30 bg-black/60 text-center font-mono text-xl text-amber-300 focus:border-amber-400 focus:outline-none"
              />
              <button
                onClick={() => {
                  sound('chips');
                  socket?.emit('addCredits', { amount: buyInAmount });
                  setShowBuyIn(false);
                }}
                className="sw-cut-sm mt-4 min-h-[46px] w-full bg-amber-400 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950 hover:bg-amber-300"
              >
                Add +{buyInAmount} CR
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="sw-cut-sm fixed left-1/2 top-16 z-[90] flex -translate-x-1/2 items-center gap-2 border border-rose-500/60 bg-[#180509]/95 px-4 py-2 font-mono text-xs uppercase tracking-wider text-rose-200 shadow-2xl"
          >
            <AlertCircle className="h-4 w-4 text-rose-400" />
            {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {milestoneBanner && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="sw-cut-sm fixed left-1/2 top-16 z-[88] flex -translate-x-1/2 items-center gap-2 border border-amber-400/70 bg-[#140f05]/95 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.2em] text-amber-300 shadow-[0_0_30px_rgba(251,191,36,0.35)]"
          >
            <Sparkles className="h-4 w-4 text-amber-400" />
            {milestoneBanner}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clean Minimal Top Bar (All buttons >= 44x44px) */}
      <header className="safe-top z-30 flex min-h-13 shrink-0 items-center justify-between border-b border-white/10 bg-[#060a10]/85 px-2 sm:px-5 backdrop-blur-md">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={leaveRoom}
            aria-label="Leave Table"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-300 hover:text-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {gameState.mode === 'party' ? (
            <button
              onClick={() => {
                sound('click');
                setShowQrInvite(true);
              }}
              className="sw-cut-sm flex min-h-[38px] items-center gap-1.5 border border-cyan-400/30 bg-cyan-500/10 px-3 font-mono text-xs tracking-widest text-cyan-200 hover:bg-cyan-500/20"
            >
              <QrCode className="h-3.5 w-3.5 text-cyan-300" />
              <span>{gameState.roomId}</span>
            </button>
          ) : (
            <div className="truncate font-mono text-xs uppercase tracking-wider text-slate-300">
              {gameState.tour ? (
                <span>
                  {gameState.tour.venueName}{' '}
                  <span className="text-amber-300">
                    • {me?.credits ?? 0}/{gameState.tour.targetCredits}
                  </span>
                </span>
              ) : gameState.daily ? (
                <span>
                  Daily {gameState.daily.handsCompleted}/{gameState.daily.maxHands}
                </span>
              ) : (
                <span>Cantina Table</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              sound('click');
              if (
                !gameState.settings.lockedCredits &&
                (gameState.currentPhase === 'JOINING' || gameState.currentPhase === 'SHOWDOWN')
              ) {
                setShowBuyIn(true);
              } else {
                setShowLedger(true);
              }
            }}
            className="sw-cut-sm flex min-h-[40px] items-center gap-1.5 border border-amber-400/40 bg-amber-500/10 px-3 font-mono text-xs sm:text-sm text-amber-300 hover:bg-amber-500/20"
          >
            <Coins className="h-4 w-4 text-amber-400" />
            <AnimatedCredits value={me?.credits ?? 0} showDelta className="font-bold" />
            {dossier.currentStreak >= 2 && (
              <span className="ml-0.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-orange-300">
                <Flame className="h-3.5 w-3.5 text-orange-400" />
                {dossier.currentStreak}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              sound('click');
              if (!dossier.tutorialCompleted) setShowTutorial(true);
              else setShowRules(v => !v);
            }}
            aria-label="How to Play"
            className="sw-cut-sm flex h-11 w-11 items-center justify-center border border-white/12 bg-white/[0.04] text-slate-300 hover:border-amber-400/50 hover:text-amber-300 active:scale-95"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <button
            onClick={() => {
              sound('click');
              setShowDrawer(true);
            }}
            aria-label="Open Table Menu"
            className="sw-cut-sm relative flex h-11 w-11 items-center justify-center border border-white/12 bg-white/[0.04] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
          >
            <Menu className="h-4 w-4" />
            {unreadChat && (
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-amber-400" />
            )}
          </button>
        </div>
      </header>

      {/* FULL-BLEED RECESSED CANTINA HOLOTABLE — Fills the entire playfield with zero dead space */}
      <main className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-4">
        <div
          onClick={() => setSeatMenuPlayerId(null)}
          style={{
            background:
              isLight && activeFeltId === 'cantina-brass'
                ? 'radial-gradient(ellipse at 50% 46%, #1e293b 0%, #0f172a 66%, #070b13 100%)'
                : feltSpec.feltStyle,
          }}
          className={`holotable-felt relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-between overflow-hidden rounded-[34px] sm:rounded-[52px] border-[3px] px-3 py-3 sm:px-8 sm:py-5 ${
            isLight && activeFeltId === 'cantina-brass'
              ? 'border-slate-700/85 shadow-[0_24px_60px_rgba(15,23,42,0.35),inset_0_0_75px_rgba(0,0,0,0.8)]'
              : feltSpec.railClass
          }`}
        >
          {/* Diegetic Recessed Holotable Inlays & Inner Bumper Ring */}
          <div className="pointer-events-none absolute inset-2 sm:inset-3 rounded-[26px] sm:rounded-[42px] border border-amber-400/[0.14]" />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full text-amber-400/[0.11]"
            viewBox="0 0 600 600"
            preserveAspectRatio="xMidYMid slice"
            aria-hidden
          >
            <circle cx="300" cy="300" r="225" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 9" />
            <circle cx="300" cy="300" r="155" fill="none" stroke="currentColor" strokeWidth="0.9" />
            <polygon points="300,95 505,300 300,505 95,300" fill="none" stroke="currentColor" strokeWidth="0.9" />
          </svg>

          {/* 1. UPPER FELT RIM: Opponents Seated Directly on the Holotable */}
          <div className="relative z-20 flex flex-wrap items-start justify-center gap-2 sm:gap-3.5 pt-0.5">
            {opponents.map((p: Player) => {
              const isTurnSeat = isHandInPlay && gameState.players[gameState.turnIndex]?.id === p.id;
              const isDealer = gameState.players[gameState.dealerIndex]?.id === p.id;
              const isShowdownWinner =
                gameState.currentPhase === 'SHOWDOWN' && gameState.winnerIds.includes(p.id);
              const revealedEval =
                gameState.currentPhase === 'SHOWDOWN' &&
                !p.isFolded &&
                p.hand.length > 0 &&
                !p.hand[0]?.hidden
                  ? evaluateHand(p.hand)
                  : null;
              const isMuted = mutedNames.includes(p.name);
              const canModerate = gameState.mode === 'party' && !p.isAI;

              return (
                <div
                  key={p.id}
                  onClick={e => {
                    if (!canModerate) return;
                    e.stopPropagation();
                    setSeatMenuPlayerId(curr => (curr === p.id ? null : p.id));
                  }}
                  className={`sw-cut-sm relative flex min-w-[98px] sm:min-w-[146px] max-w-[172px] flex-col items-center border px-2.5 py-2 sm:px-3.5 sm:py-2.5 backdrop-blur-md transition-all ${
                    canModerate ? 'cursor-pointer' : ''
                  } ${
                    p.isFolded
                      ? 'border-white/10 bg-black/40 opacity-45'
                      : isShowdownWinner
                        ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_28px_rgba(251,191,36,0.38)]'
                        : isTurnSeat
                          ? 'border-cyan-400 bg-[#071522]/90 shadow-[0_0_24px_rgba(34,211,238,0.32)]'
                          : 'border-white/15 bg-black/55'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400/35 bg-amber-500/15 font-mono text-[10px] font-bold uppercase text-amber-300">
                        {p.name.slice(0, 1)}
                      </span>
                      <span className="truncate text-xs sm:text-sm font-semibold text-white">
                        {p.name}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-amber-300/90">
                      {p.credits}
                    </span>
                  </div>

                  {isDealer && (
                    <span
                      className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-sm bg-amber-400 font-mono text-[9px] font-bold text-zinc-950 shadow"
                      title="Dealer"
                    >
                      D
                    </span>
                  )}

                  {p.hand.length > 0 && (
                    <div
                      className={`mt-1.5 flex items-center justify-center ${
                        revealedEval ? 'gap-1' : '-space-x-3 sm:-space-x-2.5'
                      }`}
                    >
                      {p.hand.map(card => (
                        <motion.div
                          key={card.id}
                          initial={{ scale: 0.75, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={
                            revealedEval
                              ? 'h-14 w-10 text-[24px] sm:h-17 sm:w-12 sm:text-[30px]'
                              : 'h-12.5 w-9 text-[20px] sm:h-15 sm:w-10.5 sm:text-[26px]'
                          }
                        >
                          <SabaccCard
                            card={card}
                            faceDown={!!card.hidden}
                            detail="numeral"
                            cardBack={dossier.selectedCardBack}
                            lightMode={isLight}
                            className="h-full w-full"
                          />
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {revealedEval ? (
                    <span className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      {revealedEval.sum === 0
                        ? `★ ${revealedEval.rankName}`
                        : `Total ${revealedEval.sum > 0 ? `+${revealedEval.sum}` : revealedEval.sum}`}
                    </span>
                  ) : p.lastAction && !(isMuted && p.lastAction.tone === 'emote') ? (
                    <span
                      className={`mt-1 max-w-full truncate font-mono text-[10px] ${
                        p.lastAction.tone === 'quips' || p.lastAction.tone === 'emote'
                          ? 'italic text-amber-200/90'
                          : p.lastAction.tone === 'raise' || p.lastAction.tone === 'all_in'
                            ? 'font-bold text-amber-300'
                            : p.lastAction.tone === 'fold'
                              ? 'text-rose-300/80'
                              : 'text-cyan-200/90'
                      }`}
                      title={p.lastAction.text}
                    >
                      {p.lastAction.text}
                    </span>
                  ) : null}

                  {/* Multiplayer UGC Safety Popover (Mute / Report) */}
                  {seatMenuPlayerId === p.id && canModerate && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="sw-cut-sm absolute top-full mt-1.5 z-40 flex gap-1 border border-cyan-400/40 bg-[#070b12] p-1.5 shadow-2xl"
                    >
                      <button
                        onClick={() => {
                          setMutedNames(curr =>
                            curr.includes(p.name) ? curr.filter(n => n !== p.name) : [...curr, p.name]
                          );
                          setSeatMenuPlayerId(null);
                        }}
                        className="flex min-h-[36px] items-center gap-1 rounded px-2.5 font-mono text-[10px] uppercase text-slate-200 hover:bg-white/10"
                      >
                        <VolumeX className="h-3.5 w-3.5" /> {isMuted ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        onClick={() => {
                          socket?.emit('reportPlayer', { targetName: p.name, reason: 'Reported at table' });
                          setMutedNames(curr => (curr.includes(p.name) ? curr : [...curr, p.name]));
                          setSeatMenuPlayerId(null);
                          setMilestoneBanner(`REPORTED & MUTED // ${p.name.toUpperCase()}`);
                          setTimeout(() => setMilestoneBanner(null), 2600);
                        }}
                        className="flex min-h-[36px] items-center gap-1 rounded px-2.5 font-mono text-[10px] uppercase text-rose-300 hover:bg-rose-500/20"
                      >
                        <Flag className="h-3.5 w-3.5" /> Report
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 2. CENTER FELT WELL: Shoe + Docked Spike Dice & Pots + Face-Up Discard */}
          <div className="relative z-10 flex flex-col items-center justify-center gap-2.5 py-1">
            {gameState.currentPhase === 'SHOWDOWN' ? (
              <ShowdownOverlay
                gameState={gameState}
                myPlayerId={myPlayerId}
                currentStreak={dossier.currentStreak}
                discordShareEnabled={!isLocalSolo && !!lobbySnapshot?.discordShareEnabled}
                onNextHand={() => {
                  sound('click');
                  socket?.emit('ready', {});
                }}
                onAdvanceTour={() => {
                  sound('sabacc_pot');
                  socket?.emit('advanceTourStage', {});
                }}
                onRequestCredits={() => {
                  sound('click');
                  setShowBuyIn(true);
                }}
                onLeaveRoom={leaveRoom}
                onStartFreshMode={startFreshFromInside}
              />
            ) : (
              <>
                <SpikeDiceCradle
                  roll={gameState.lastDiceRoll}
                  round={gameState.currentRound}
                  activeHand={gameState.currentPhase !== 'JOINING'}
                  diceStyle={dossier.selectedDice}
                />

                <div className="flex w-full items-center justify-around sm:justify-center sm:gap-10">
                  {/* Draw Shoe */}
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="relative">
                      <div className="hex-card pointer-events-none absolute -right-1.5 -top-1.5 h-26 w-18 sm:h-33 sm:w-23 bg-amber-950/65" />
                      <div className="hex-card pointer-events-none absolute -right-0.5 -top-0.5 h-26 w-18 sm:h-33 sm:w-23 bg-amber-900/50" />
                      <SabaccCard
                        faceDown
                        cardBack={dossier.selectedCardBack}
                        interactiveHint={isMyTurn && gameState.currentPhase === 'CARD'}
                        onClick={
                          isMyTurn && gameState.currentPhase === 'CARD'
                            ? () => {
                                sound('card');
                                socket?.emit('cardAction', {
                                  action: selectedCardId ? 'swap_deck' : 'draw',
                                  cardId: selectedCardId ?? undefined,
                                });
                                setSelectedCardId(null);
                                setPendingSwapMode(null);
                              }
                            : undefined
                        }
                        title={
                          isMyTurn && gameState.currentPhase === 'CARD'
                            ? selectedCardId
                              ? 'Swap selected card with Deck'
                              : 'Draw a card from Deck'
                            : `Deck (${gameState.deckCount} cards)`
                        }
                        className="relative z-10 h-26 w-18 sm:h-33 sm:w-23"
                      />
                    </div>
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                        isMyTurn && gameState.currentPhase === 'CARD' && selectedCardId
                          ? 'text-cyan-300'
                          : 'text-slate-300/80'
                      }`}
                    >
                      {isMyTurn && gameState.currentPhase === 'CARD'
                        ? selectedCardId
                          ? 'Swap Deck'
                          : 'Deck'
                        : `Deck · ${gameState.deckCount}`}
                    </span>
                  </div>

                  {/* Central Pot Well */}
                  <div className="sw-cut flex flex-col sm:flex-row items-center gap-2.5 sm:gap-7 border border-amber-400/30 bg-black/65 px-4 py-3 sm:px-7 sm:py-4 shadow-[0_12px_36px_rgba(0,0,0,0.65)] backdrop-blur-md">
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-amber-200/70">
                        Hand Pot
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 sm:gap-2">
                        <CreditIngotStack amount={gameState.handPot} variant="gold" size="sm" />
                        <AnimatedCredits
                          value={gameState.handPot}
                          className="font-mono text-2xl sm:text-3xl font-bold text-amber-400"
                        />
                      </div>
                    </div>

                    <div className="h-px w-14 sm:h-9 sm:w-px bg-white/12" />

                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-rose-200/75">
                        Sabacc Pot
                      </span>
                      <div className="mt-0.5 flex items-center gap-1.5 sm:gap-2">
                        <CreditIngotStack amount={gameState.sabaccPot} variant="crimson" size="sm" />
                        <AnimatedCredits
                          value={gameState.sabaccPot}
                          className="font-mono text-2xl sm:text-3xl font-bold text-rose-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Face-Up Discard Pile */}
                  <div className="flex flex-col items-center gap-1.5">
                    {topDiscard ? (
                      <SabaccCard
                        card={topDiscard}
                        cardBack={dossier.selectedCardBack}
                        lightMode={isLight}
                        onClick={
                          isMyTurn && gameState.currentPhase === 'CARD'
                            ? () => {
                                if (selectedCardId) {
                                  sound('card');
                                  socket?.emit('cardAction', {
                                    action: 'swap_discard',
                                    cardId: selectedCardId,
                                  });
                                  setSelectedCardId(null);
                                  setPendingSwapMode(null);
                                } else {
                                  sound('click');
                                  setPendingSwapMode(curr =>
                                    curr === 'swap_discard' ? null : 'swap_discard'
                                  );
                                }
                              }
                            : undefined
                        }
                        title={
                          isMyTurn && gameState.currentPhase === 'CARD'
                            ? selectedCardId
                              ? `Trade selected card for ${topDiscardLabel}`
                              : `Tap to trade a card in hand for ${topDiscardLabel}`
                            : 'Discard Pile'
                        }
                        className={`h-26 w-18 text-[42px] sm:h-33 sm:w-23 sm:text-[54px] ${
                          isMyTurn &&
                          gameState.currentPhase === 'CARD' &&
                          (selectedCardId || pendingSwapMode === 'swap_discard')
                            ? 'ring-2 ring-amber-400 shadow-[0_0_26px_rgba(251,191,36,0.5)]'
                            : ''
                        }`}
                      />
                    ) : (
                      <div className="hex-card flex h-26 w-18 sm:h-33 sm:w-23 items-center justify-center border border-dashed border-white/15 bg-black/30 font-mono text-xs text-white/30">
                        —
                      </div>
                    )}
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                        isMyTurn &&
                        gameState.currentPhase === 'CARD' &&
                        (selectedCardId || pendingSwapMode === 'swap_discard')
                          ? 'text-amber-300'
                          : 'text-slate-300/80'
                      }`}
                    >
                      {isMyTurn && gameState.currentPhase === 'CARD' && topDiscard
                        ? `Take ${topDiscardLabel}`
                        : 'Discard'}
                    </span>
                  </div>
                </div>
              </>
            )}

            <AnimatePresence>
              {gameState.currentPhase === 'DICE' && (
                <SpikeDiceOverlay
                  roll={gameState.lastDiceRoll}
                  tumbleFirst={tumbleFirst}
                  tumbleSecond={tumbleSecond}
                  shiftTriggered={gameState.shiftTriggered}
                  diceStyle={dossier.selectedDice}
                />
              )}
            </AnimatePresence>

            {gameState.currentPhase === 'JOINING' && (
              <div className="z-20 mt-2 flex flex-wrap items-center justify-center gap-2">
                {!me?.isSpectator && !me?.isReady && (
                  (me?.credits ?? 0) < reqAnte ? (
                    <button
                      onClick={() => setShowBuyIn(true)}
                      className="sw-cut-sm min-h-[46px] bg-amber-400 px-5 font-mono text-xs font-bold uppercase tracking-widest text-zinc-950"
                    >
                      Add Chips ({reqAnte}+ CR)
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        sound('click');
                        socket?.emit('ready', {});
                      }}
                      className="sw-cut-sm flex min-h-[46px] items-center gap-2 bg-amber-400 px-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-zinc-950 shadow-[0_0_24px_rgba(251,191,36,0.35)] hover:bg-amber-300"
                    >
                      <Play className="h-4 w-4 fill-current" /> Deal Hand
                    </button>
                  )
                )}

                {isHost &&
                  gameState.players.length >= 2 &&
                  gameState.players.some(p => !p.isAI && !p.isReady) && (
                    <button
                      onClick={() => socket?.emit('startHandNow', {})}
                      className="sw-cut-sm min-h-[44px] border border-amber-400/45 bg-black/70 px-4 font-mono text-xs uppercase tracking-wider text-amber-300 hover:bg-amber-500/20"
                    >
                      Start Now
                    </button>
                  )}

                {(gameState.mode === 'party' || gameState.mode === 'quick_solo') &&
                  gameState.players.length < 6 && (
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'novice', label: '+Easy Bot' },
                          { id: 'regular', label: '+Bot' },
                          { id: 'shark', label: '+Pro Bot' },
                        ] as { id: BotSkill; label: string }[]
                      ).map(sk => (
                        <button
                          key={sk.id}
                          onClick={() => {
                            sound('click');
                            socket?.emit('addAI', { skill: sk.id });
                          }}
                          className="sw-cut-sm min-h-[40px] border border-white/15 bg-black/60 px-3 font-mono text-[11px] uppercase text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
                        >
                          {sk.label}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* 3. LOWER FELT RIM: Large Tactile Player Hand & Single Intuitive Total Pill */}
          <div className="relative z-20 flex flex-col items-center gap-2 pb-0.5">
            {pendingSwapMode && isMyTurn && gameState.currentPhase === 'CARD' && (
              <div className="sw-cut-sm flex items-center gap-2 border border-amber-400 bg-amber-500/20 px-3.5 py-1.5 font-mono text-xs font-bold text-amber-200">
                <span>
                  Tap a card below to trade for{' '}
                  {pendingSwapMode === 'swap_deck' ? 'a new Deck card' : `${topDiscardLabel}`}
                </span>
                <button
                  onClick={() => setPendingSwapMode(null)}
                  aria-label="Cancel Swap"
                  className="ml-1 flex h-6 w-6 items-center justify-center text-white/80 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-end justify-center gap-2 sm:gap-3.5">
              <AnimatePresence mode="popLayout">
                {me?.hand.map((card, i) => {
                  const mid = (me.hand.length - 1) / 2;
                  const isSelected = selectedCardId === card.id;
                  const isSwapTarget = !!pendingSwapMode && isMyTurn && gameState.currentPhase === 'CARD';
                  const fanAngle = isSelected || isSwapTarget ? 0 : (i - mid) * 2.8;
                  const fanLift = isSelected ? -16 : isSwapTarget ? -6 : Math.abs(i - mid) * 2.5;
                  return (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ y: 55, opacity: 0, rotateY: 90, scale: 0.78 }}
                      animate={{
                        y: fanLift,
                        rotate: fanAngle,
                        opacity: 1,
                        rotateY: 0,
                        scale: isSelected ? 1.06 : isSwapTarget ? 1.02 : 1,
                      }}
                      exit={{ y: -55, opacity: 0, scale: 0.7 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      onMouseEnter={() => setHoveredCardId(card.id)}
                      onMouseLeave={() => setHoveredCardId(curr => (curr === card.id ? null : curr))}
                      className={`relative h-30 w-20.5 text-[48px] sm:h-38 sm:w-26 sm:text-[62px] ${
                        isSwapTarget ? 'ring-2 ring-amber-400/80 rounded-lg' : ''
                      }`}
                    >
                      <SabaccCard
                        card={card}
                        selected={isSelected || isSwapTarget}
                        cardBack={dossier.selectedCardBack}
                        lightMode={isLight}
                        onClick={() => {
                          if (isMyTurn && gameState.currentPhase === 'CARD') {
                            if (pendingSwapMode) {
                              sound('card');
                              socket?.emit('cardAction', {
                                action: pendingSwapMode,
                                cardId: card.id,
                              });
                              setPendingSwapMode(null);
                              setSelectedCardId(null);
                            } else {
                              sound('click');
                              setSelectedCardId(prev => (prev === card.id ? null : card.id));
                            }
                          }
                        }}
                        className="h-full w-full"
                      />
                      {gameState.players[gameState.dealerIndex]?.id === me?.id && i === 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-sm bg-amber-400 font-mono text-[10px] font-bold text-zinc-950 shadow">
                          D
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Single Crystal-Clear Hand Total Pill (Zero Cryptic Jargon) */}
            {me && !me.isFolded && myEval && gameState.currentPhase !== 'JOINING' && (
              <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                <div
                  className={`sw-cut-sm flex items-center gap-2 border px-4 py-1 ${
                    myEval.sum === 0
                      ? 'border-amber-400/75 bg-amber-500/20 text-amber-200 shadow-[0_0_22px_rgba(251,191,36,0.28)]'
                      : 'border-white/15 bg-black/75 text-slate-200'
                  }`}
                >
                  {myEval.sum === 0 ? (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      <span className="font-bold uppercase tracking-wider text-amber-300">
                        0 · {myEval.rankName}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-400">Total</span>
                      <span className="text-sm font-bold text-amber-300">
                        {myEval.sum > 0 ? `+${myEval.sum}` : myEval.sum}
                      </span>
                      <span className="text-white/25">•</span>
                      <span className="text-[11px] text-cyan-200/80">Goal: 0</span>
                    </>
                  )}
                </div>

                {swapDiscardPreview && topDiscard && isMyTurn && gameState.currentPhase === 'CARD' && (
                  <div className="sw-cut-sm flex items-center gap-1.5 border border-amber-400/50 bg-amber-950/80 px-3 py-1 text-xs text-amber-200">
                    <span>
                      Take {topDiscardLabel} →{' '}
                      <strong>
                        {swapDiscardPreview.sum === 0
                          ? `0 (${swapDiscardPreview.rankName})`
                          : `Total ${swapDiscardPreview.sum > 0 ? `+${swapDiscardPreview.sum}` : swapDiscardPreview.sum}`}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* SIMPLIFIED RIGHT-HANDED THUMB ACTION BAR (Zero sliders, comfy >= 52px targets) */}
      <footer className="safe-bottom z-30 shrink-0 border-t border-white/10 bg-[#060a10]/94 px-3 pt-2.5 sm:px-6 backdrop-blur-xl">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          {gameState.currentPhase === 'CARD' && isMyTurn ? (
            selectedCardId ? (
              /* Card Selected -> Cancel on Left, Swap Deck in Center, Primary Take Discard on Right (under right thumb!) */
              <div className="space-y-1.5">
                <div className="text-center font-mono text-[11px] text-amber-300">
                  Choose where to trade your selected card:
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      sound('click');
                      setSelectedCardId(null);
                      setPendingSwapMode(null);
                    }}
                    className="sw-cut-sm min-h-[52px] border border-white/15 bg-white/5 font-mono text-xs uppercase text-slate-300 hover:text-white active:scale-[0.97]"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={() => {
                      sound('card');
                      socket?.emit('cardAction', { action: 'swap_deck', cardId: selectedCardId });
                      setSelectedCardId(null);
                      setPendingSwapMode(null);
                    }}
                    className="sw-cut-sm min-h-[52px] border border-cyan-400/60 bg-cyan-500/20 font-mono text-xs font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/30 active:scale-[0.97]"
                  >
                    Swap Deck
                  </button>

                  <button
                    disabled={!topDiscard}
                    onClick={() => {
                      sound('card');
                      socket?.emit('cardAction', { action: 'swap_discard', cardId: selectedCardId });
                      setSelectedCardId(null);
                      setPendingSwapMode(null);
                    }}
                    className="sw-cut-sm min-h-[52px] bg-amber-400 font-mono text-xs font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-300 active:scale-[0.97] disabled:opacity-35"
                  >
                    {topDiscard ? `Take ${topDiscardLabel}` : 'Discard'}
                  </button>
                </div>
              </div>
            ) : (
              /* Default Card Phase -> Draw on Left, Primary Stand on Right (under right thumb!) */
              <div className="space-y-1.5">
                <div className="text-center font-mono text-[11px] text-slate-400">
                  Tap a card in your hand to swap it, or choose below:
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      sound('card');
                      socket?.emit('cardAction', { action: 'draw' });
                      setSelectedCardId(null);
                      setPendingSwapMode(null);
                    }}
                    disabled={(me?.hand.length ?? 0) >= 6}
                    className="sw-cut-sm min-h-[52px] border border-cyan-400/55 bg-cyan-500/15 font-mono text-sm font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/25 active:scale-[0.97] disabled:opacity-35"
                  >
                    Draw Card
                  </button>

                  <button
                    onClick={() => {
                      sound('click');
                      socket?.emit('cardAction', { action: 'stand' });
                      setSelectedCardId(null);
                      setPendingSwapMode(null);
                    }}
                    className="sw-cut-sm min-h-[52px] bg-amber-400 font-mono text-sm font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-300 active:scale-[0.97]"
                  >
                    Stand
                  </button>
                </div>
              </div>
            )
          ) : gameState.currentPhase === 'BETTING' && isMyTurn && me ? (
            (() => {
              const step2x = Math.min(
                maxRaiseAdd,
                Math.max(minRaiseAdd, gameState.settings.ante * 2 === minRaiseAdd ? minRaiseAdd * 2 : gameState.settings.ante * 2)
              );
              const potPreset = Math.min(maxRaiseAdd, Math.max(minRaiseAdd, gameState.handPot));
              const activeBet = Math.min(maxRaiseAdd, Math.max(minRaiseAdd, parseInt(betAmount) || minRaiseAdd));

              return (
                <div className="space-y-2">
                  {/* Comfy 4-Chip Preset Row — Zero Sliders! */}
                  {maxRaiseAdd > 0 && (
                    <div className="grid grid-cols-4 gap-2 font-mono text-xs">
                      {[
                        { id: 'min', label: `Min ${minRaiseAdd}`, val: minRaiseAdd },
                        { id: 'mid', label: `2× (${step2x})`, val: step2x },
                        { id: 'pot', label: `Pot (${potPreset})`, val: potPreset },
                      ].map(chip => {
                        const isPicked = activeBet === chip.val;
                        return (
                          <button
                            key={chip.id}
                            onClick={() => {
                              sound('click');
                              setBetAmount(String(chip.val));
                            }}
                            className={`sw-cut-sm min-h-[44px] border font-bold uppercase transition-colors active:scale-[0.97] ${
                              isPicked
                                ? 'border-amber-400 bg-amber-500/25 text-amber-300'
                                : 'border-white/15 bg-white/[0.05] text-slate-300 hover:text-white'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => {
                          sound('click');
                          setShowAllInConfirm(true);
                        }}
                        className="sw-cut-sm min-h-[44px] border border-rose-400/45 bg-rose-500/15 font-bold uppercase text-rose-300 hover:bg-rose-500/25 active:scale-[0.97]"
                      >
                        {cappedByLimit ? `Max ${mySpendable}` : 'All In'}
                      </button>
                    </div>
                  )}

                  {/* Fold (Far Left) | Check/Call (Center) | Bet/Raise (Right Thumb Primary!) */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => {
                        sound('fold');
                        socket?.emit('betAction', { action: 'fold' });
                      }}
                      className="sw-cut-sm min-h-[52px] border border-rose-500/50 bg-rose-500/15 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-300 hover:bg-rose-500/25 active:scale-[0.97]"
                    >
                      Fold
                    </button>

                    {callDue > 0 ? (
                      <button
                        onClick={() => {
                          sound('chips');
                          socket?.emit('betAction', { action: 'call' });
                        }}
                        className="sw-cut-sm min-h-[52px] border border-emerald-400/60 bg-emerald-500/20 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/30 active:scale-[0.97]"
                      >
                        Call {Math.min(mySpendable, callDue)}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          sound('check');
                          socket?.emit('betAction', { action: 'check' });
                        }}
                        className="sw-cut-sm min-h-[52px] border border-cyan-400/55 bg-cyan-500/20 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-500/30 active:scale-[0.97]"
                      >
                        Check
                      </button>
                    )}

                    <button
                      disabled={maxRaiseAdd <= 0}
                      onClick={() => {
                        sound('chips');
                        socket?.emit('betAction', {
                          action: gameState.currentBet === 0 ? 'bet' : 'raise',
                          amount: String(activeBet),
                        });
                      }}
                      className="sw-cut-sm min-h-[52px] bg-amber-400 font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-950 hover:bg-amber-300 active:scale-[0.97] disabled:bg-white/10 disabled:text-slate-500"
                    >
                      {gameState.currentBet === 0 ? `Bet ${activeBet}` : `Raise +${activeBet}`}
                    </button>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex min-h-[44px] w-full items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-2.5 text-slate-300">
                <span
                  className={`h-2 w-2 rotate-45 ${
                    isHandInPlay ? 'animate-pulse bg-cyan-400' : 'bg-amber-400/70'
                  }`}
                />
                <span className="uppercase tracking-wider">
                  {gameState.currentPhase === 'DICE'
                    ? 'Rolling Spike Dice...'
                    : gameState.currentPhase === 'SHOWDOWN'
                      ? 'Hand Complete'
                      : gameState.currentPhase === 'JOINING'
                        ? 'Ready to Deal'
                        : `${gameState.players[gameState.turnIndex]?.name ?? 'Player'}'s Turn`}
                </span>
                {turnRemainingSec !== null && (
                  <span className="text-amber-300">{turnRemainingSec}s</span>
                )}
              </div>

              {!me?.isSpectator && (
                <div className="relative">
                  <button
                    onClick={() => setShowEmotes(v => !v)}
                    className="sw-cut-sm flex min-h-[40px] items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3.5 text-xs uppercase tracking-wider text-slate-200 hover:border-amber-400/40 hover:text-amber-300"
                  >
                    <Smile className="h-4 w-4" /> Quip
                  </button>

                  <AnimatePresence>
                    {showEmotes && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        className="sw-cut absolute bottom-12 right-0 z-50 w-56 border border-cyan-400/35 bg-[#080d14] p-1.5 shadow-2xl"
                      >
                        {QUICK_EMOTES.map(q => (
                          <button
                            key={q}
                            onClick={() => {
                              sound('click');
                              socket?.emit('emote', { text: q });
                              setShowEmotes(false);
                            }}
                            className="block min-h-[38px] w-full px-3 py-1.5 text-left font-mono text-xs text-slate-200 hover:bg-cyan-500/15 hover:text-cyan-200"
                          >
                            “{q}”
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
