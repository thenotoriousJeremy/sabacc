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

### Railway / Render / DigitalOcean
1. **Environment Variables**:
   - `NODE_ENV=production`
   - `PORT=3000`
2. **Build Command**: `npm run build`
3. **Start Command**: `npm start` (runs `node server.ts`)

### Vercel
Note: Vercel's Serverless Functions do not support long-lived WebSocket connections natively. For Vercel deployment, you would typically need to use a separate backend for Socket.io (like a dedicated Node.js server on Railway) or a service like Pusher/Ably.

However, if using a custom server like this one, it is best deployed on a platform that supports persistent processes (Railway, Render, Fly.io, etc.).

## How to Play
1. Enter your name and a Room ID.
2. Set your starting credits.
3. Wait for at least one other player to join and set "Ready".
4. Follow the phases:
   - **Card Phase**: Draw, Swap, or Stand.
   - **Betting Phase**: Call, Raise, or Fold.
   - **Dice Phase**: Watch the Spike Dice roll!
5. After 3 rounds, the winner is determined by the hand hierarchy.
