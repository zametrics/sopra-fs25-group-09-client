const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Enable cross-origin requests

const server = http.createServer(app); // Create an HTTP server

// Initialize Socket.IO with the server
const io = new Server(server, {
  path: '/api/socket',  // This is important for correct routing of the Socket.IO connection
  cors: {
    origin: '*',  // Allow connections from any origin (for testing purposes, change in production)
    methods: ['GET', 'POST'],
  },
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('✅ Connected:', socket.id);

  socket.on('joinLobby', (lobbyId) => {
    socket.join(lobbyId);
    console.log(`🔗 User ${socket.id} joined lobby ${lobbyId}`);
  });

  socket.on('chatMessage', ({ lobbyId, message, username }) => {
    const timestamp = new Date().toISOString();
    io.to(lobbyId).emit('chatMessage', { username, message, timestamp });
  });

  socket.on('disconnect', () => {
    console.log('❌ Disconnected:', socket.id);
  });
});

// Start the server on port 3001
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running at http://localhost:${PORT}`);
});
