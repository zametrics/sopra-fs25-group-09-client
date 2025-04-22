const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
//const fetch = require("node-fetch"); // to fetch draw-time or other data from the database


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

const pendingStateRequests = new Map();

const gameStates = new Map(); // Track game state including current round
const timers = new Map(); // Declare this once globally

// function stopLobbyTimer(lobbyId) {
//   const entry = timers.get(lobbyId);
//   if (entry) {
//     clearInterval(entry.interval);
//     timers.delete(lobbyId);
//   }
// }


io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('gameStarting', ({ lobbyId, settings }) => {
    console.log(`Game starting for lobby ${lobbyId}`);
    // Broadcast to all clients in the lobby, including the sender
    io.to(lobbyId).emit('gameStarting', { lobbyId });
  });


const playerInfo = socketToLobby.get(socket.id);
  if (playerInfo) {
    const { lobbyId } = playerInfo;
    const entry = timers.get(lobbyId);
    if (entry) {
      socket.emit("timerUpdate", entry.time);
    }
  }
  
  socket.on("startTimer", async ({ lobbyId, drawTime }) => {
    console.log(`Start timer for lobby ${lobbyId} with drawTime: ${drawTime}s`);
    
    if (timers.has(lobbyId)) {
      console.log(`⏱️ Timer already running for lobby ${lobbyId}`);
      return;
    }
  
    // Initialize or get game state for this lobby
    if (!gameStates.has(lobbyId)) {
      // Get numOfRounds from your lobby data
      const lobby = lobbies.get(lobbyId);
      const lobbyOwnerSocket = [...lobby.values()].find(player => player.isOwner)?.socketId;
      
      // Initialize game state
      gameStates.set(lobbyId, {
        currentRound: 1,
        numOfRounds: 5, // Default value
        drawTime: drawTime
      });
      
      // Emit initial game state
      io.to(lobbyId).emit("gameUpdate", {
        currentRound: 1,
        numOfRounds: 5 // Replace with actual lobby.numOfRounds when available
      });
    }
    
    let gameState = gameStates.get(lobbyId);
    let time = drawTime || 60; // Use provided drawTime or default to 60
    
    const interval = setInterval(() => {
      time--;
      //console.log(`⏱️ Lobby ${lobbyId} timer: ${time}`);
      io.to(lobbyId).emit("timerUpdate", time);
  
      if (time <= 0) {
        console.log(`🔁 Timer reached 0 for lobby ${lobbyId}`);
        
        // Update round
        if (gameState.currentRound < gameState.numOfRounds) {
          gameState.currentRound++;
          gameStates.set(lobbyId, gameState);
          
          // Emit round update
          io.to(lobbyId).emit("gameUpdate", {
            currentRound: gameState.currentRound,
            numOfRounds: gameState.numOfRounds
          });
          
          // Reset timer for next round
          time = drawTime;
          io.to(lobbyId).emit("roundEnded");
        } else {
          // Game over - all rounds completed
          clearInterval(interval);
          timers.delete(lobbyId);
          gameStates.delete(lobbyId);
          
          io.to(lobbyId).emit("gameEnded");
        }
      }
    }, 1000);
  
    timers.set(lobbyId, { time, interval });
  });

  
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

  const timerEntry = timers.get(lobbyId);
  if (timerEntry) {
    socket.emit("timerUpdate", timerEntry.time);
  }


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

  // --- NEW: Handle request for initial state ---
  socket.on('request-initial-state', () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
         console.warn(`Received request-initial-state from socket ${socket.id} with no lobby info.`);
         return;
    }
    const { lobbyId, userId: requesterId } = playerInfo;
    const lobby = lobbies.get(lobbyId);

    if (!lobby || lobby.size <= 1) {
        console.log(`Lobby ${lobbyId} has only 1 player, no state to request.`);
        return; // No one else to ask
    }

    // Store requester info temporarily
    pendingStateRequests.set(requesterId, socket.id);
    console.log(`Stored pending state request for ${requesterId} [${socket.id}]`);

    // Broadcast request to OTHERS in the lobby
    console.log(`Broadcasting 'get-canvas-state' to lobby ${lobbyId} for requester ${requesterId}`);
    socket.to(lobbyId).emit('get-canvas-state', { requesterId: requesterId });

    // Optional: Add a timeout to clear the pending request if no one responds
    setTimeout(() => {
        if (pendingStateRequests.has(requesterId)) {
            console.log(`State request for ${requesterId} timed out.`);
            pendingStateRequests.delete(requesterId);
        }
    }, 10000); // 10 second timeout
});

// --- NEW: Handle receiving state from existing client ---
socket.on('send-canvas-state', (data) => { // Expects { targetUserId, dataUrl }
    const senderInfo = socketToLobby.get(socket.id); // Optional: Log who sent it
    const senderUserId = senderInfo?.userId || 'Unknown';

    // Basic Validation
    if (!data || typeof data.targetUserId !== 'string' || typeof data.dataUrl !== 'string' || !data.dataUrl.startsWith('data:image/')) {
        console.error(`Received invalid send-canvas-state data from ${senderUserId}:`, data);
        return;
    }

    // Check if there's a pending request for this targetUserId
    if (pendingStateRequests.has(data.targetUserId)) {
        const targetSocketId = pendingStateRequests.get(data.targetUserId);

        console.log(`Received canvas state from ${senderUserId} for ${data.targetUserId}. Forwarding to ${targetSocketId}.`);

        // Send the state DIRECTLY to the original requester's socket
        io.to(targetSocketId).emit('load-canvas-state', { dataUrl: data.dataUrl });

        // CRITICAL: Remove the pending request immediately after fulfilling it
        pendingStateRequests.delete(data.targetUserId);
         console.log(`Removed pending state request for ${data.targetUserId}.`);

    } else {
        // Ignore if no pending request (already fulfilled or timed out)
         console.log(`Ignoring received canvas state from ${senderUserId} for ${data.targetUserId} (no pending request found).`);
    }
});


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

  // --- NEW: Handler for Fill Area ---
  socket.on('fill-area', (data) => { // data should be FillAreaData { x, y, color }
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
        console.warn(`Received fill-area from socket ${socket.id} not in a lobby.`);
        return;
    }
    const { lobbyId, userId } = playerInfo;

    // Basic Validation
    if (!data || typeof data.x !== 'number' || typeof data.y !== 'number' || typeof data.color !== 'string') {
        console.error(`Received invalid fill-area data from ${userId}:`, data);
        return;
    }
    // Optional: Add bounds checking for x, y based on expected canvas size if known

    // Relay the fill command (with userId) to others in the lobby
    const dataToSend = {
        x: data.x,
        y: data.y,
        color: data.color,
        userId: userId
    };

    // console.log(`Relaying fill-area from ${userId} to lobby ${lobbyId}: x=${data.x}, y=${data.y}, color=${data.color}`); // Debug
    socket.to(lobbyId).emit('fill-area', dataToSend);
  });

  // --- NEW: Handler for Sync Request after Undo ---
  socket.on('sync-request', (data) => { // Expects { dataUrl: string }
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
        console.warn(`Received sync-request from socket ${socket.id} not in a lobby.`);
        return;
    }
    const { lobbyId, userId } = playerInfo;

    // Basic Validation
    if (!data || typeof data.dataUrl !== 'string' || !data.dataUrl.startsWith('data:image/')) {
        console.error(`Received invalid sync-request data from ${userId}:`, data);
        return;
    }

    // Relay the sync command (with userId and dataUrl) to OTHERS in the lobby
    const dataToSend = {
        userId: userId,
        dataUrl: data.dataUrl
    };

    // console.log(`Relaying sync-canvas from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit('sync-canvas', dataToSend);
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});