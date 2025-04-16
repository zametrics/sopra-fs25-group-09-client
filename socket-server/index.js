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

const lobbies = new Map(); // Map<lobbyId, Map<userId, { socketId, username }>>
const socketToLobby = new Map(); // Map<socketId, { lobbyId, userId }>

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

socket.on('joinLobby', ({ lobbyId, userId, username }) => {
  if (!lobbies.has(lobbyId)) {
    lobbies.set(lobbyId, new Map());
  }
  const lobby = lobbies.get(lobbyId);

  // Check if player was already in the lobby
  const wasPlayerPresent = lobby.has(userId);

  // Remove existing player (deduplicate)
  lobby.delete(userId);

  // Add player to lobby
  lobby.set(userId, { socketId: socket.id, username });

  // Update socket-to-lobby mapping
  socketToLobby.set(socket.id, { lobbyId, userId });

  // Join socket to lobby room
  socket.join(lobbyId);

  console.log(`User ${userId} (${username}) with socket ${socket.id} joined lobby ${lobbyId}`);
  console.log(`Lobby ${lobbyId} players:`, Array.from(lobby.entries()));

  // Only emit playerJoined if the player wasn't already in the lobby
  if (!wasPlayerPresent) {
    io.to(lobbyId).emit('playerJoined', {
      id: userId,
      username,
    });
  }

  // Always send full lobby state to the joining client
  socket.emit('lobbyState', {
    players: Array.from(lobby.entries()).map(([id, data]) => ({
      id,
      username: data.username,
    })),
  });
});

  socket.on('leaveLobby', ({ lobbyId, userId }) => {
    const lobby = lobbies.get(lobbyId);
    if (lobby && lobby.has(userId)) {
      const playerData = lobby.get(userId);
      lobby.delete(userId);
      io.to(lobbyId).emit('playerLeft', {
        id: userId,
        username: playerData.username,
      });
      if (lobby.size === 0) lobbies.delete(lobbyId);
      socketToLobby.delete(socket.id); // Clear mapping
      socket.leave(lobbyId);
      console.log(`User ${userId} left lobby ${lobbyId}`);
    }
  });

  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    io.to(lobbyId).emit('chatMessage', {
      username,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const playerInfo = socketToLobby.get(socket.id);

    if (playerInfo) {
      const { lobbyId, userId } = playerInfo;
      const lobby = lobbies.get(lobbyId);
      if (lobby && lobby.has(userId)) {
        const currentPlayerData = lobby.get(userId);

        // Only act if the socket that disconnected is the *currently active* socket for this user
        if (currentPlayerData.socketId === socket.id) {
          console.log(`Player ${userId} (${currentPlayerData.username}) truly disconnected with socket ${socket.id}. Removing.`);
          lobby.delete(userId); // Remove the user from the lobby map

          // Notify others
          io.to(lobbyId).emit('playerLeft', {
            id: userId,
            username: currentPlayerData.username, // Use the username we just retrieved
          });

          // Clean up lobby if empty
          if (lobby.size === 0) {
            console.log(`Lobby ${lobbyId} is now empty. Deleting.`);
            lobbies.delete(lobbyId);
          }
        } else {
          // This socket disconnected, but the user has already reconnected with a different socket.
          // Do not remove the user from the lobby or emit playerLeft.
          console.log(`Player ${userId} disconnected with old socket ${socket.id}, but has already reconnected with socket ${currentPlayerData.socketId}. Ignoring.`);
        }
      }

      // Always remove the disconnected socket ID from the lookup map
      socketToLobby.delete(socket.id);
    } else {
        console.log(`Socket ${socket.id} disconnected but had no lobby/user info.`);
    }
  });

  
  //implementation of drawing board

  socket.on('draw-line-batch', (data) => { // data is DrawBatchEmitData
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
        console.warn(`Received draw batch from socket ${socket.id} not in a lobby.`);
        return;
    }
    const { lobbyId, userId } = playerInfo; // Get userId here

    // Basic validation (optional but recommended)
    if (!data || !Array.isArray(data.points) || typeof data.color !== 'string' || typeof data.brushSize !== 'number') {
        console.error("Received invalid draw-line-batch data from socket:", socket.id);
        return;
    }
    // Ensure points array is not empty before proceeding (avoids potential errors)
    if (data.points.length === 0) {
        // console.log(`Ignoring empty draw batch from ${userId} in lobby ${lobbyId}`); // Optional debug
        return;
    }

    // --- MODIFICATION: Add userId to the relayed data ---
    const dataToSend = {
        ...data,
        userId: userId // Add the drawer's ID
    };

    // Relay the batch (with userId) to other players in the same lobby
    // socket.to(lobbyId) EXCLUDES the sender socket.id
    // console.log(`Relaying batch from ${userId} (${data.points.length} points) to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit('draw-line-batch', dataToSend);
  });

  // --- Handler for Draw End ---
  socket.on('draw-end', () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
        console.warn(`Received draw-end from socket ${socket.id} not in a lobby.`);
        return;
    }
    const { lobbyId, userId } = playerInfo;

    // Relay the end signal with the user ID to others in the lobby
    // console.log(`Relaying draw-end from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit('draw-end', { userId: userId });
  });

  // --- Handler for Clear ---
  socket.on('clear', () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) return;
    const { lobbyId, userId } = playerInfo;
    const dataToSend = { userId: userId };
    // console.log(`Relaying clear from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit('clear', dataToSend);
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});