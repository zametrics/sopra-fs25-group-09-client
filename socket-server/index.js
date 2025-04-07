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

// Store lobby data
const lobbies = new Map(); // Map<lobbyId, Set<socketId>>

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Handle lobby joining
  socket.on('joinLobby', (lobbyId) => {
    socket.join(lobbyId);
    console.log(`User ${socket.id} joined lobby ${lobbyId}`);

    // Add player to lobby tracking
    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Set());
    }
    const lobbyPlayers = lobbies.get(lobbyId);
    lobbyPlayers.add(socket.id);

    // Emit 'playerJoined' event with new player data
    const newPlayer = {
      id: socket.id, // Using socket.id as a temporary ID
      username: `Player_${socket.id.slice(0, 4)}`, // Temporary username
    };
    io.to(lobbyId).emit('playerJoined', newPlayer);


    console.log(`Lobby ${lobbyId} players:`, Array.from(lobbyPlayers));
  });

  // Handle chat messages
  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    const timestamp = new Date().toISOString();
    const validatedUsername = username || `Player_${socket.id.slice(0, 4)}`;
    const chatMessage = { username: validatedUsername, message, timestamp };
    io.to(lobbyId).emit('chatMessage', chatMessage);
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    for (const [lobbyId, players] of lobbies) {
      if (players.has(socket.id)) {
        players.delete(socket.id);
        io.to(lobbyId).emit('playerLeft', {
          id: socket.id,
          username: `Player_${socket.id.slice(0, 4)}`,
        });
        if (players.size === 0) lobbies.delete(lobbyId);
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running at http://localhost:${PORT}`);
});