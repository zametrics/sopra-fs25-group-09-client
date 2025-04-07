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
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Store lobby data: Map<lobbyId, Map<userId, socketId>>
const lobbies = new Map();

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Handle lobby joining with userId
  socket.on('joinLobby', ({ lobbyId, userId }) => {
    socket.join(lobbyId);
    console.log(`User ${userId} with socket ${socket.id} joined lobby ${lobbyId}`);

    // Initialize lobby if it doesn't exist
    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Map());
    }
    const lobbyPlayers = lobbies.get(lobbyId);
    lobbyPlayers.set(userId, socket.id); // Map userId to socketId

    // Emit 'playerJoined' event with real player data
    const newPlayer = {
      id: userId, // Use the real user ID
      username: `Player_${userId}`, // Temporary username; ideally fetch from API or client
    };
    io.to(lobbyId).emit('playerJoined', newPlayer);

    console.log(`Lobby ${lobbyId} players:`, Array.from(lobbyPlayers.entries()));
  });

  // Handle chat messages
  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    const timestamp = new Date().toISOString();
    const validatedUsername = username || 'Anonymous';
    const chatMessage = { username: validatedUsername, message, timestamp };
    io.to(lobbyId).emit('chatMessage', chatMessage);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const [lobbyId, players] of lobbies) {
      for (const [userId, socketId] of players) {
        if (socketId === socket.id) {
          players.delete(userId);
          io.to(lobbyId).emit('playerLeft', {
            id: userId,
            username: `Player_${userId}`,
          });
          if (players.size === 0) lobbies.delete(lobbyId);
          break;
        }
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running at http://localhost:${PORT}`);
});