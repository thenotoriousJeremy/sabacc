import { createDeck, evaluateHand, CardType, CardSuit, Card } from '../lib/game-logic';

const testHands = () => {
  console.log("Starting Sabacc Hand Evaluation Tests...");

  const pureSabacc: Card[] = [
    { id: '1', value: 0, type: CardType.SYLOP, suit: CardSuit.NONE },
    { id: '2', value: 0, type: CardType.SYLOP, suit: CardSuit.NONE },
  ];
  console.log("Pure Sabacc:", evaluateHand(pureSabacc).rankName === "Pure Sabacc" ? "PASS" : "FAIL");

  const squadron: Card[] = [
    { id: '1', value: 5, type: CardType.POSITIVE, suit: CardSuit.CIRCLE },
    { id: '2', value: 5, type: CardType.POSITIVE, suit: CardSuit.TRIANGLE },
    { id: '3', value: -5, type: CardType.NEGATIVE, suit: CardSuit.CIRCLE },
    { id: '4', value: -5, type: CardType.NEGATIVE, suit: CardSuit.TRIANGLE },
  ];
  console.log("Squadron:", evaluateHand(squadron).rankName === "Squadron" ? "PASS" : "FAIL");

  const geeWhiz: Card[] = [
    { id: '1', value: 1, type: CardType.POSITIVE, suit: CardSuit.CIRCLE },
    { id: '2', value: 2, type: CardType.POSITIVE, suit: CardSuit.TRIANGLE },
    { id: '3', value: 3, type: CardType.POSITIVE, suit: CardSuit.SQUARE },
    { id: '4', value: 4, type: CardType.POSITIVE, suit: CardSuit.CIRCLE },
    { id: '5', value: -10, type: CardType.NEGATIVE, suit: CardSuit.CIRCLE },
  ];
  console.log("Gee Whiz:", evaluateHand(geeWhiz).rankName === "Gee Whiz" ? "PASS" : "FAIL");

  const nulrhek: Card[] = [
    { id: '1', value: 5, type: CardType.POSITIVE, suit: CardSuit.CIRCLE },
    { id: '2', value: -2, type: CardType.NEGATIVE, suit: CardSuit.TRIANGLE },
  ];
  console.log("Nulrhek (3):", evaluateHand(nulrhek).sum === 3 ? "PASS" : "FAIL");

  console.log("Tests Complete.");
};

testHands();
