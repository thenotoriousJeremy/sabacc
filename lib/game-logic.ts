export enum CardType {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  SYLOP = 'SYLOP',
}

export enum CardSuit {
  CIRCLE = 'CIRCLE', // 3
  TRIANGLE = 'TRIANGLE', // 2
  SQUARE = 'SQUARE', // 1
  NONE = 'NONE',
}

export interface Card {
  id: string;
  value: number;
  type: CardType;
  suit: CardSuit;
}

export interface Player {
  // Server-issued and stable across reconnects. Not the socket id.
  id: string;
  name: string;
  hand: Card[];
  credits: number;
  isFolded: boolean;
  isReady: boolean;
  betThisRound: number;
  isAI?: boolean;
  isSpectator?: boolean;
  isConnected?: boolean;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface GameState {
  roomId: string;
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  handPot: number;
  sabaccPot: number;
  currentRound: number; // 1, 2, 3
  gamesPlayed: number;
  currentPhase: 'JOINING' | 'CARD' | 'BETTING' | 'DICE' | 'SHOWDOWN';
  turnIndex: number;
  dealerIndex: number;
  currentBet: number;
  bettingLapComplete?: boolean;
  lastDiceRoll: [number, number] | null;
  winnerId: string | null;
  logs: string[];
  messages: ChatMessage[];
}

export const createDeck = (): Card[] => {
  const deck: Card[] = [];
  let id = 0;
  const suits = [CardSuit.CIRCLE, CardSuit.TRIANGLE, CardSuit.SQUARE];

  // 30 positive cards (1-10, 3 each - one for each suit)
  for (let v = 1; v <= 10; v++) {
    for (const suit of suits) {
      deck.push({ id: `c-${id++}`, value: v, type: CardType.POSITIVE, suit });
    }
  }

  // 30 negative cards (-1 to -10, 3 each - one for each suit)
  for (let v = 1; v <= 10; v++) {
    for (const suit of suits) {
      deck.push({ id: `c-${id++}`, value: -v, type: CardType.NEGATIVE, suit });
    }
  }

  // 2 Sylops (0)
  deck.push({ id: `c-${id++}`, value: 0, type: CardType.SYLOP, suit: CardSuit.NONE });
  deck.push({ id: `c-${id++}`, value: 0, type: CardType.SYLOP, suit: CardSuit.NONE });

  return deck;
};

export const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const getCounts = (hand: Card[]) => {
  const counts: Record<number, number> = {};
  hand.forEach(c => {
    const absVal = Math.abs(c.value);
    counts[absVal] = (counts[absVal] || 0) + 1;
  });
  return counts;
};

const hasPairs = (counts: Record<number, number>) => Object.values(counts).filter(v => v >= 2).length;
const hasThreeOfAKind = (counts: Record<number, number>) => Object.values(counts).some(v => v >= 3);
const hasFourOfAKind = (counts: Record<number, number>) => Object.values(counts).some(v => v >= 4);

const hasStraight = (hand: Card[], length: number) => {
  const values = Array.from(new Set(hand.map(c => Math.abs(c.value)))).sort((a, b) => a - b);
  if (values.length < length) return false;
  let count = 1;
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1] + 1) {
      count++;
      if (count >= length) return true;
    } else {
      count = 1;
    }
  }
  return false;
};

const isGeeWhiz = (hand: Card[]) => {
  const vals = hand.map(c => c.value).sort((a, b) => a - b);
  const set1 = [1, 2, 3, 4, -10];
  const set2 = [-4, -3, -2, -1, 10];
  const check = (s: number[]) => s.every(v => vals.includes(v));
  return check(set1) || check(set2);
};

export const evaluateHand = (hand: Card[]) => {
  const sum = hand.reduce((acc, card) => acc + card.value, 0);
  const absSum = Math.abs(sum);
  const sylopCount = hand.filter(c => c.type === CardType.SYLOP).length;
  const nonSylops = hand.filter(c => c.type !== CardType.SYLOP);
  const counts = getCounts(nonSylops);
  
  let rankScore = 0;
  let rankName = "";

  if (sum === 0) {
    if (sylopCount === 2) {
      rankScore = 1000;
      rankName = "Pure Sabacc";
    } else if (sylopCount === 1 && counts[10] === 4) {
      rankScore = 900;
      rankName = "Full Sabacc";
    } else if (sylopCount === 1 && hasFourOfAKind(counts)) {
      rankScore = 800;
      rankName = "Fleet";
    } else if (sylopCount === 1 && hasPairs(counts) >= 1) {
      rankScore = 700;
      rankName = "Yee-Haa";
    } else if (hasThreeOfAKind(counts) && hasPairs(counts) >= 2) {
      rankScore = 600;
      rankName = "Rhylet";
    } else if (hasFourOfAKind(counts)) {
      rankScore = 500;
      rankName = "Squadron";
    } else if (isGeeWhiz(nonSylops)) {
      rankScore = 450;
      rankName = "Gee Whiz";
    } else if (hasStraight(nonSylops, 4)) {
      rankScore = 400;
      rankName = "Straight Khyron";
    } else if (hasThreeOfAKind(counts)) {
      rankScore = 200;
      rankName = "Banthas Wild";
    } else if (hasPairs(counts) >= 2) {
      rankScore = 100;
      rankName = "Rule of Two";
    } else if (hasPairs(counts) >= 1) {
      rankScore = 50;
      rankName = "Sabacc (Pair)";
    } else {
      rankScore = 10;
      rankName = "Sabacc";
    }
  } else {
    rankScore = 0;
    rankName = `Nulrhek (${sum})`;
  }

  // Tie-breakers
  const mostCards = hand.length;
  const positiveSum = hand.filter(c => c.value > 0).reduce((acc, c) => acc + c.value, 0);
  const highestPositiveCard = Math.max(0, ...hand.filter(c => c.value > 0).map(c => c.value));
  const highestSuit = Math.max(0, ...hand.filter(c => c.value === highestPositiveCard).map(c => {
    if (c.suit === CardSuit.CIRCLE) return 3;
    if (c.suit === CardSuit.TRIANGLE) return 2;
    if (c.suit === CardSuit.SQUARE) return 1;
    return 0;
  }));

  // Final score calculation for sorting
  // Rank is primary.
  // For Nulrhek (rankScore 0), absSum is secondary (lower is better).
  // Then Positive beats Negative.
  // Then Most Cards.
  // Then Positive Sum.
  // Then Highest Positive Card.
  // Then Highest Suit.
  
  let finalScore = rankScore * 1000000;
  if (rankScore === 0) {
    finalScore += (100 - absSum) * 10000;
    if (sum > 0) finalScore += 5000; // Positive beats negative
  }
  
  finalScore += mostCards * 100;
  finalScore += positiveSum * 10;
  finalScore += highestPositiveCard;
  finalScore += highestSuit * 0.1;

  return { sum, absSum, score: finalScore, rankName };
};
