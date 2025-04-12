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

// Mock function to fetch username from a database (replace with actual implementation)
const fetchUsernameFromDB = async (userId) => {
  // Example: Query your database or authentication system
  // For demo purposes, return a mock username
  return `User_${userId}`; // Replace with actual DB query, e.g., await db.users.findById(userId).username
};

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('joinLobby', async ({ lobbyId, userId, username }) => {
    socket.join(lobbyId);
    console.log(`User ${userId} (${username}) with socket ${socket.id} joined lobby ${lobbyId}`);

    // Validate username
    let validatedUsername = username;
    if (!username || username === 'unknown' || username.trim() === '') {
      // Fetch username from database or use fallback
      validatedUsername = await fetchUsernameFromDB(userId).catch(() => `Guest_${userId}`);
    }

    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Map());
    }
    const lobbyPlayers = lobbies.get(lobbyId);

    // Update or add player
    lobbyPlayers.set(userId, { socketId: socket.id, username: validatedUsername });

    const newPlayer = {
      id: userId,
      username: validatedUsername,
    };
    io.to(lobbyId).emit('playerJoined', newPlayer);

    console.log(`Lobby ${lobbyId} players:`, Array.from(lobbyPlayers.entries()));
  });

  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    const timestamp = new Date().toISOString();
    const validatedUsername = username && username !== 'unknown' ? username : 'Guest';
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