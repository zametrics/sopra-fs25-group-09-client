const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// --- Load Environment Variables ---
require("dotenv").config();

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  path: "/api/socket",
  cors: {
    origin: "*", // Replace with your Vercel URL in production
    methods: ["GET", "POST"],
  },
});

const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:8080"; // Fallback

const lobbies = new Map(); // Map<lobbyId, Map<userId, { socketId, username }>>
const socketToLobby = new Map(); // Map<socketId, { lobbyId, userId }>

const pendingStateRequests = new Map();

const gameStates = new Map(); // Track game state including current round
const timers = new Map(); // Declare this once globally

const pendingDisconnects = new Map();
const LEAVE_DELAY = 5000; // 10 seconds in milliseconds

// function stopLobbyTimer(lobbyId) {
//   const entry = timers.get(lobbyId);
//   if (entry) {
//     clearInterval(entry.interval);
//     timers.delete(lobbyId);
//   }
// }

// --- NEW: Database Interaction Function ---
async function removePlayerFromDb(lobbyId, userId) {
  const fetch = (await import("node-fetch")).default; // Get the default export
  const url = `${BACKEND_API_URL}/lobbies/${lobbyId}/leave?playerId=${userId}`;
  console.log(
    `Attempting to remove player ${userId} from lobby ${lobbyId} via API: PUT ${url}`
  );

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        // Add any other necessary headers like Authorization if needed
      },
      body: JSON.stringify({}), // Sending empty object as per frontend code
    });

    if (!response.ok) {
      // Log error details if the API call fails
      let errorBody = "";
      try {
        errorBody = await response.text(); // Try to get text body for more info
      } catch (e) {
        // Ignore if body parsing fails
      }
      console.error(
        `API Error: Failed to remove player ${userId} from lobby ${lobbyId}. Status: ${response.status} ${response.statusText}. Body: ${errorBody}`
      );
      // Decide if you want to throw an error or just log it
      // throw new Error(`API call failed with status ${response.status}`);
    } else {
      // Handle success (including 204 No Content)
      if (response.status === 204) {
        console.log(
          `API Success: Player ${userId} removed from lobby ${lobbyId} (Status 204 No Content).`
        );
      } else {
        console.log(
          `API Success: Player ${userId} removed from lobby ${lobbyId} (Status ${response.status}).`
        );
      }
    }
    // No need to explicitly return Promise.resolve() in an async function unless needed for specific chaining
  } catch (error) {
    console.error(
      `Network Error: Could not connect to API to remove player ${userId} from lobby ${lobbyId}. URL: ${url}`,
      error
    );
    // Decide how to handle network errors (e.g., retry logic, logging)
    // throw error; // Re-throw if you want calling function to know
  }
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("gameStarting", ({ lobbyId, settings }) => {
    console.log(`Game starting for lobby ${lobbyId}`);
    // Broadcast to all clients in the lobby, including the sender
    io.to(lobbyId).emit("gameStarting", { lobbyId });
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
      //const lobbyOwnerSocket = [...lobby.values()].find(player => player.isOwner)?.socketId;

      // Initialize game state
      gameStates.set(lobbyId, {
        currentRound: 1,
        numOfRounds: 5, // Default value
        drawTime: drawTime,
      });

      // Emit initial game state
      io.to(lobbyId).emit("gameUpdate", {
        currentRound: 1,
        numOfRounds: 5, // Replace with actual lobby.numOfRounds when available
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
            numOfRounds: gameState.numOfRounds,
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

  // --- joinLobby Handler (MODIFIED to clear pending disconnect) ---
  socket.on("joinLobby", ({ lobbyId, userId, username }) => {
    // --- Check and Clear Pending Disconnect ---
    const lobbyTimeouts = pendingDisconnects.get(lobbyId);
    if (lobbyTimeouts && lobbyTimeouts.has(userId)) {
      const timeoutId = lobbyTimeouts.get(userId);
      clearTimeout(timeoutId);
      lobbyTimeouts.delete(userId);
      // Clean up the lobby map if no more pending disconnects for this lobby
      if (lobbyTimeouts.size === 0) {
        pendingDisconnects.delete(lobbyId);
      }
      console.log(
        `[Join] Cleared pending disconnect timer for user ${userId} in lobby ${lobbyId}`
      );
    }
    // --- End Check ---

    if (!lobbies.has(lobbyId)) {
      lobbies.set(lobbyId, new Map());
    }
    const lobby = lobbies.get(lobbyId);

    // Store previous socket ID if user was present (for logging)
    const previousPlayerData = lobby.get(userId);
    const wasPlayerPresent = !!previousPlayerData;

    // Update player data with the *new* socket ID
    lobby.set(userId, { socketId: socket.id, username });

    // Update socket-to-lobby mapping for the *new* socket
    socketToLobby.set(socket.id, { lobbyId, userId });

    // Join socket to lobby room
    socket.join(lobbyId);

    // Emit current timer state if exists
    const timerEntry = timers.get(lobbyId);
    if (timerEntry) {
      socket.emit("timerUpdate", timerEntry.time);
    }
    // Emit current game state if exists
    const gameState = gameStates.get(lobbyId);
    if (gameState) {
      socket.emit("gameUpdate", gameState);
    }

    console.log(
      `User ${userId} (${username}) with socket ${socket.id} joined lobby ${lobbyId}` +
        (wasPlayerPresent
          ? ` (replaced old socket ${previousPlayerData.socketId})`
          : "")
    );
    console.log(`Lobby ${lobbyId} players:`, Array.from(lobby.keys())); // Log only IDs for brevity

    // Always send full lobby state to the joining client *and* others
    const currentPlayers = Array.from(lobby.entries()).map(([id, data]) => ({
      id,
      username: data.username,
    }));
    // Send to joining client
    socket.emit("lobbyState", { players: currentPlayers });
    // Notify others a player joined/rejoined (can be used to update player list)
    socket.to(lobbyId).emit("playerJoined", { id: userId, username });

    // // Only emit playerJoined if the player wasn't already in the lobby
    // if (!wasPlayerPresent) {
    //   io.to(lobbyId).emit("playerJoined", {
    //     id: userId,
    //     username,
    //   });
    // }

    // // Always send full lobby state to the joining client
    // socket.emit("lobbyState", {
    //   players: Array.from(lobby.entries()).map(([id, data]) => ({
    //     id,
    //     username: data.username,
    //   })),
    // });
  });

  socket.on("leaveLobby", async ({ lobbyId, userId }) => {
    // Added async
    const lobby = lobbies.get(lobbyId);
    if (lobby && lobby.has(userId)) {
      const playerData = lobby.get(userId);

      // Clear pending disconnect timer
      const lobbyTimeouts = pendingDisconnects.get(lobbyId);
      if (lobbyTimeouts && lobbyTimeouts.has(userId)) {
        const timeoutId = lobbyTimeouts.get(userId);
        clearTimeout(timeoutId);
        lobbyTimeouts.delete(userId);
        if (lobbyTimeouts.size === 0) pendingDisconnects.delete(lobbyId);
        console.log(
          `[Manual Leave] Cleared pending disconnect timer for user ${userId}.`
        );
      }

      // Remove from memory
      lobby.delete(userId);
      if (lobby.size === 0) lobbies.delete(lobbyId);
      if (socketToLobby.get(socket.id)?.userId === userId)
        socketToLobby.delete(socket.id);
      socket.leave(lobbyId);

      // Notify clients
      io.to(lobbyId).emit("playerLeft", {
        id: userId,
        username: playerData?.username || "Player",
      });
      console.log(`User ${userId} manually left lobby ${lobbyId} (in-memory).`);

      // --- Remove from Database ---
      await removePlayerFromDb(lobbyId, userId); // Call the API function
    }
  });

  // --- chatMessage Handler (no changes needed) ---
  socket.on("chatMessage", ({ lobbyId, message, username }) => {
    // Basic validation
    if (!lobbyId || typeof message !== "string" || message.trim() === "")
      return;
    const senderInfo = socketToLobby.get(socket.id);
    const senderUsername = username || senderInfo?.username || "Guest"; // Prioritize passed username

    io.to(lobbyId).emit("chatMessage", {
      username: senderUsername,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  // --- disconnect Handler (MODIFIED for delayed removal) ---
  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    const playerInfo = socketToLobby.get(socket.id);

    if (playerInfo) {
      const { lobbyId, userId } = playerInfo;
      const lobby = lobbies.get(lobbyId);
      const currentUserData = lobby ? lobby.get(userId) : null;

      if (currentUserData && currentUserData.socketId === socket.id) {
        console.log(
          `Player ${userId} disconnected (socket ${socket.id}). Starting ${
            LEAVE_DELAY / 1000
          }s leave timer.`
        );

        const timeoutId = setTimeout(async () => {
          // Added async
          console.log(
            `[Timeout] Leave timer expired for user ${userId}. Checking state...`
          );
          const currentLobby = lobbies.get(lobbyId);
          const userDataInLobby = currentLobby
            ? currentLobby.get(userId)
            : null;

          if (userDataInLobby && userDataInLobby.socketId === socket.id) {
            console.log(
              `[Timeout] User ${userId} still disconnected. Removing.`
            );

            // Remove from memory
            currentLobby.delete(userId);
            if (currentLobby.size === 0) {
              lobbies.delete(lobbyId);
              gameStates.delete(lobbyId);
              timers.delete(lobbyId);
            }

            // Notify clients
            io.to(lobbyId).emit("playerLeft", {
              id: userId,
              username: userDataInLobby.username,
            });

            // --- Remove from Database ---
            await removePlayerFromDb(lobbyId, userId); // Call the API function
          } else {
            console.log(
              `[Timeout] User ${userId} reconnected or was removed before timer expired. No DB action needed via timeout.`
            );
          }

          // Clean up pending timer map
          const currentLobbyTimeouts = pendingDisconnects.get(lobbyId);
          if (currentLobbyTimeouts) {
            currentLobbyTimeouts.delete(userId);
            if (currentLobbyTimeouts.size === 0)
              pendingDisconnects.delete(lobbyId);
          }
        }, LEAVE_DELAY);

        if (!pendingDisconnects.has(lobbyId))
          pendingDisconnects.set(lobbyId, new Map());
        pendingDisconnects.get(lobbyId).set(userId, timeoutId);
      } else {
        console.log(
          `Socket ${socket.id} (user ${userId}) disconnected, but was old/already gone. Ignoring disconnect.`
        );
      }
      socketToLobby.delete(socket.id);
    } else {
      console.warn(`Socket ${socket.id} disconnected without lobby/user info.`);
    }
  });

  //implementation of drawing board

  // --- NEW: Handle request for initial state ---
  socket.on("request-initial-state", () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      console.warn(
        `Received request-initial-state from socket ${socket.id} with no lobby info.`
      );
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
    console.log(
      `Stored pending state request for ${requesterId} [${socket.id}]`
    );

    // Broadcast request to OTHERS in the lobby
    console.log(
      `Broadcasting 'get-canvas-state' to lobby ${lobbyId} for requester ${requesterId}`
    );
    socket.to(lobbyId).emit("get-canvas-state", { requesterId: requesterId });

    // Optional: Add a timeout to clear the pending request if no one responds
    setTimeout(() => {
      if (pendingStateRequests.has(requesterId)) {
        console.log(`State request for ${requesterId} timed out.`);
        pendingStateRequests.delete(requesterId);
      }
    }, 10000); // 10 second timeout
  });

  // --- NEW: Handle receiving state from existing client ---
  socket.on("send-canvas-state", (data) => {
    // Expects { targetUserId, dataUrl }
    const senderInfo = socketToLobby.get(socket.id); // Optional: Log who sent it
    const senderUserId = senderInfo?.userId || "Unknown";

    // Basic Validation
    if (
      !data ||
      typeof data.targetUserId !== "string" ||
      typeof data.dataUrl !== "string" ||
      !data.dataUrl.startsWith("data:image/")
    ) {
      console.error(
        `Received invalid send-canvas-state data from ${senderUserId}:`,
        data
      );
      return;
    }

    // Check if there's a pending request for this targetUserId
    if (pendingStateRequests.has(data.targetUserId)) {
      const targetSocketId = pendingStateRequests.get(data.targetUserId);

      console.log(
        `Received canvas state from ${senderUserId} for ${data.targetUserId}. Forwarding to ${targetSocketId}.`
      );

      // Send the state DIRECTLY to the original requester's socket
      io.to(targetSocketId).emit("load-canvas-state", {
        dataUrl: data.dataUrl,
      });

      // CRITICAL: Remove the pending request immediately after fulfilling it
      pendingStateRequests.delete(data.targetUserId);
      console.log(`Removed pending state request for ${data.targetUserId}.`);
    } else {
      // Ignore if no pending request (already fulfilled or timed out)
      console.log(
        `Ignoring received canvas state from ${senderUserId} for ${data.targetUserId} (no pending request found).`
      );
    }
  });

  socket.on("draw-line-batch", (data) => {
    // data is DrawBatchEmitData
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      console.warn(
        `Received draw batch from socket ${socket.id} not in a lobby.`
      );
      return;
    }
    const { lobbyId, userId } = playerInfo; // Get userId here

    // Basic validation (optional but recommended)
    if (
      !data ||
      !Array.isArray(data.points) ||
      typeof data.color !== "string" ||
      typeof data.brushSize !== "number"
    ) {
      console.error(
        "Received invalid draw-line-batch data from socket:",
        socket.id
      );
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
      userId: userId, // Add the drawer's ID
    };

    // Relay the batch (with userId) to other players in the same lobby
    // socket.to(lobbyId) EXCLUDES the sender socket.id
    // console.log(`Relaying batch from ${userId} (${data.points.length} points) to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit("draw-line-batch", dataToSend);
  });

  // --- Handler for Draw End ---
  socket.on("draw-end", () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      console.warn(
        `Received draw-end from socket ${socket.id} not in a lobby.`
      );
      return;
    }
    const { lobbyId, userId } = playerInfo;

    // Relay the end signal with the user ID to others in the lobby
    // console.log(`Relaying draw-end from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit("draw-end", { userId: userId });
  });

  // --- Handler for Clear ---
  socket.on("clear", () => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) return;
    const { lobbyId, userId } = playerInfo;
    const dataToSend = { userId: userId };
    // console.log(`Relaying clear from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit("clear", dataToSend);
  });

  // --- NEW: Handler for Fill Area ---
  socket.on("fill-area", (data) => {
    // data should be FillAreaData { x, y, color }
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      console.warn(
        `Received fill-area from socket ${socket.id} not in a lobby.`
      );
      return;
    }
    const { lobbyId, userId } = playerInfo;

    // Basic Validation
    if (
      !data ||
      typeof data.x !== "number" ||
      typeof data.y !== "number" ||
      typeof data.color !== "string"
    ) {
      console.error(`Received invalid fill-area data from ${userId}:`, data);
      return;
    }
    // Optional: Add bounds checking for x, y based on expected canvas size if known

    // Relay the fill command (with userId) to others in the lobby
    const dataToSend = {
      x: data.x,
      y: data.y,
      color: data.color,
      userId: userId,
    };

    // console.log(`Relaying fill-area from ${userId} to lobby ${lobbyId}: x=${data.x}, y=${data.y}, color=${data.color}`); // Debug
    socket.to(lobbyId).emit("fill-area", dataToSend);
  });

  // --- NEW: Handler for Sync Request after Undo ---
  socket.on("sync-request", (data) => {
    // Expects { dataUrl: string }
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      console.warn(
        `Received sync-request from socket ${socket.id} not in a lobby.`
      );
      return;
    }
    const { lobbyId, userId } = playerInfo;

    // Basic Validation
    if (
      !data ||
      typeof data.dataUrl !== "string" ||
      !data.dataUrl.startsWith("data:image/")
    ) {
      console.error(`Received invalid sync-request data from ${userId}:`, data);
      return;
    }

    // Relay the sync command (with userId and dataUrl) to OTHERS in the lobby
    const dataToSend = {
      userId: userId,
      dataUrl: data.dataUrl,
    };

    // console.log(`Relaying sync-canvas from ${userId} to lobby ${lobbyId}`); // Debug
    socket.to(lobbyId).emit("sync-canvas", dataToSend);
  });

  socket.on("word-selected", (data) => {
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) return;
    const { lobbyId } = playerInfo;
    // Broadcast to others
    socket.to(lobbyId).emit("word-selected", data);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📞 Connecting to Backend API at: ${BACKEND_API_URL}`); // Log API URL
});
