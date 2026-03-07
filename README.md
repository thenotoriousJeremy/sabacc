# Corellian Spike Sabacc

A multiplayer web-based version of the 'Corellian Spike' Sabacc game.

## Features
- **Multiplayer**: Real-time gameplay using Socket.io.
- **Deck Logic**: 62-card deck (30 positive, 30 negative, 2 Sylops).
- **Phase Management**: 3 rounds with Card, Betting, and Dice phases.
- **Credit System**: Track credits, handle antes, and update balances.
- **Sabacc Shift**: Spike Dice roll at the end of each round can trigger a hand redeal.
- **Star Wars Aesthetic**: Dark theme with neon accents.

## Deployment

### Local Development
```bash
npm install
npm run dev  # starts tsx server.ts on http://localhost:3000
```

### Docker

#### Build and run locally
```bash
docker build -t sabacc .
docker run -p 3000:3000 sabacc
```

#### Using Docker Compose (Recommended)
```yaml
version: '3.8'

services:
  sabacc:
    image: ghcr.io/thenotoriousjeremy/sabacc:latest
    container_name: sabacc
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TZ=Etc/UTC
    restart: unless-stopped
```

**Notes:**
- The service will be available at `http://localhost:3000`

Start the stack:
```bash
docker-compose up -d
```

View logs:
```bash
docker-compose logs -f sabacc
```

Stop the stack:
```bash
docker-compose down
```

#### GitHub Container Registry (GHCR)
This repository automatically builds and pushes Docker images to GHCR on every push to `main`, `master`, or `releases/**` branches.

Pull and run the latest image manually:
```bash
docker pull ghcr.io/thenotoriousjeremy/sabacc:latest
docker run -p 3000:3000 ghcr.io/thenotoriousjeremy/sabacc:latest
```

### Railway / Render / DigitalOcean
1. **Environment Variables**:
   - `NODE_ENV=production`
   - `PORT=3000`
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start` (runs `tsx server.ts`)

## Game Rules

This implementation follows the **Corellian Spike variant** of Sabacc from Star Wars Legends.

### Hand Rankings (highest to lowest)
1. **Pure Sabacc** - Two Sylops (value 0) = Automatic win
2. **Squadron** - Four cards of same value = Best non-Sabacc hand
3. **Gee Whiz** - Five cards totaling 23
4. **Full House** - Three of a kind + pair
5. **Flush** - Five cards of the same suit
6. **Straight** - Five cards in sequence
7. **Three of a Kind**
8. **Pair**
9. **Nulrhek** - Any other hand; closest to 0 wins

### Deck Composition
- 30 positive cards (values 1-15, 2 of each suit)
- 30 negative cards (values -1 to -15, 2 of each suit)
- 2 Sylops (value 0, rank trump all)
- **Total: 62 cards**

### Gameplay Phases
1. **Card Phase** - Players draw, swap, or stand to improve their hands
2. **Betting Phase** - Players bet credits based on hand strength
3. **Dice Phase** - The Spike Dice is rolled; if triggered, hands are redealt (Sabacc Shift)

### Antes & Pots
- **Hand Pot**: Ante 10 credits + all bets
- **Sabacc Pot**: Fixed 5 credits per player (side pot)
- **Sabacc Winner**: Gets the Sabacc Pot if they win

For more details, see [How to Play - Sabacc](https://hyperspaceprops.com/how-to-play-corellian-spike/).

## How to Play
1. Enter your name and a Room ID.
2. Set your starting credits.
3. Wait for at least one other player to join and set "Ready".
4. Follow the phases:
   - **Card Phase**: Draw, Swap, or Stand.
   - **Betting Phase**: Call, Raise, or Fold.
   - **Dice Phase**: Watch the Spike Dice roll!
5. After 3 rounds, the winner is determined by the hand hierarchy.
