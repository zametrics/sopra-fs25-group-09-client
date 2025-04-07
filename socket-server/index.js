const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  path: '/api/socket',
  cors: {
    origin: '*', // Replace with your Vercel URL in production
    methods: ['GET', 'POST'],
  },
});

// Store lobby data: Map<lobbyId, Map<userId, { socketId, username }>>
const lobbies = new Map();

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('joinLobby', ({ lobbyId, userId, username }) => {
    socket.join(lobbyId);
    console.log(`User ${userId} (${username}) with socket ${socket.id} joined lobby ${lobbyId}`);

    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Map());
    }
    const lobbyPlayers = lobbies.get(lobbyId);
    lobbyPlayers.set(userId, { socketId: socket.id, username });

    const newPlayer = {
      id: userId,
      username: username || `Player_${userId}`,
    };
    io.to(lobbyId).emit('playerJoined', newPlayer);

    console.log(`Lobby ${lobbyId} players:`, Array.from(lobbyPlayers.entries()));
  });

  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    const timestamp = new Date().toISOString();
    const validatedUsername = username || 'Anonymous';
    const chatMessage = { username: validatedUsername, message, timestamp };
    io.to(lobbyId).emit('chatMessage', chatMessage);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const [lobbyId, players] of lobbies) {
      for (const [userId, playerData] of players) {
        if (playerData.socketId === socket.id) {
          players.delete(userId);
          io.to(lobbyId).emit('playerLeft', {
            id: userId,
            username: playerData.username,
          });
          if (players.size === 0) lobbies.delete(lobbyId);
          break;
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});