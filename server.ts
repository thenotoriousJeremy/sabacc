import { createServer } from 'http';
import { parse } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces, type NetworkInterfaceInfo } from 'os';
import { randomInt, randomUUID } from 'crypto';
import { Server } from 'socket.io';
import express from 'express';
import { 
  createDeck, 
  shuffle, 
  GameState, 
  Player, 
  Card, 
  evaluateHand 
} from './lib/game-logic';

const dev = process.env.NODE_ENV !== 'production';

// The packaged host binary ships a prebuilt static bundle and no Next runtime.
// Docker and `npm run dev` keep using Next itself.
// SABACC_PACKAGED is baked in at bundle time; the web assets sit beside the exe.
const staticDir = process.env.STATIC_DIR
  ?? (process.env.SABACC_PACKAGED === 'true' ? join(dirname(process.execPath), 'web') : undefined);

const port = Number(process.env.PORT) || 3000;

// --- Origin policy -------------------------------------------------------
// If ALLOWED_ORIGINS is set, only those origins may connect. Otherwise we
// allow loopback, private LAN ranges, and the origins used by the packaged
// desktop/Android clients, which is the "host a game for friends" case.
const configuredOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const PACKAGED_CLIENT_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'file://',
];

function isPrivateHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) return true;
  if (/^127\./.test(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  return false;
}

function isAllowedOrigin(origin?: string): boolean {
  // Same-origin browser requests and native clients send no Origin header.
  if (!origin) return true;
  if (configuredOrigins.length > 0) return configuredOrigins.includes(origin);
  if (PACKAGED_CLIENT_ORIGINS.includes(origin)) return true;
  try {
    return isPrivateHostname(new URL(origin).hostname);
  } catch {
    return false;
  }
}

// --- Room codes ----------------------------------------------------------
// Ambiguous characters (I, O, 0, 1) are omitted so codes can be read aloud.
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

function normalizeRoomCode(raw: unknown): string | null {
  const code = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4,6}$/.test(code) ? code : null;
}

// --- Input limits --------------------------------------------------------
const MAX_NAME_LENGTH = 20;
const MAX_CHAT_LENGTH = 300;
const MAX_CREDITS = 1_000_000;
const MAX_BUY_IN = 100_000;
const MAX_PLAYERS_PER_ROOM = 6;
// Long enough to survive a page refresh, a tunnel change, or a phone locking.
const ROOM_GRACE_PERIOD_MS = 60_000;

function sanitizeName(raw: unknown, fallback: string): string {
  // Strip control characters so names cannot break the log or chat rendering.
  const name = String(raw ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_NAME_LENGTH);
  return name || fallback;
}

function clampInt(raw: unknown, min: number, max: number): number | null {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

async function bootstrap() {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
      methods: ['GET', 'POST'],
      credentials: false,
    },
  });

  const games: Record<string, GameState> = {};

  // --- Sessions ----------------------------------------------------------
  // A seat belongs to a server-issued token, never to a name and never to a
  // socket id. Tokens are held here rather than on Player because GameState is
  // broadcast to the whole room, and a leaked token would let anyone take the
  // seat it belongs to.
  interface Session {
    token: string;
    roomId: string;
    playerId: string;
  }

  const sessionsByToken = new Map<string, Session>();
  const sessionsBySocket = new Map<string, Session>();
  // Seats vacated in the lobby are held briefly so a refresh does not lose them.
  const pendingRemoval = new Map<string, NodeJS.Timeout>();

  function generateRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!games[code]) return code;
    }
    throw new Error('Could not allocate a free room code');
  }

  // Resolves who is acting from the socket's own session. The roomId in the
  // client payload is never trusted for this - otherwise any socket could act
  // in any room it managed to guess the code for.
  function resolveActor(socketId: string): { game: GameState; player: Player } | null {
    const session = sessionsBySocket.get(socketId);
    if (!session) return null;
    const game = games[session.roomId];
    if (!game) return null;
    const player = game.players.find(p => p.id === session.playerId);
    return player ? { game, player } : null;
  }

  function currentTurnPlayer(game: GameState): Player | undefined {
    return game.players[game.turnIndex];
  }

  // A disconnected player still holds their seat, so they must not be counted
  // as someone the table is waiting on.
  function isPresent(player: Player): boolean {
    return player.isAI === true || player.isConnected !== false;
  }

  function canStart(game: GameState): boolean {
    const present = game.players.filter(isPresent);
    const contenders = present.filter(p => !p.isSpectator);
    return contenders.length >= 2 && present.every(p => p.isReady);
  }

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('createRoom', () => {
      const roomId = generateRoomCode();
      games[roomId] = {
        roomId,
        players: [],
        deck: shuffle(createDeck()),
        discardPile: [],
        handPot: 0,
        sabaccPot: 0,
        currentRound: 1,
        gamesPlayed: 0,
        currentPhase: 'JOINING',
        turnIndex: 0,
        dealerIndex: 0,
        currentBet: 0,
        lastDiceRoll: null,
        winnerId: null,
        logs: [`Room ${roomId} created.`],
        messages: []
      };
      socket.emit('roomCreated', { roomId });
    });

    socket.on('joinRoom', ({ roomId, playerName, isSpectator, token }) => {
      const code = normalizeRoomCode(roomId);
      if (!code) {
        socket.emit('error', 'Room codes are 4-6 letters or numbers.');
        return;
      }

      // Rooms are only created through createRoom, so a typo no longer strands
      // you alone in a brand new room that looks like the one you wanted.
      const game = games[code];
      if (!game) {
        socket.emit('error', `Room ${code} does not exist. Check the code or create a new room.`);
        return;
      }

      // Reconnect only if the token was issued by us, for this room.
      const existingSession = typeof token === 'string' ? sessionsByToken.get(token) : undefined;
      const rejoining = existingSession && existingSession.roomId === code
        ? game.players.find(p => p.id === existingSession.playerId)
        : undefined;

      socket.join(code);

      if (existingSession && rejoining) {
        sessionsBySocket.set(socket.id, existingSession);
        // They came back inside the grace period, so cancel the seat release.
        const scheduled = pendingRemoval.get(existingSession.playerId);
        if (scheduled) {
          clearTimeout(scheduled);
          pendingRemoval.delete(existingSession.playerId);
        }
        rejoining.isConnected = true;
        if (isSpectator !== undefined) {
          rejoining.isSpectator = !!isSpectator;
          rejoining.isFolded = !!isSpectator || (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN');
        }
        game.logs.push(`${rejoining.name} reconnected.`);
        socket.emit('session', { token: existingSession.token, playerId: existingSession.playerId, roomId: code });
        io.to(code).emit('gameStateUpdate', game);
        return;
      }

      if (game.players.length >= MAX_PLAYERS_PER_ROOM) {
        socket.emit('error', `Room ${code} is full.`);
        return;
      }

      const isMidGame = game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN';
      const player: Player = {
        id: randomUUID(),
        name: sanitizeName(playerName, `Player ${game.players.length + 1}`),
        hand: [],
        credits: 1000,
        isFolded: !!isSpectator || isMidGame,
        isReady: !!isSpectator,
        betThisRound: 0,
        isSpectator: !!isSpectator,
        isConnected: true
      };
      game.players.push(player);

      const session: Session = { token: randomUUID(), roomId: code, playerId: player.id };
      sessionsByToken.set(session.token, session);
      sessionsBySocket.set(socket.id, session);

      game.logs.push(`${player.name} joined the room${isSpectator ? ' as a spectator' : (isMidGame ? ' (waiting for next game)' : '')}.`);
      socket.emit('session', { token: session.token, playerId: player.id, roomId: code });
      io.to(code).emit('gameStateUpdate', game);
    });

    socket.on('updateCredits', ({ credits }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      const amount = clampInt(credits, 0, MAX_CREDITS);
      if (amount === null) {
        socket.emit('error', 'Credits must be a number.');
        return;
      }
      if (game.currentPhase === 'JOINING' || game.currentPhase === 'SHOWDOWN') {
        player.credits = amount;
        game.logs.push(`${player.name} updated their credits to ${amount}.`);
        io.to(game.roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('toggleSpectator', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const roomId = game.roomId;
      {
        const isMidGame = game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN';
        
        // If trying to become a player mid-game, ignore
        if (!player.isSpectator && isMidGame) {
          // Already a player, can always switch to spectator (folds them)
          player.isSpectator = true;
          player.isFolded = true;
          player.hand = [];
          game.logs.push(`${player.name} switched to spectating.`);
        } else if (player.isSpectator) {
          // Spectator trying to join
          if (isMidGame) {
            // Can't join mid-game as active player
            player.isSpectator = false;
            player.isFolded = true;
            game.logs.push(`${player.name} will join the next game.`);
          } else {
            player.isSpectator = false;
            player.isReady = false;
            player.isFolded = false;
            game.logs.push(`${player.name} is now playing.`);
          }
        } else {
          // Player switching to spectator in lobby
          player.isSpectator = true;
          player.isReady = true;
          player.isFolded = true;
          game.logs.push(`${player.name} is now spectating.`);
        }

        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('ready', () => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const roomId = game.roomId;
      {
        // Enforce ante check (15 CR)
        if (!player.isSpectator && player.credits < 15) {
          game.logs.push(`${player.name} needs at least 15 CR to play.`);
          io.to(roomId).emit('gameStateUpdate', game);
          return;
        }
        player.isReady = true;
        game.logs.push(`${player.name} is ready.`);
      }

      if (canStart(game)) {
        startGame(game);
      }

      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('addAI', () => {
      // Membership is required: previously any socket could stuff bots into any
      // room whose code it could guess.
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game } = actor;
      const roomId = game.roomId;
      if (game.currentPhase !== 'JOINING') return;
      if (game.players.length >= MAX_PLAYERS_PER_ROOM) return;

      const aiId = `ai-${Math.random().toString(36).substr(2, 9)}`;
      const aiNames = ["C-3PO", "R2-D2", "L3-37", "IG-88", "HK-47", "K-2SO", "Chopper"];
      const name = aiNames[Math.floor(Math.random() * aiNames.length)] + " (Bot)";

      game.players.push({
        id: aiId,
        name,
        hand: [],
        credits: 1000,
        isFolded: false,
        isReady: true,
        betThisRound: 0,
        isAI: true
      });

      game.logs.push(`${name} joined the room.`);
      io.to(roomId).emit('gameStateUpdate', game);

      // Check if game can start
      if (canStart(game)) {
        startGame(game);
        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('removeAI', ({ aiId }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game } = actor;
      const roomId = game.roomId;
      if (game.currentPhase !== 'JOINING') return;

      const index = game.players.findIndex(p => p.id === aiId && p.isAI);
      if (index !== -1) {
        const [removed] = game.players.splice(index, 1);
        game.logs.push(`${removed.name} left the room.`);
        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('addCredits', ({ amount }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;

      const buyIn = clampInt(amount, 1, MAX_BUY_IN);
      if (buyIn === null) {
        socket.emit('error', 'Buy-in must be a number.');
        return;
      }
      if (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN' && !player.isSpectator && !player.isFolded) {
        socket.emit('error', "You cannot add credits while playing a hand.");
        return;
      }
      player.credits = Math.min(MAX_CREDITS, player.credits + buyIn);
      game.logs.push(`${player.name} added ${buyIn} credits.`);
      io.to(game.roomId).emit('gameStateUpdate', game);
    });

    socket.on('cardAction', ({ action, cardId }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const roomId = game.roomId;
      if (game.currentPhase !== 'CARD') return;

      const currentPlayer = currentTurnPlayer(game);
      if (!currentPlayer || currentPlayer.id !== player.id) return;

      if (action === 'draw') {
        const card = game.deck.pop();
        if (card) currentPlayer.hand.push(card);
        game.logs.push(`${currentPlayer.name} drew a card from the deck.`);
      } else if (action === 'swap_deck') {
        // Discard a card first, then draw from deck
        const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
          const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
          game.discardPile.push(discarded);
          const newCard = game.deck.pop();
          if (newCard) currentPlayer.hand.push(newCard);
          game.logs.push(`${currentPlayer.name} swapped a card with the deck.`);
        }
      } else if (action === 'swap_discard') {
        // Discard a card first, then take top of discard pile
        const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
        if (cardIndex !== -1 && game.discardPile.length > 0) {
          const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
          const newCard = game.discardPile.pop()!;
          game.discardPile.push(discarded);
          currentPlayer.hand.push(newCard);
          game.logs.push(`${currentPlayer.name} swapped a card with the discard pile.`);
        }
      } else {
        game.logs.push(`${currentPlayer.name} stood.`);
      }

      advanceTurn(game);
      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('betAction', ({ action, amount }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const roomId = game.roomId;
      if (game.currentPhase !== 'BETTING') return;

      const currentPlayer = currentTurnPlayer(game);
      if (!currentPlayer || currentPlayer.id !== player.id) return;

      // A negative raise would previously have refunded the raiser from the pot.
      const betAmount = clampInt(amount, 0, MAX_CREDITS) ?? 0;

      if (action === 'fold') {
        currentPlayer.isFolded = true;
        game.logs.push(`${currentPlayer.name} folded.`);
      } else if (action === 'check') {
        if (game.currentBet > currentPlayer.betThisRound) {
          game.logs.push(`${currentPlayer.name} cannot check, must call or fold.`);
          return;
        }
        game.logs.push(`${currentPlayer.name} checked.`);
      } else if (action === 'call') {
        const callAmount = Math.min(game.currentBet - currentPlayer.betThisRound, currentPlayer.credits);
        if (callAmount > 0) {
          currentPlayer.credits -= callAmount;
          currentPlayer.betThisRound += callAmount;
          game.handPot += callAmount;
          if (currentPlayer.credits === 0) {
            game.logs.push(`${currentPlayer.name} called ALL IN.`);
          } else {
            game.logs.push(`${currentPlayer.name} called.`);
          }
        } else {
          game.logs.push(`${currentPlayer.name} checked.`);
        }
      } else if (action === 'raise' || action === 'bet' || action === 'all_in') {
        let totalToPay = 0;
        let raiseTo = 0;

        if (action === 'all_in') {
          totalToPay = currentPlayer.credits;
          raiseTo = currentPlayer.betThisRound + totalToPay;
        } else {
          raiseTo = game.currentBet + betAmount;
          totalToPay = raiseTo - currentPlayer.betThisRound;
        }
        
        if (totalToPay > currentPlayer.credits) {
          game.logs.push(`${currentPlayer.name} doesn't have enough credits.`);
          return;
        }

        currentPlayer.credits -= totalToPay;
        currentPlayer.betThisRound += totalToPay;
        game.handPot += totalToPay;
        
        if (raiseTo > game.currentBet) {
          game.currentBet = raiseTo;
        }
        
        if (action === 'all_in' || currentPlayer.credits === 0) {
          game.logs.push(`${currentPlayer.name} went ALL IN with ${totalToPay}.`);
        } else {
          game.logs.push(`${currentPlayer.name} ${action === 'bet' ? 'bet' : 'raised to'} ${raiseTo}.`);
        }
      }

      advanceTurn(game);
      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('chatMessage', ({ text }) => {
      const actor = resolveActor(socket.id);
      if (!actor) return;
      const { game, player } = actor;
      const roomId = game.roomId;

      const message = String(text ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, MAX_CHAT_LENGTH);
      if (!message) return;

      game.messages.push({
        sender: player.name,
        text: message,
        timestamp: Date.now()
      });

      if (game.messages.length > 50) game.messages.shift();
      
      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);

      const session = sessionsBySocket.get(socket.id);
      sessionsBySocket.delete(socket.id);
      if (!session) return;

      const roomId = session.roomId;
      const game = games[roomId];
      if (!game) return;

      const index = game.players.findIndex(p => p.id === session.playerId);
      if (index === -1) return;
      const player = game.players[index];

      player.isConnected = false;

      if (game.currentPhase === 'JOINING') {
        // Hold the seat so a refresh keeps their name and credits, but release
        // it if they really left. The ready check ignores them meanwhile, so a
        // ghost in the lobby cannot block the table from starting.
        game.logs.push(`${player.name} lost connection.`);
        pendingRemoval.set(player.id, setTimeout(() => {
          pendingRemoval.delete(player.id);
          const current = games[roomId];
          if (!current) return;
          const at = current.players.findIndex(p => p.id === session.playerId);
          if (at === -1 || current.players[at].isConnected) return;
          current.players.splice(at, 1);
          sessionsByToken.delete(session.token);
          current.logs.push(`${player.name} left the room.`);
          io.to(roomId).emit('gameStateUpdate', current);
        }, ROOM_GRACE_PERIOD_MS));
      } else {
        // Mid-hand: keep the seat and their stake in the pot so they can
        // reconnect, but do not let the table wait on them.
        game.logs.push(`${player.name} lost connection.`);
        if (currentTurnPlayer(game)?.id === player.id) {
          game.logs.push(`${player.name} folded after losing connection.`);
          player.isFolded = true;
          advanceTurn(game);
        }
      }

      // Clean up room if no connected humans are left, after a grace period so
      // that a refresh does not destroy the room.
      const liveHumans = game.players.filter(p => !p.isAI && p.isConnected);
      if (liveHumans.length === 0) {
        setTimeout(() => {
          const current = games[roomId];
          if (!current) return;
          if (current.players.some(p => !p.isAI && p.isConnected)) return;
          console.log(`Cleaning up empty room: ${roomId}`);
          for (const [token, s] of sessionsByToken) {
            if (s.roomId === roomId) sessionsByToken.delete(token);
          }
          delete games[roomId];
        }, ROOM_GRACE_PERIOD_MS);
      }

      io.to(roomId).emit('gameStateUpdate', game);
    });
  });

  function startGame(game: GameState) {
    game.currentPhase = 'CARD';
    game.currentRound = 1;
    game.deck = shuffle(createDeck());
    game.discardPile = [game.deck.pop()!]; // Top card turned face up
    game.handPot = 0;
    game.winnerId = null;
    game.currentBet = 0;
    
    // Rotate dealer
    game.dealerIndex = (game.dealerIndex + 1) % game.players.length;
    game.logs.push(`Game started! ${game.players[game.dealerIndex].name} is the dealer.`);

    // Ante
    const ante = 10;
    const sabaccAnte = 5;
    const totalAnte = ante + sabaccAnte;
    
    game.players.forEach(p => {
      if (p.isSpectator) {
        p.isFolded = true;
        p.hand = [];
        p.betThisRound = 0;
        return;
      }

      if (p.credits < totalAnte) {
        p.isFolded = true;
        p.hand = [];
        p.betThisRound = 0;
        game.logs.push(`${p.name} doesn't have enough credits to ante and sits out.`);
      } else {
        p.credits -= totalAnte;
        game.handPot += ante;
        game.sabaccPot += sabaccAnte;
        p.hand = [game.deck.pop()!, game.deck.pop()!];
        p.isFolded = false;
        p.betThisRound = 0;
      }
    });
    game.logs.push(`Active players paid ${totalAnte} CR ante.`);
    
    // Set turn index to first non-spectator, non-folded player AFTER the dealer
    let nextIndex = (game.dealerIndex + 1) % game.players.length;
    let attempts = 0;
    while ((game.players[nextIndex].isFolded || game.players[nextIndex].isSpectator) && attempts < game.players.length) {
      nextIndex = (nextIndex + 1) % game.players.length;
      attempts++;
    }
    game.turnIndex = nextIndex;
    
    checkAndProcessAITurn(game);
  }

  function checkAndProcessAITurn(game: GameState) {
    const currentPlayer = game.players[game.turnIndex];
    if (currentPlayer && currentPlayer.isAI && !currentPlayer.isFolded && (game.currentPhase === 'CARD' || game.currentPhase === 'BETTING')) {
      setTimeout(() => {
        processAITurn(game);
      }, 1500); // Delay for realism
    }
  }

  function processAITurn(game: GameState) {
    const currentPlayer = game.players[game.turnIndex];
    if (!currentPlayer || !currentPlayer.isAI) return;

    if (game.currentPhase === 'CARD') {
      const evaluation = evaluateHand(currentPlayer.hand);
      const isSabacc = evaluation.score >= 1000000;
      const absSum = evaluation.absSum;
      
      // AI Logic:
      // 1. If hand is already a Sabacc (sum 0), Stand.
      if (isSabacc) {
        game.logs.push(`${currentPlayer.name} stood.`);
      } 
      // 2. If hand is very close to 0 (absSum <= 1) and we have 3+ cards, Stand.
      else if (absSum <= 1 && currentPlayer.hand.length >= 3) {
        game.logs.push(`${currentPlayer.name} stood.`);
      }
      // 3. If we have only 2 cards, always Draw or Swap unless we are at 0.
      else if (currentPlayer.hand.length < 3) {
        // If we are far from 0, draw.
        if (absSum > 5) {
          const card = game.deck.pop();
          if (card) currentPlayer.hand.push(card);
          game.logs.push(`${currentPlayer.name} drew a card from the deck.`);
        } else {
          // Try to swap the worst card
          const currentSum = evaluation.sum;
          let bestCardToSwap = currentPlayer.hand[0];
          let maxImpact = -1;

          currentPlayer.hand.forEach(card => {
            const impact = Math.abs(currentSum) - Math.abs(currentSum - card.value);
            if (impact > maxImpact) {
              maxImpact = impact;
              bestCardToSwap = card;
            }
          });

          const topDiscard = game.discardPile[game.discardPile.length - 1];
          const wouldImproveWithDiscard = topDiscard && Math.abs(currentSum - bestCardToSwap.value + topDiscard.value) < Math.abs(currentSum);

          if (wouldImproveWithDiscard) {
            const cardIndex = currentPlayer.hand.findIndex(c => c.id === bestCardToSwap.id);
            const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
            const newCard = game.discardPile.pop()!;
            game.discardPile.push(discarded);
            currentPlayer.hand.push(newCard);
            game.logs.push(`${currentPlayer.name} swapped a card with the discard pile.`);
          } else {
            const cardIndex = currentPlayer.hand.findIndex(c => c.id === bestCardToSwap.id);
            const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
            game.discardPile.push(discarded);
            const newCard = game.deck.pop();
            if (newCard) currentPlayer.hand.push(newCard);
            game.logs.push(`${currentPlayer.name} swapped a card with the deck.`);
          }
        }
      } 
      // 4. If we have 3+ cards and not close to 0, try to swap or draw.
      else {
        const currentSum = evaluation.sum;
        let bestCardToSwap = currentPlayer.hand[0];
        let maxImpact = -1;

        currentPlayer.hand.forEach(card => {
          const impact = Math.abs(currentSum) - Math.abs(currentSum - card.value);
          if (impact > maxImpact) {
            maxImpact = impact;
            bestCardToSwap = card;
          }
        });

        const topDiscard = game.discardPile[game.discardPile.length - 1];
        const wouldImproveWithDiscard = topDiscard && Math.abs(currentSum - bestCardToSwap.value + topDiscard.value) < Math.abs(currentSum);

        if (wouldImproveWithDiscard) {
          const cardIndex = currentPlayer.hand.findIndex(c => c.id === bestCardToSwap.id);
          const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
          const newCard = game.discardPile.pop()!;
          game.discardPile.push(discarded);
          currentPlayer.hand.push(newCard);
          game.logs.push(`${currentPlayer.name} swapped a card with the discard pile.`);
        } else if (absSum > 3 && currentPlayer.hand.length < 5) {
          // If still far from 0 and not too many cards, draw.
          const card = game.deck.pop();
          if (card) currentPlayer.hand.push(card);
          game.logs.push(`${currentPlayer.name} drew a card from the deck.`);
        } else {
          // Swap with deck as last resort to improve
          const cardIndex = currentPlayer.hand.findIndex(c => c.id === bestCardToSwap.id);
          const [discarded] = currentPlayer.hand.splice(cardIndex, 1);
          game.discardPile.push(discarded);
          const newCard = game.deck.pop();
          if (newCard) currentPlayer.hand.push(newCard);
          game.logs.push(`${currentPlayer.name} swapped a card with the deck.`);
        }
      }
      advanceTurn(game);
      io.to(game.roomId).emit('gameStateUpdate', game);
    } else if (game.currentPhase === 'BETTING') {
      const evaluation = evaluateHand(currentPlayer.hand);
      const isSabacc = evaluation.score >= 1000000;
      const absSum = evaluation.absSum;
      const callAmount = game.currentBet - currentPlayer.betThisRound;

      if (isSabacc) {
        // Strong hand: Raise or Call
        if (game.currentBet < 50 && Math.random() > 0.5) {
          const raiseAmount = 20;
          const totalToPay = (game.currentBet + raiseAmount) - currentPlayer.betThisRound;
          if (currentPlayer.credits >= totalToPay) {
            currentPlayer.credits -= totalToPay;
            currentPlayer.betThisRound += totalToPay;
            game.handPot += totalToPay;
            game.currentBet += raiseAmount;
            game.logs.push(`${currentPlayer.name} raised to ${game.currentBet}.`);
          } else {
            // Call instead
            const actualCall = Math.min(callAmount, currentPlayer.credits);
            currentPlayer.credits -= actualCall;
            currentPlayer.betThisRound += actualCall;
            game.handPot += actualCall;
            game.logs.push(`${currentPlayer.name} called${actualCall < callAmount ? ' ALL IN' : ''}.`);
          }
        } else {
          const actualCall = Math.min(callAmount, currentPlayer.credits);
          currentPlayer.credits -= actualCall;
          currentPlayer.betThisRound += actualCall;
          game.handPot += actualCall;
          game.logs.push(`${currentPlayer.name} called${actualCall < callAmount ? ' ALL IN' : ''}.`);
        }
      } else if (absSum <= 5) {
        // Decent hand: Call
        if (callAmount <= 50) {
          const actualCall = Math.min(callAmount, currentPlayer.credits);
          currentPlayer.credits -= actualCall;
          currentPlayer.betThisRound += actualCall;
          game.handPot += actualCall;
          game.logs.push(`${currentPlayer.name} called${actualCall < callAmount ? ' ALL IN' : ''}.`);
        } else {
          currentPlayer.isFolded = true;
          game.logs.push(`${currentPlayer.name} folded.`);
        }
      } else {
        // Weak hand: Fold if bet is high, otherwise call
        if (callAmount > 20) {
          currentPlayer.isFolded = true;
          game.logs.push(`${currentPlayer.name} folded.`);
        } else {
          const actualCall = Math.min(callAmount, currentPlayer.credits);
          currentPlayer.credits -= actualCall;
          currentPlayer.betThisRound += actualCall;
          game.handPot += actualCall;
          game.logs.push(`${currentPlayer.name} called${actualCall < callAmount ? ' ALL IN' : ''}.`);
        }
      }
      advanceTurn(game);
      io.to(game.roomId).emit('gameStateUpdate', game);
    }
  }

  function advanceTurn(game: GameState) {
    const activePlayers = game.players.filter(p => !p.isFolded && !p.isSpectator);
    
    if (activePlayers.length <= 1) {
      game.logs.push("Only one player remains. Ending round.");
      game.currentPhase = 'SHOWDOWN';
      handleShowdown(game);
      return;
    }

    let nextIndex = game.turnIndex;
    let passedDealer = false;
    let attempts = 0;
    
    do {
      if (nextIndex === game.dealerIndex) passedDealer = true;
      nextIndex = (nextIndex + 1) % game.players.length;
      attempts++;
    } while (
      (game.players[nextIndex].isFolded || 
       game.players[nextIndex].isSpectator || 
       (game.currentPhase === 'BETTING' && game.players[nextIndex].credits === 0)) 
      && attempts < game.players.length
    );

    game.turnIndex = nextIndex;

    // Phase transition logic
    if (passedDealer) {
      if (game.currentPhase === 'CARD') {
        game.currentPhase = 'BETTING';
        game.currentBet = 0;
        game.bettingLapComplete = false;
        game.players.forEach(p => p.betThisRound = 0);
        game.logs.push("Betting Phase started.");
      } else if (game.currentPhase === 'BETTING') {
        game.bettingLapComplete = true;
      }
    }

    if (game.currentPhase === 'BETTING') {
      const allMatched = activePlayers.every(p => p.credits === 0 || p.betThisRound === game.currentBet);
      if (game.bettingLapComplete && allMatched) {
        game.currentPhase = 'DICE';
        handleDicePhase(game);
      }
    }

    checkAndProcessAITurn(game);
  }

  function handleDicePhase(game: GameState) {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    game.lastDiceRoll = [d1, d2];
    game.logs.push(`Dice rolled: ${d1}, ${d2}`);

    if (d1 === d2) {
      game.logs.push("SABACC SHIFT! All hands discarded and redealt.");
      game.players.forEach(p => {
        if (!p.isFolded) {
          const count = p.hand.length;
          game.discardPile.push(...p.hand);
          p.hand = [];
          for (let i = 0; i < count; i++) {
            if (game.deck.length === 0) {
              game.deck = shuffle(createDeck());
            }
            p.hand.push(game.deck.pop()!);
          }
        }
      });
    }

    // Stay in DICE phase for 3 seconds so players can see the result
    io.to(game.roomId).emit('gameStateUpdate', game);

    setTimeout(() => {
      if (game.currentRound < 3) {
        game.currentRound++;
        game.currentPhase = 'CARD';
        
        let nextIndex = game.dealerIndex;
        let attempts = 0;
        do {
          nextIndex = (nextIndex + 1) % game.players.length;
          attempts++;
        } while ((game.players[nextIndex].isFolded || game.players[nextIndex].isSpectator) && attempts < game.players.length);
        game.turnIndex = nextIndex;
        
        game.logs.push(`Round ${game.currentRound} Card Phase started.`);
        checkAndProcessAITurn(game);
      } else {
        game.currentPhase = 'SHOWDOWN';
        handleShowdown(game);
      }
      io.to(game.roomId).emit('gameStateUpdate', game);
    }, 3000);
  }

  function handleShowdown(game: GameState) {
    const activePlayers = game.players.filter(p => !p.isFolded);
    if (activePlayers.length === 0) {
      game.logs.push("No active players. Pots carry over.");
      return;
    }

    const results = activePlayers.map(p => ({
      player: p,
      evaluation: evaluateHand(p.hand)
    }));

    results.sort((a, b) => b.evaluation.score - a.evaluation.score);
    const winner = results[0].player;
    
    game.winnerId = winner.id;
    game.logs.push(`Winner: ${winner.name} with ${results[0].evaluation.rankName}`);
    
    winner.credits += game.handPot;
    if (results[0].evaluation.sum === 0) {
      if (results[0].evaluation.score >= 50 * 1000000) {
        winner.credits += game.sabaccPot;
        game.sabaccPot = 0;
        game.logs.push(`${winner.name} takes the Sabacc Pot with a specialty hand!`);
      } else {
        game.logs.push(`${winner.name} won with a regular Sabacc. Sabacc Pot carries over.`);
      }
    }
    game.handPot = 0;
    game.gamesPlayed++;
    
    game.currentPhase = 'SHOWDOWN';
    game.players.forEach(p => {
      p.isReady = (p.isAI || p.isSpectator) ? true : false;
      
      // Auto-switch to spectator if out of credits
      if (!p.isSpectator && p.credits < 15) {
        p.isSpectator = true;
        p.isReady = true;
        p.isFolded = true;
        game.logs.push(`${p.name} is out of credits and switched to spectating.`);
      }
    });
    io.to(game.roomId).emit('gameStateUpdate', game);

    setTimeout(() => {
      if (game.currentPhase === 'SHOWDOWN') {
        game.currentPhase = 'JOINING';
        io.to(game.roomId).emit('gameStateUpdate', game);
      }
    }, 10000); // 10 second delay for players to see results
  }

  if (staticDir) {
    expressApp.use(express.static(staticDir));
    // Single-page app: anything unmatched falls back to the entry document.
    expressApp.get(/.*/, (_req, res) => {
      res.sendFile(join(staticDir, 'index.html'));
    });
  } else {
    // Imported lazily so the packaged binary, which never takes this path, does
    // not need the Next runtime bundled into it.
    const next = (await import('next')).default;
    const app = next({ dev });
    const handle = app.getRequestHandler();
    await app.prepare();
    expressApp.all(/.*/, (req, res) => {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    });
  }

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
    if (staticDir) {
      for (const address of localAddresses()) {
        console.log(`> On your network: http://${address}:${port}`);
      }
    }
  });
}

// Lets the host read out an address their friends can actually reach.
function localAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((info): info is NetworkInterfaceInfo => !!info && info.family === 'IPv4' && !info.internal)
    .map(info => info.address);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
