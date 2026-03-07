import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
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
const app = next({ dev });
const handle = app.getRequestHandler();

const port = 3000;

app.prepare().then(() => {
  const expressApp = express();
  const server = createServer(expressApp);
  const io = new Server(server);

  const games: Record<string, GameState> = {};

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', ({ roomId, playerName, startingCredits, isSpectator }) => {
      socket.join(roomId);
      // @ts-ignore
      socket.roomId = roomId;
      
      if (!games[roomId]) {
        games[roomId] = {
          roomId,
          players: [],
          deck: shuffle(createDeck()),
          discardPile: [],
          handPot: 0,
          sabaccPot: 0,
          currentRound: 1,
          currentPhase: 'JOINING',
          turnIndex: 0,
          dealerIndex: 0,
          currentBet: 0,
          lastDiceRoll: null,
          winnerId: null,
          logs: [`Room ${roomId} created.`],
          messages: []
        };
      }

      const game = games[roomId];
      const playerNameLower = playerName?.trim().toLowerCase();
      const existingPlayerIndex = game.players.findIndex(p => p.name.trim().toLowerCase() === playerNameLower);
      
      if (existingPlayerIndex !== -1) {
        game.players[existingPlayerIndex].id = socket.id;
        // Update spectator status if re-joining with a specific preference
        if (isSpectator !== undefined) {
          game.players[existingPlayerIndex].isSpectator = !!isSpectator;
          game.players[existingPlayerIndex].isFolded = !!isSpectator || (game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN');
        }
        game.logs.push(`${game.players[existingPlayerIndex].name} reconnected.`);
      } else {
        const isMidGame = game.currentPhase !== 'JOINING' && game.currentPhase !== 'SHOWDOWN';
        game.players.push({
          id: socket.id,
          name: playerName || `Player ${game.players.length + 1}`,
          hand: [],
          credits: parseInt(startingCredits) || 1000,
          isFolded: !!isSpectator || isMidGame,
          isReady: !!isSpectator,
          betThisRound: 0,
          isSpectator: !!isSpectator
        });
        game.logs.push(`${playerName} joined the room${isSpectator ? ' as a spectator' : (isMidGame ? ' (waiting for next game)' : '')}.`);
      }

      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('toggleSpectator', ({ roomId }) => {
      const game = games[roomId];
      if (!game) return;

      const player = game.players.find(p => p.id === socket.id);
      if (player) {
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

    socket.on('ready', ({ roomId }) => {
      const game = games[roomId];
      if (!game) return;

      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        // Enforce ante check (15 CR)
        if (!player.isSpectator && player.credits < 15) {
          game.logs.push(`${player.name} needs at least 15 CR to play.`);
          io.to(roomId).emit('gameStateUpdate', game);
          return;
        }
        player.isReady = true;
        game.logs.push(`${player.name} is ready.`);
      }

      // Start game if all ready and at least 2 non-spectator players
      const activePlayers = game.players.filter(p => !p.isSpectator);
      if (activePlayers.length >= 2 && game.players.every(p => p.isReady)) {
        startGame(game);
      }

      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('addAI', ({ roomId }) => {
      const game = games[roomId];
      if (!game || game.currentPhase !== 'JOINING') return;
      if (game.players.length >= 6) return; // Max players

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
      if (game.players.length >= 2 && game.players.every(p => p.isReady)) {
        startGame(game);
        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('removeAI', ({ roomId, aiId }) => {
      const game = games[roomId];
      if (!game || game.currentPhase !== 'JOINING') return;

      const index = game.players.findIndex(p => p.id === aiId && p.isAI);
      if (index !== -1) {
        const [removed] = game.players.splice(index, 1);
        game.logs.push(`${removed.name} left the room.`);
        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('addCredits', ({ roomId, amount }) => {
      const game = games[roomId];
      if (!game) return;
      const player = game.players.find(p => p.id === socket.id);
      if (player) {
        player.credits += amount;
        game.logs.push(`${player.name} added ${amount} credits.`);
        io.to(roomId).emit('gameStateUpdate', game);
      }
    });

    socket.on('cardAction', ({ roomId, action, cardId }) => {
      const game = games[roomId];
      if (!game || game.currentPhase !== 'CARD') return;
      
      const currentPlayer = game.players[game.turnIndex];
      if (currentPlayer.id !== socket.id) return;

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

    socket.on('betAction', ({ roomId, action, amount }) => {
      const game = games[roomId];
      if (!game || game.currentPhase !== 'BETTING') return;

      const currentPlayer = game.players[game.turnIndex];
      if (currentPlayer.id !== socket.id) return;

      const betAmount = parseInt(amount) || 0;

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

    socket.on('chatMessage', ({ roomId, text }) => {
      const game = games[roomId];
      if (!game) return;
      
      const player = game.players.find(p => p.id === socket.id);
      if (!player) return;
      
      game.messages.push({
        sender: player.name,
        text,
        timestamp: Date.now()
      });
      
      if (game.messages.length > 50) game.messages.shift();
      
      io.to(roomId).emit('gameStateUpdate', game);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
      // @ts-ignore
      const roomId = socket.roomId;
      if (roomId && games[roomId]) {
        const game = games[roomId];
        const index = game.players.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          const player = game.players[index];
          // If game is in JOINING phase, remove them. 
          if (game.currentPhase === 'JOINING') {
            game.players.splice(index, 1);
            game.logs.push(`${player.name} left the room.`);
          } else {
            game.logs.push(`${player.name} lost connection.`);
            // We keep them in the game so they can reconnect by name
          }

          // Clean up room if no human players left (with a small delay to allow for refreshes)
          const humanPlayers = game.players.filter(p => !p.isAI);
          if (humanPlayers.length === 0) {
            setTimeout(() => {
              // Re-check if it's still empty after the delay
              if (games[roomId]) {
                const stillNoHumans = games[roomId].players.filter(p => !p.isAI).length === 0;
                if (stillNoHumans) {
                  console.log(`Cleaning up empty room: ${roomId}`);
                  delete games[roomId];
                }
              }
            }, 5000); // 5 second grace period
          } else {
            io.to(roomId).emit('gameStateUpdate', game);
          }
        }
      }
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
            currentPlayer.credits -= callAmount;
            currentPlayer.betThisRound += callAmount;
            game.handPot += callAmount;
            game.logs.push(`${currentPlayer.name} called.`);
          }
        } else {
          currentPlayer.credits -= callAmount;
          currentPlayer.betThisRound += callAmount;
          game.handPot += callAmount;
          game.logs.push(`${currentPlayer.name} called.`);
        }
      } else if (absSum <= 5) {
        // Decent hand: Call
        if (callAmount <= 50) {
          currentPlayer.credits -= callAmount;
          currentPlayer.betThisRound += callAmount;
          game.handPot += callAmount;
          game.logs.push(`${currentPlayer.name} called.`);
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
          currentPlayer.credits -= callAmount;
          currentPlayer.betThisRound += callAmount;
          game.handPot += callAmount;
          game.logs.push(`${currentPlayer.name} called.`);
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

    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    while (game.players[game.turnIndex].isFolded || game.players[game.turnIndex].isSpectator) {
      game.turnIndex = (game.turnIndex + 1) % game.players.length;
    }

    // Phase transition logic
    if (game.turnIndex === 0) {
      if (game.currentPhase === 'CARD') {
        game.currentPhase = 'BETTING';
        game.currentBet = 0;
        game.players.forEach(p => p.betThisRound = 0);
        game.logs.push("Betting Phase started.");
      } else if (game.currentPhase === 'BETTING') {
        // Check if all active players have matched the current bet
        const allMatched = activePlayers.every(p => p.betThisRound === game.currentBet);
        if (allMatched) {
          game.currentPhase = 'DICE';
          handleDicePhase(game);
        } else {
          game.logs.push("Waiting for all bets to be matched.");
        }
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
        game.logs.push(`Round ${game.currentRound} Card Phase started.`);
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
      winner.credits += game.sabaccPot;
      game.sabaccPot = 0;
      game.logs.push(`${winner.name} takes the Sabacc Pot!`);
    }
    game.handPot = 0;
    
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

  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
