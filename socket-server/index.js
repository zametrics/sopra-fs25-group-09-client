const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { cursorTo } = require("readline");

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

//https://sopra-fs25-group-09-server.oa.r.appspot.com/   , http://localhost:8080
const BACKEND_API_URL = process.env.BACKEND_API_URL || "https://sopra-fs25-group-09-server.oa.r.appspot.com/";
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args)); // Dynamic import

// --- Modified Data Structure ---
// Map<lobbyId, { ownerId: number | null, players: Map<userId, { socketId, username }>, detailsFetched: boolean }>
const lobbies = new Map();
const socketToLobby = new Map(); // Map<socketId, { lobbyId, userId }>
const pendingStateRequests = new Map();
const gameStates = new Map();
const timers = new Map();
const pendingDisconnects = new Map();
const LEAVE_DELAY = 0;
const playerScores = new Map(); // Map<lobbyId, Map<playerId, score>>


// --- NEW: Fetch Lobby Details Function ---
async function fetchLobbyDetailsFromDb(lobbyId) {
  const url = `${BACKEND_API_URL}/lobbies/${lobbyId}`;
  console.log(`Fetching lobby details from API: GET ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `API Error: Failed to fetch lobby details for ${lobbyId}. Status: ${response.status}`
      );
      return null;
    }
    const lobbyData = await response.json();
    console.log(
      `API Success: Fetched lobby details for ${lobbyId}` /* lobbyData */
    ); // Avoid logging sensitive data if any
    return lobbyData; // Expected format: { id, playerIds, lobbyOwner, ... }
  } catch (error) {
    console.error(
      `Network Error: Could not connect to API to fetch lobby details for ${lobbyId}. URL: ${url}`,
      error
    );
    return null;
  }
}

async function fetchTokenFromID(userID) {
  const url = `${BACKEND_API_URL}/users/${userID}`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `API Error: Failed to fetch token for ${userID}. Status: ${response.status}`
      );
      return null;
    }
    const userData = await response.json();
    const token = userData.token
    console.log(
      `API Success: Fetched userDetails for ${userID}`
    ); 
    return token;
  } catch (error) {
    console.error(
      `Network Error: Could not connect to API to fetch user details for ${userID}. URL: ${url}`,
      error
    );
    return null;
  }
}

async function handleTimeUp(lobbyId) {
  console.log(`🔁 Timer reached 0 for lobby ${lobbyId}`);

  const currentLobbyData = await fetchLobbyDetailsFromDb(lobbyId);
  if (!currentLobbyData) {
    timers.delete(lobbyId);
    gameStates.delete(lobbyId);
    return;
  }

  const { playerIds, painterHistoryTokens = [] } = currentLobbyData;

  let someoneStillHasToPaint = false;
  for (const playerId of playerIds) {
    const token = await fetchTokenFromID(playerId);
    if (!token) return;         // abort on DB error
    if (!painterHistoryTokens.includes(token)) {
      someoneStillHasToPaint = true;
      break;
    }
  }

  const gs = gameStates.get(lobbyId);
  if (!gs) return;              // should never happen

  if (someoneStillHasToPaint) {
    io.to(lobbyId).emit("roundEnded");          // wait for a word
  } else if (gs.currentRound < gs.numOfRounds) {
    gs.currentRound++;
    gameStates.set(lobbyId, gs);
    io.to(lobbyId).emit("gameUpdate", {
      currentRound: gs.currentRound,
      numOfRounds : gs.numOfRounds,
    });
    io.to(lobbyId).emit("roundEnded");          // wait for a word
  } else {
    // all rounds finished – clean everything
    timers.delete(lobbyId);
    gameStates.delete(lobbyId);
    io.to(lobbyId).emit("gameEnded");
  }
}

/**
 * Start (or restart) the one‑second countdown.
 * When it hits 0 it pauses – you must call runTimer() again
 * (we do that from “word-selected”).
 */
function runTimer(lobbyId, startTime) {
  let time = startTime;
  const interval = setInterval(async () => {
    time--;
    io.to(lobbyId).emit("timerUpdate", time);

    if (time <= 0) {
      clearInterval(interval);
      const t = timers.get(lobbyId);
      if (t) timers.set(lobbyId, { ...t, interval: null, paused: true, time: 0 });
      await handleTimeUp(lobbyId);              // do round / game bookkeeping
    }
  }, 1_000);

  timers.set(lobbyId, { time, interval, paused: false });
}

// --- NEW: Update Lobby Owner Function ---
async function updateLobbyOwnerInDb(lobbyId, newOwnerId) {
  // IMPORTANT: Adjust the URL and method based on your actual API endpoint
  // Option 1: Specific endpoint
  // const url = `${BACKEND_API_URL}/lobbies/${lobbyId}/setOwner?newOwnerId=${newOwnerId}`;
  // const method = 'PUT'; // or POST
  // const body = {};

  // Option 2: Update the whole lobby object (ensure your backend handles this)
  const url = `${BACKEND_API_URL}/lobbies/${lobbyId}`;
  const method = "PUT";
  const body = JSON.stringify({ lobbyOwner: newOwnerId }); // Send only the field to update (if backend supports partial update)
  // Or fetch the full lobby, modify owner, send back full object

  console.log(
    `Attempting to set new owner ${newOwnerId} for lobby ${lobbyId} via API: ${method} ${url}`
  );

  try {
    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body,
    });

    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (e) {}
      console.error(
        `API Error: Failed to update owner for lobby ${lobbyId}. Status: ${response.status}. Body: ${errorBody}`
      );
      return false;
    } else {
      console.log(
        `API Success: Updated owner for lobby ${lobbyId} to ${newOwnerId} (Status ${response.status}).`
      );
      return true;
    }
  } catch (error) {
    console.error(
      `Network Error: Could not connect to API to update owner for lobby ${lobbyId}. URL: ${url}`,
      error
    );
    return false;
  }
}

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

// --- Helper to handle owner transfer logic ---
async function handleOwnerTransfer(lobbyId, disconnectedUserIdNum) {
  // Assume receives number
  console.log(
    `[Ownership] Checking owner transfer for lobby ${lobbyId} after user ${disconnectedUserIdNum} disconnect.`
  );
  const lobbyData = lobbies.get(lobbyId);
  if (!lobbyData) {
    /* ... error ... */ return;
  }

  const currentDbLobbyState = await fetchLobbyDetailsFromDb(lobbyId);
  if (!currentDbLobbyState) {
    /* ... error ... */ return;
  }

  const dbOwnerIdNumber = Number(currentDbLobbyState.lobbyOwner);
  console.log(
    `[Ownership] DB Owner: ${dbOwnerIdNumber}, Disconnecting User: ${disconnectedUserIdNum}`
  );

  if (dbOwnerIdNumber === disconnectedUserIdNum) {
    console.log(`[Ownership] User ${disconnectedUserIdNum} was the owner.`);
    const remainingPlayerIds = Array.from(lobbyData.players.keys())
      .map((id) => Number(id))
      .filter((id) => id !== disconnectedUserIdNum);
    console.log(`[Ownership] Remaining player IDs: ${remainingPlayerIds}`);

    if (remainingPlayerIds.length > 0) {
      let newOwnerId = null;
      const orderedDbPlayerIds = (currentDbLobbyState.playerIds || []).map(
        (id) => Number(id)
      );
      console.log(`[Ownership] DB Player Order: ${orderedDbPlayerIds}`);

      for (const dbPlayerId of orderedDbPlayerIds) {
        if (remainingPlayerIds.includes(dbPlayerId)) {
          newOwnerId = dbPlayerId;
          break;
        }
      }

      if (newOwnerId !== null) {
        console.log(
          `[Ownership] Selecting new owner ${newOwnerId}. Updating DB...`
        );
        const success = await updateLobbyOwnerInDb(lobbyId, newOwnerId); // Call API

        if (success) {
          console.log(
            "[Ownership] DB Update successful. Updating memory and emitting."
          );
          // Update memory (optional, could rely on next fetch)
          lobbyData.ownerIdFromLastFetch = newOwnerId; // Update last known owner
          lobbies.set(lobbyId, lobbyData);

          // Notify clients
          const newOwnerUsername =
            lobbyData.players.get(String(newOwnerId))?.username || // Use string for map key
            lobbyData.players.get(newOwnerId)?.username ||
            "New Owner"; // Try number too just in case

          io.to(lobbyId).emit("lobbyOwnerChanged", {
            newOwnerId: newOwnerId, // Send number
            newOwnerUsername: newOwnerUsername,
          });
          // Also emit updated lobby state
          const currentPlayers = Array.from(lobbyData.players.entries()).map(
            ([id, data]) => ({
              id: String(id),
              username: data.username,
            })
          );
          io.to(lobbyId).emit("lobbyState", {
            players: currentPlayers,
            ownerId: newOwnerId, // Send the confirmed new owner
          });
        } else {
          /* ... handle API failure ... */
        }
      } else {
        /* ... handle no suitable owner ... */
      }
    } else {
      /* ... handle lobby empty ... */
    }
  } else {
    /* ... handle disconnected user wasn't owner ... */
  }
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on("painter-selection-complete", ({ lobbyId }) => {
    // Notify all clients in the lobby that the painter selection is complete
    io.to(lobbyId).emit("painter-selection-complete");
  });

  // Add this inside the io.on("connection", (socket) => { ... }) block, after existing socket event handlers

  socket.on("updateScore", ({ lobbyId, playerId }) => {
    if (!lobbyId || typeof playerId !== "number") {
      console.error(`Invalid updateScore data from socket ${socket.id}:`, { lobbyId, playerId });
      return;
    }
  
    const timerEntry = timers.get(lobbyId);
    if (!timerEntry || typeof timerEntry.time !== "number") {
      console.error(`[Error] No valid timer for lobby ${lobbyId}`);
      return;
    }
  
    const score = timerEntry.time;
  
    // --- Add score to player ---
    if (!playerScores.has(lobbyId)) playerScores.set(lobbyId, new Map());
    const lobbyScores = playerScores.get(lobbyId);
    const prevScore = lobbyScores.get(playerId) || 0;
    const newScore = prevScore + score;
    lobbyScores.set(playerId, newScore);
  
    console.log(`[Score] Player ${playerId} in lobby ${lobbyId} now has ${newScore} points`);
  
    io.to(lobbyId).emit("scoreUpdated", { playerId, score: newScore });
  
    // --- Drawer bonus ---
    const lobby = lobbies.get(lobbyId);
    if (!lobby || !lobby.currentPainterToken) {
      console.warn(`[Bonus] No painter token found for lobby ${lobbyId}`);
      return;
    }
  
    // Reverse-lookup the playerId of the drawer using the token
    let drawerId = null;
    for (const [uid, data] of lobby.players.entries()) {
      if (data.token === lobby.currentPainterToken) {
        drawerId = Number(uid);
        break;
      }
    }
  
    if (drawerId === null) {
      console.warn(`[Bonus] Could not find drawer for token ${lobby.currentPainterToken}`);
      return;
    }
  
    if (drawerId === playerId) {
      console.log(`[Bonus] Skipping bonus – drawer and guesser are the same (${playerId})`);
      return;
    }
  
    const drawerBonus = Math.floor(score / 4); // Or timerEntry.time / 4
  
    const drawerPrevScore = lobbyScores.get(drawerId) || 0;
    const drawerNewScore = drawerPrevScore + drawerBonus;
    lobbyScores.set(drawerId, drawerNewScore);
  
    console.log(`[Bonus] Drawer ${drawerId} gets ${drawerBonus} bonus. Total: ${drawerNewScore}`);
    io.to(lobbyId).emit("scoreUpdated", {
      playerId: drawerId,
      score: drawerNewScore,
    });
  });
  
  
  
  
  


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

  socket.on("startTimer", async ({ lobbyId, drawTime, numOfRounds }) => {
    console.log(`Start timer for lobby ${lobbyId} with drawTime: ${drawTime}s`);
  
    // bootstrap gameState once
    if (!gameStates.has(lobbyId)) {
      gameStates.set(lobbyId, {
        currentRound: 1,
        numOfRounds : numOfRounds,
        drawTime    : drawTime,
      });
      io.to(lobbyId).emit("gameUpdate", { currentRound: 1, numOfRounds });
    }
  
    const existing = timers.get(lobbyId);
    if (existing && !existing.paused) {
      console.log(`⏱️ Timer already running for lobby ${lobbyId}`);
      return;
    }

       // resume from pause or start fresh
       const startAt = existing?.paused ? gameStates.get(lobbyId).drawTime : (drawTime || 60);
       runTimer(lobbyId, startAt);
   
  });
  

  // --- REVISED joinLobby Handler ---
  socket.on("joinLobby", async ({ lobbyId, userId, username }) => {
    // Use consistent types internally (e.g., numbers for IDs if possible)
    const lobbyIdNum = Number(lobbyId); // Or keep as string if keys are strings
    const userIdNum = Number(userId);

    console.log(
      `[Join] User ${userIdNum} (${username}) attempting to join lobby ${lobbyIdNum}`
    );

    // --- Clear Pending Disconnect (use original userId key) ---
    const lobbyTimeouts = pendingDisconnects.get(lobbyId); // Use original lobbyId key
    if (lobbyTimeouts && lobbyTimeouts.has(userId)) {
      // Use original userId key
      clearTimeout(lobbyTimeouts.get(userId));
      lobbyTimeouts.delete(userId);
      if (lobbyTimeouts.size === 0) pendingDisconnects.delete(lobbyId);
      console.log(`[Join] Cleared pending disconnect for user ${userId}`);
    }

    let lobbyData = lobbies.get(lobbyId); // Use original lobbyId key

    // --- Initialize lobby in memory if needed ---
    if (!lobbyData) {
      console.log(`[Join] Initializing memory for lobby ${lobbyId}`);
      lobbyData = { players: new Map(), ownerIdFromLastFetch: null };
      lobbies.set(lobbyId, lobbyData);
    }

    // --- *** Always Fetch Fresh Lobby Details on Join *** ---
    // This ensures we have the latest owner and player list from the DB
    console.log(`[Join] Fetching latest DB details for lobby ${lobbyId}`);
    const dbDetails = await fetchLobbyDetailsFromDb(lobbyId); // Use original lobbyId

    if (!dbDetails) {
      console.error(
        `[Join] CRITICAL: Could not fetch DB details for lobby ${lobbyId}. Aborting join.`
      );
      // Optionally emit an error to the client
      socket.emit("joinError", {
        message: `Lobby ${lobbyId} not found or backend unavailable.`,
      });
      // Consider disconnecting the socket if join is essential
      // socket.disconnect();
      return;
    }

    // Update owner ID in memory from the fresh fetch
    const currentDbOwnerId = Number(dbDetails.lobbyOwner);
    lobbyData.ownerIdFromLastFetch = currentDbOwnerId;
    console.log(
      `[Join] Current DB Owner for lobby ${lobbyId} is: ${currentDbOwnerId}`
    );

    // --- Add/Update player in memory (use consistent key type, e.g., string) ---
    const userIdString = String(userId); // Use string key for map consistency
    const wasPlayerPresent = lobbyData.players.has(userIdString);
    const previousPlayerData = lobbyData.players.get(userIdString);  
    const token = await fetchTokenFromID(userId); 
    lobbyData.players.set(userIdString, { socketId: socket.id, username, token });
    lobbies.set(lobbyId, lobbyData); // Update map entry

    // --- Update socket mapping (use original types) ---
    socketToLobby.set(socket.id, { lobbyId, userId });
    socket.join(lobbyId); // Join the socket room

    console.log(
      `[Join] User ${userIdString} (${username}) [${socket.id}] joined lobby ${lobbyId}. Was present before: ${wasPlayerPresent}`
    );
    console.log(
      `[Join] Lobby ${lobbyId} players in memory:`,
      Array.from(lobbyData.players.keys())
    );

    // --- Emit current state (using fresh DB owner) ---
    const currentPlayers = Array.from(lobbyData.players.entries()).map(
      ([id, data]) => ({
        id: String(id), // Ensure string ID for client
        username: data.username,
      })
    );

    console.log(
      `[Join] Emitting lobbyState to all in ${lobbyId}. Owner: ${currentDbOwnerId}`
    );
    // Emit to EVERYONE in the lobby to ensure sync
    io.to(lobbyId).emit("lobbyState", {
      players: currentPlayers,
      ownerId: currentDbOwnerId, // Use the freshly fetched owner ID
    });

    // You might not need 'playerJoined' if 'lobbyState' is always sent to all
    // socket.to(lobbyId).emit("playerJoined", { id: String(userId), username });
  });

  // --- leaveLobby Handler ---
  socket.on("leaveLobby", async ({ lobbyId, userId }) => {
    // Use consistent types
    const userIdNum = Number(userId);
    const lobbyIdStr = String(lobbyId); // Assuming map uses string keys now

    console.log(`[Leave] User ${userIdNum} leaving lobby ${lobbyIdStr}`);
    const lobbyData = lobbies.get(lobbyIdStr);

    if (lobbyData && lobbyData.players.has(String(userIdNum))) {
      // Check using string key
      const playerData = lobbyData.players.get(String(userIdNum));
      const ownerIdInMemory = lobbyData.ownerIdFromLastFetch; // Get owner from memory

      // Clear Pending Disconnect timer
      const lobbyTimeouts = pendingDisconnects.get(lobbyIdStr);
      if (lobbyTimeouts && lobbyTimeouts.has(String(userIdNum))) {
        /* ... clear timeout ... */
      }

      // Fetch current DB state BEFORE deciding on owner transfer
      const currentDbLobbyState = await fetchLobbyDetailsFromDb(lobbyIdStr);
      const currentDbOwnerId = currentDbLobbyState
        ? Number(currentDbLobbyState.lobbyOwner)
        : null;

      // Check if the leaving user is the *actual* current owner in the DB
      const isActuallyOwner = currentDbOwnerId === userIdNum;
      console.log(
        `[Leave] Is leaving user ${userIdNum} the DB owner (${currentDbOwnerId})? ${isActuallyOwner}`
      );

      // --- Handle Owner Transfer (if owner is leaving manually) ---
      if (isActuallyOwner) {
        console.log(
          `[Leave] Owner ${userIdNum} is leaving lobby ${lobbyIdStr}. Triggering transfer.`
        );
        // Remove player from memory map *before* transfer logic
        lobbyData.players.delete(String(userIdNum));
        await handleOwnerTransfer(lobbyIdStr, userIdNum); // Pass number ID
      } else {
        // Just remove player if not owner
        lobbyData.players.delete(String(userIdNum));
      }

      // --- Update socket maps and leave room ---
      if (socketToLobby.get(socket.id)?.userId === userId)
        socketToLobby.delete(socket.id);
      socket.leave(lobbyIdStr);

      // --- Notify clients player left ---
      io.to(lobbyIdStr).emit("playerLeft", {
        id: String(userIdNum), // Send string ID
        username: playerData?.username || "Player",
      });
      console.log(`[Leave] Emitted playerLeft for ${userIdNum}`);

      // --- Remove from Database API call ---
      console.log(`[Leave] Calling removePlayerFromDb for ${userIdNum}`);
      await removePlayerFromDb(lobbyIdStr, userIdNum); // Use number ID for API

      // --- Clean up empty lobby in memory ---
      if (lobbyData.players.size === 0) {
        /* ... delete lobby from maps ... */
      }
    } else {
      /* ... handle player/lobby not found in memory ... */
    }
  });
  // --- chatMessage Handler (no changes needed) ---
/**
 * Broadcast to the whole lobby (current behaviour).
 */
socket.on("chatMessage", ({ lobbyId, message, username }) => {
  if (!lobbyId || typeof message !== "string" || message.trim().length === 0) {
    return;
  }

  const senderInfo      = socketToLobby.get(socket.id);
  const senderUsername  = username || senderInfo?.username || "Guest";

  // 👇 everyone in the lobby (including the sender) receives this
  io.to(lobbyId).emit("chatMessage", {
    username : senderUsername,
    message,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Send a response ONLY to the client that triggered the event.
 * Two equivalent ways are shown; pick one style and stick with it.
 */
socket.on("chatAlert", ({ message, username }) => {
  // basic validation omitted for brevity

  const senderInfo      = socketToLobby.get(socket.id);
  const senderUsername  = username || senderInfo?.username || "";

  // Option A – simplest and most common:
  socket.emit("chatAlert", {
    username : senderUsername,
    message,
    timestamp: new Date().toISOString(),
  });

  // ─────────────  OR  ─────────────
  // Option B – does exactly the same thing, a bit more verbosely:
  // io.to(socket.id).emit("chatAlert", { … });
});

  // --- disconnect Handler ---
  socket.on("disconnect", () => {
    console.log(`[Disconnect] Socket disconnected: ${socket.id}`);
    const playerInfo = socketToLobby.get(socket.id);

    if (playerInfo) {
      const { lobbyId, userId } = playerInfo; // Get original types
      const userIdNum = Number(userId);
      const lobbyIdStr = String(lobbyId);

      console.log(
        `[Disconnect] Handling disconnect for user ${userIdNum} in lobby ${lobbyIdStr}`
      );

      const lobbyData = lobbies.get(lobbyIdStr);
      const currentUserData = lobbyData
        ? lobbyData.players.get(String(userIdNum))
        : null; // Use string key

      if (currentUserData && currentUserData.socketId === socket.id) {
        console.log(
          `[Disconnect] User ${userIdNum} is associated with this socket. Starting ${
            LEAVE_DELAY / 1000
          }s timer.`
        );

        const timeoutId = setTimeout(async () => {
          console.log(
            `[Timeout] Timer expired for user ${userIdNum} [${socket.id}] in lobby ${lobbyIdStr}. Checking state...`
          );
          const currentLobbyData = lobbies.get(lobbyIdStr);
          const userDataInLobby = currentLobbyData
            ? currentLobbyData.players.get(String(userIdNum))
            : null; // Use string key

          if (userDataInLobby && userDataInLobby.socketId === socket.id) {
            console.log(
              `[Timeout] User ${userIdNum} still associated with disconnected socket ${socket.id}. Proceeding.`
            );

            // --- Fetch latest owner before deciding ---
            const latestDbState = await fetchLobbyDetailsFromDb(lobbyIdStr);
            const latestDbOwnerId = latestDbState
              ? Number(latestDbState.lobbyOwner)
              : null;
            console.log(
              `[Timeout] Current DB owner for ${lobbyIdStr} is ${latestDbOwnerId}`
            );

            const wasOwner = latestDbOwnerId === userIdNum;
            console.log(
              `[Timeout] Was disconnected user ${userIdNum} the DB owner? ${wasOwner}`
            );

            if (wasOwner) {
              console.log(
                `[Timeout] Triggering owner transfer for ${userIdNum}`
              );
              await handleOwnerTransfer(lobbyIdStr, userIdNum); // Pass number ID
            }

            // Remove Player from Memory (use string key)
            if (currentLobbyData)
              currentLobbyData.players.delete(String(userIdNum)); // Check if currentLobbyData exists
            console.log(
              `[Timeout] Removed user ${userIdNum} from lobby ${lobbyIdStr} memory.`
            );

            // Notify Clients
            io.to(lobbyIdStr).emit("playerLeft", {
              id: String(userIdNum),
              username: userDataInLobby.username,
            });
            console.log(`[Timeout] Emitted playerLeft for ${userIdNum}`);

            // Remove from Database (use number ID)
            console.log(
              `[Timeout] Calling removePlayerFromDb for ${userIdNum}`
            );
            await removePlayerFromDb(lobbyIdStr, userIdNum);

            // Clean up empty lobby
            if (currentLobbyData && currentLobbyData.players.size === 0) {
              /* ... delete lobby ... */
            }
          } else {
            /* ... handle reconnected or already gone ... */
          }

          // Clean up Pending Disconnect Timer Map (use original userId key)
          const currentLobbyTimeouts = pendingDisconnects.get(lobbyIdStr);
          if (currentLobbyTimeouts) {
            currentLobbyTimeouts.delete(userId); /* ... */
          }
        }, LEAVE_DELAY);

        // Store pending disconnect (use original userId key)
        if (!pendingDisconnects.has(lobbyIdStr))
          pendingDisconnects.set(lobbyIdStr, new Map());
        pendingDisconnects.get(lobbyIdStr).set(userId, timeoutId); // Use original userId as key
      } else {
        /* ... handle old socket disconnect ... */
      }
      socketToLobby.delete(socket.id); // Clean up mapping
    } else {
      /* ... handle disconnect without playerInfo ... */
    }
  });

  //implementation of drawing board

  // --- NEW: Handle request for initial state ---
  // index.js - Corrected request-initial-state handler

  // --- Handle request for initial state ---
  socket.on("request-initial-state", () => {
    console.log(
      `[State Sync Step 1] Received 'request-initial-state' from socket ${socket.id}`
    );
    const playerInfo = socketToLobby.get(socket.id);
    if (!playerInfo) {
      /* handle error */ return;
    }
    const requesterId = String(playerInfo.userId);
    const lobbyId = String(playerInfo.lobbyId);
    const lobbyData = lobbies.get(lobbyId);

    if (!lobbyData || !lobbyData.players || lobbyData.players.size <= 1) {
      console.log(
        `[State Sync Step 1] Aborting: Lobby ${lobbyId} has <= 1 player.`
      );
      return;
    }

    pendingStateRequests.set(requesterId, socket.id);
    console.log(
      `[State Sync Step 1] Stored pending request for ${requesterId}. Map size: ${pendingStateRequests.size}`
    );

    console.log(
      `[State Sync Step 2] Broadcasting 'get-canvas-state' to lobby ${lobbyId} (excluding sender) for ${requesterId}`
    );
    socket.to(lobbyId).emit("get-canvas-state", { requesterId: requesterId });

    setTimeout(() => {
      /* timeout logic */
    }, 15000);
  });

  // --- NEW: Handle receiving state from existing client ---
  // --- send-canvas-state Handler ---
  socket.on("send-canvas-state", (data) => {
    const senderInfo = socketToLobby.get(socket.id);
    const senderUserId = String(senderInfo?.userId || "Unknown");
    console.log(
      `[State Sync Step 3] Received 'send-canvas-state' from sender ${senderUserId}. Target: ${data?.targetUserId}`
    );

    if (
      !data ||
      typeof data.targetUserId !== "string" ||
      !data.dataUrl ||
      !data.dataUrl.startsWith("data:image/")
    ) {
      console.error(`[State Sync Step 3] Invalid data received:`, data);
      return;
    }
    const targetUserId = String(data.targetUserId); // Use string key

    console.log(
      `[State Sync Step 3] Checking pending requests for ${targetUserId}. Map size: ${pendingStateRequests.size}`
    );
    if (pendingStateRequests.has(targetUserId)) {
      const targetSocketId = pendingStateRequests.get(targetUserId);
      console.log(
        `[State Sync Step 4] Found pending request for ${targetUserId}. Target socket: ${targetSocketId}. Emitting 'load-canvas-state'...`
      );

      // Check if target socket still exists/connected (optional but good)
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        io.to(targetSocketId).emit("load-canvas-state", {
          dataUrl: data.dataUrl,
        });
        console.log(
          `[State Sync Step 4] Emission to ${targetSocketId} completed.`
        );
      } else {
        console.warn(
          `[State Sync Step 4] Target socket ${targetSocketId} not found or disconnected. Cannot send state.`
        );
      }

      pendingStateRequests.delete(targetUserId); // Remove after processing
      console.log(
        `[State Sync Step 4] Removed pending request for ${targetUserId}. Map size: ${pendingStateRequests.size}`
      );
    } else {
      console.log(
        `[State Sync Step 3] Ignoring: No pending request found for ${targetUserId}.`
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
    const { lobbyId, userId } = playerInfo;
  
    // Set the current painter token
    const lobby = lobbies.get(lobbyId);
    if (lobby && lobby.players.has(String(userId))) {
      const painterToken = lobby.players.get(String(userId)).token;
      lobby.currentPainterToken = painterToken;
      console.log(`[Painter] Set currentPainterToken for lobby ${lobbyId} to ${painterToken}`);
    }
  
    // Relay to everyone else
    socket.to(lobbyId).emit("word-selected", data);
  
    // Resume the countdown if we were waiting
    const t = timers.get(lobbyId);
    const gs = gameStates.get(lobbyId);
    if (t && t.paused && gs) {
      runTimer(lobbyId, gs.drawTime);
    }
  });
  

  socket.on("get-round-infos", (lobbyId) => {
    const gs = gameStates.get(lobbyId);
    if (!gs) return;             // should never happen

    io.to(lobbyId).emit("gameUpdate", {
      currentRound: gs.currentRound,
      numOfRounds : gs.numOfRounds,
    });
  });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
  console.log(`📞 Connecting to Backend API at: ${BACKEND_API_URL}`); // Log API URL
});
