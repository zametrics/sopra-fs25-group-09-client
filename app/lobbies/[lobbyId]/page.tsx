"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Button, message, Modal } from "antd";
import { useRouter } from "next/navigation";
import withAuth from "@/hooks/withAuth";
import io, { Socket } from "socket.io-client";
import Layout from "@/utils/layout";

interface LobbyData {
  id: number;
  numOfMaxPlayers: number;
  playerIds: number[];
  language: string;
  numOfRounds: number;
  drawTime: number;
  lobbyOwner: number;
  type: string;
  currentPainterToken: string | null;
  status: number;
}

// Add interfaces from Layout if needed here too, or import them
interface LobbyOwnerChangedData {
  newOwnerId: number | string;
  newOwnerUsername: string;
}
interface LobbyStateData {
  players: { id: string; username: string }[];
  ownerId?: number | string | null;
}

const LobbyPage: React.FC = () => {
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [copied, setCopied] = useState(false);
  const [isLeaveModalVisible, setIsLeaveModalVisible] =
    useState<boolean>(false);

  // Settings states
  const [maxPlayers, setMaxPlayers] = useState<number>(8);
  const [drawTime, setDrawTime] = useState<number>(80);
  const [rounds, setRounds] = useState<number>(3);
  const [language, setLanguage] = useState<string>("english");
  const [type, setType] = useState<string>("standard");
  const [customWords, setCustomWords] = useState<string>("");
  const [useCustomWordsOnly, setUseCustomWordsOnly] = useState<boolean>(false);

  const currentUserId =
    typeof window !== "undefined" ? localStorage.getItem("userId") : "";
  const currentUserIdNumber = currentUserId ? Number(currentUserId) : null;
  const localAvatarUrl =
    typeof window !== "undefined"
      ? localStorage.getItem("avatarUrl") || "/icons/avatar.png"
      : "/icons/avatar.png";

  // --- Function to Fetch and Set Lobby State ---
  const fetchAndSetLobby = useCallback(async () => {
    if (!lobbyId) return;
    console.log("[Fetch] Attempting to fetch lobby details for", lobbyId);
    setLoading(true); // Show loading during fetch
    try {
      const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
      console.log("[Fetch] Received lobby data:", response);
      setLobby(response); // Update the main lobby state

      // --- Update local settings state from fetched data ---
      setMaxPlayers(response.numOfMaxPlayers);
      setDrawTime(response.drawTime);
      setRounds(response.numOfRounds);
      setLanguage(response.language);
      setType(response.type);
      // Consider resetting custom words or fetching if stored elsewhere
      setCustomWords("");
      setUseCustomWordsOnly(false);
      console.log("[Fetch] Lobby state and settings updated.");
    } catch (error) {
      console.error("[Fetch] Error fetching lobby:", error);
      message.error("Failed to load lobby information");
      setLobby(null); // Clear lobby on error
      // Navigate away if lobby doesn't exist?
      // router.push('/home');
    } finally {
      setLoading(false);
    }
  }, [lobbyId, apiService]); // Dependencies for fetch logic

  // Initial Fetch Effect
  useEffect(() => {
    fetchAndSetLobby();
  }, [fetchAndSetLobby]); // Run when fetchAndSetLobby function identity changes (effectively on lobbyId change)

  // --- Centralized State Update Logic ---
  const updateLocalLobbyState = useCallback((updates: Partial<LobbyData>) => {
    setLobby((prevLobby) => {
      if (!prevLobby) return null;
      const newState = { ...prevLobby, ...updates };
      console.log(
        "[State Update] Updating local lobby state:",
        updates,
        "New state:",
        newState
      );
      return newState;
    });
  }, []); // Empty dependency array - function is stable

  // Socket Connection and Listener Effect
  useEffect(() => {
    // Ensure lobbyId and currentUserId are available
    if (!lobbyId || !currentUserId) {
      console.warn(
        "LobbyPage: Missing lobbyId or currentUserId, skipping socket connection."
      );
      return;
    }

    //http://localhost:3001 --- "https://socket-server-826256454260.europe-west1.run.app/"
    console.log("[Socket] Setting up socket for lobby:", lobbyId);
    const socketIo = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "https://socket-server-826256454260.europe-west1.run.app/",
      {
        // Use env var
        path: "/api/socket",
        // reconnectionAttempts: 5, // Optional: configure reconnection
      }
    );
    setSocket(socketIo);

    // Fetch username for join message
    const joinLobby = async () => {
      let username = "Guest";
      try {
        const userData = await apiService.get<{ id: number; username: string }>(
          `/users/${currentUserId}`
        );
        username = userData.username;
      } catch (error) {
        console.error("Error fetching username for join:", error);
      }
      console.log(
        `[Socket] Emitting joinLobby: lobbyId=${lobbyId}, userId=${currentUserId}, username=${username}`
      );
      socketIo.emit("joinLobby", { lobbyId, userId: currentUserId, username });
  


      // Attempt to join
      try {
        await apiService.put(`/lobbies/${lobbyId}/join?playerId=${currentUserId}`, {});
      }catch(error) {
      console.log("Error",error);
    } 
      


    };

    socketIo.on("connect", () => {
      console.log("[Socket] Connected:", socketIo.id);
      joinLobby(); // Join lobby once connected
    });

    // --- Listeners updating the LOCAL lobby state ---

    // Listen for full state updates (might include owner)
    socketIo.on("lobbyState", (data: LobbyStateData) => {
      console.log("[Socket] Received lobbyState:", data);
      if (data.ownerId !== undefined && data.ownerId !== null) {
        updateLocalLobbyState({ lobbyOwner: Number(data.ownerId) });
      }
      // Optionally update player list state here if needed, separate from Layout
    });

    // Listen specifically for owner changes
    socketIo.on("lobbyOwnerChanged", (data: LobbyOwnerChangedData) => {
      console.log("[Socket] Received lobbyOwnerChanged:", data);
      updateLocalLobbyState({ lobbyOwner: Number(data.newOwnerId) });
      // Optional: Show message only if the current user becomes owner?
      if (Number(data.newOwnerId) === currentUserIdNumber) {
        message.success(`You are now the lobby owner!`);
      } else {
        message.info(`${data.newOwnerUsername} is now the lobby owner.`);
      }
    });

    // Listen for game starting event
    socketIo.on("gameStarting", ({ lobbyId: receivedLobbyId }) => {
      if (receivedLobbyId === lobbyId) {
        console.log("[Socket] Received gameStarting event. Navigating...");
        router.push(`/games/${lobbyId}`);
      }
    });

    // --- Standard Socket Event Handlers ---
    socketIo.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
      // Maybe show a message if disconnect wasn't intentional
      if (reason !== "io client disconnect") {
        message.warning("Disconnected from server. Attempting to reconnect...");
      }
      setSocket(null); // Clear socket state
    });

    socketIo.on("connect_error", (err) => {
      console.error("[Socket] Connection error:", err);
      message.error(
        `Connection failed: ${err.message}. Please check your connection and refresh.`,
        10
      );
      setSocket(null);
    });

    // Cleanup function
    return () => {
      console.log("[Socket] Cleaning up socket listeners and disconnecting.");
      socketIo.off("connect");
      socketIo.off("lobbyState");
      socketIo.off("lobbyOwnerChanged");
      socketIo.off("gameStarting");
      socketIo.off("disconnect");
      socketIo.off("connect_error");
      socketIo.disconnect();
      setSocket(null); // Clear socket state on unmount
    };
    // Rerun effect if lobbyId or currentUserId changes (though usually they don't on this page)
    // updateLocalLobbyState is stable due to useCallback
  }, [
    lobbyId,
    currentUserId,
    apiService,
    router,
    updateLocalLobbyState,
    currentUserIdNumber,
  ]);

  // Calculate isOwner based on the *local* lobby state
  const isOwner =
    lobby !== null &&
    currentUserIdNumber !== null &&
    lobby.lobbyOwner === currentUserIdNumber;
  // Add a log to see the isOwner calculation result whenever lobby or currentUserId changes

  const getSliderBackground = (value: number, min: number, max: number) => {
    const percentage = ((value - min) / (max - min)) * 100;
    return `linear-gradient(to right, #007bff ${percentage}%, #ccc ${percentage}%)`;
  };

  useEffect(() => {
    console.log(
      `[Auth Check] Re-calculating isOwner: lobbyOwner=${lobby?.lobbyOwner}, currentUserIdNumber=${currentUserIdNumber}, Result=${isOwner}`
    );
  }, [lobby, currentUserIdNumber, isOwner]);

  // --- Start Game Logic ---
  const startGame = async () => {
    // Use the isOwner flag derived from the up-to-date local state
    if (!isOwner) {
      message.error("Only the lobby owner can start the game");
      return;
    }
    if (!lobby || !socket) {
      // Added check for socket
      message.error("Lobby data or socket connection missing.");
      return;
    }

    // Validation for custom words (keep existing)
    if (customWords && type === "custom") {
      /* ... */
    }

    console.log("[Start Game] Initiated by owner. Current lobby state:", lobby);
    setLoading(true); // Indicate loading state

    try {
      // Construct settings using component's state (maxPlayers, drawTime, etc.)
      // CRITICAL: Use the up-to-date 'lobby.lobbyOwner' from the local state
      const gameSettingsPayload = {
        // id: lobby.id, // Backend usually uses path param for ID
        lobbyOwner: lobby.lobbyOwner, // <<< Use current state value
        numOfMaxPlayers: maxPlayers,
        // playerIds: lobby.playerIds, // Usually backend manages player list internally on PUT
        language: language,
        type: type === "custom" && customWords ? "custom" : type, // Handle custom type
        numOfRounds: rounds,
        drawTime: drawTime,

      };

      console.log(
        "[Start Game] Sending PUT request to /lobbies/" +
          lobbyId +
          " with payload:",
        gameSettingsPayload
      );

      // Send PUT request to update lobby settings *before* starting
      await apiService.put(`/lobbies/${lobbyId}`, gameSettingsPayload);
      console.log("[Start Game] Lobby settings updated via API.");

      // Emit gameStarting event via socket AFTER settings are saved
      console.log("[Start Game] Emitting gameStarting event to socket server.");
      socket.emit("gameStarting", { lobbyId }); // Server will broadcast

      // Navigation will happen automatically when client receives 'gameStarting' back
    } catch (error) {
      console.error("[Start Game] Error:", error);
      message.error(
        "Failed to update lobby settings or start the game. Please try again."
      );
      // Potentially refetch lobby state on error?
      // fetchAndSetLobby();
    } finally {
      setLoading(false);
    }
  };

  // --- Leave Lobby Logic (Keep Existing) ---
  const showLeaveConfirmation = () => {
    setIsLeaveModalVisible(true);
  };
  const handleCancelLeave = () => {
    setIsLeaveModalVisible(false);
  };
  const handleLeaveLobby = async () => {
    if (!currentUserId || !lobbyId) {
      router.push("/home");
      return;
    }
    console.log("[Leave Lobby] Initiated.");
    setLoading(true);
    try {
      // Call API first
      await apiService.put(
        `/lobbies/${lobbyId}/leave?playerId=${currentUserId}`,
        {}
      );
      console.log("[Leave Lobby] API call successful.");
      // Emit socket event
      if (socket) {
        console.log("[Leave Lobby] Emitting leaveLobby socket event.");
        socket.emit("leaveLobby", { lobbyId, userId: currentUserId });
      }
      message.success("You have left the lobby");
      router.push("/home"); // Navigate after success
    } catch (error) {
      console.error("Error leaving lobby:", error);
      message.error("Failed to leave lobby properly, redirecting anyway.");
      router.push("/home"); // Navigate even on error
    } finally {
      setLoading(false);
      setIsLeaveModalVisible(false);
      // No need to disconnect socket here, unmount will handle it
    }
  };

  function copyLobbyCode() {
    navigator.clipboard.writeText(lobbyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  }

  // Loading screen
  if (loading) {
    return (
      <Layout
        socket={socket}
        lobbyId={lobbyId}
        currentUserId={currentUserId}
        localAvatarUrl={localAvatarUrl}
        lobby={lobby}
      >
        <div className="game-box">Loading...</div>
      </Layout>
    );
  }

  // No loading screen
  if (!lobby) {
    return (
      <Layout
        socket={socket}
        lobbyId={lobbyId}
        currentUserId={currentUserId}
        localAvatarUrl={localAvatarUrl}
        lobby={null}
      >
        <div className="login-register-box">
          <h1
            className="players-chat-title"
            style={{ marginTop: -10, marginBottom: 30, fontSize: 50 }}
          >
            Lobby Not Found
          </h1>
          <h2 className="players-chat-title">Lobby {`#${lobbyId}`}</h2>
          <Button className="green-button" onClick={() => router.push("/home")}>
            Back to home
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      socket={socket}
      lobbyId={lobbyId}
      currentUserId={currentUserId}
      localAvatarUrl={localAvatarUrl}
      lobby={lobby} // Pass the local state
    >
      <div className="settings-box">
        <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-5rem"></p>

        <div className="lobby-header">
          <h2 className="lobby-banner">HOST A LOBBY</h2>
          <button className="close-button" onClick={showLeaveConfirmation}>
            <img src="/icons/close_x.svg" alt="Close" className="close-icon" />
          </button>
        </div>

        <div className="lobby-setting-group">
          <label className="lobby-label">PLAYERS:</label>
          <input
            type="range"
            min={2}
            max={8}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            disabled={!isOwner || loading}
            style={{
              background: getSliderBackground(maxPlayers, 2, 8),
            }}
          />
          <span className="slider-value">{maxPlayers}</span>
        </div>

        <div className="lobby-setting-group">
          <label className="lobby-label">DRAWTIME:</label>
          <input
            type="range"
            min={15}
            max={120}
            step={5}
            value={drawTime}
            onChange={(e) => setDrawTime(Number(e.target.value))}
            disabled={!isOwner || loading}
            style={{
              background: getSliderBackground(drawTime, 15, 120),
            }}
          />
          <span className="slider-value">{drawTime}s</span>
        </div>

        <div className="lobby-setting-group">
          <label className="lobby-label">ROUNDS:</label>
          <input
            type="range"
            min={1}
            max={10}
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
            disabled={!isOwner || loading} // Use isOwner flag
            style={{
              background: getSliderBackground(rounds, 1, 10),
            }}
          />
          <span className="slider-value">{rounds}</span>
        </div>

        <div className="lobby-setting-group">
          <label className="lobby-label">LANGUAGE:</label>
          <div className="wordset-controls">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!isOwner || loading}
            >
              <option value="en">English</option>
              <option value="de">German</option>
              <option value="ch">Schwitzerdütsch</option>
            </select>
          </div>
        </div>

        <div className="lobby-setting-group">
          <label className="lobby-label">WORD TYPE:</label>
          <div className="wordset-controls">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={!isOwner || loading}
            >
              <option value="anything">Anything</option>
              <option value="animals">Animals</option>
              <option value="food">Food</option>
              <option value="jobs">Jobs</option>
              <option value="custom">Custom</option>
            </select>
            {type === "custom" && (
              <label>
                <input
                  type="checkbox"
                  checked={useCustomWordsOnly}
                  onChange={(e) => setUseCustomWordsOnly(e.target.checked)}
                  disabled={!isOwner || loading}
                />
                Use custom words only
              </label>
            )}
          </div>
          {type === "custom" && (
            <textarea
              placeholder="Minimum of 10 words. 1–32 characters per word! Separated by a , (comma)"
              value={customWords}
              onChange={(e) => setCustomWords(e.target.value)}
              disabled={!isOwner || loading}
            />
          )}
        </div>

        <div className="lobby-actions">
          <button
            className="green-button"
            style={{ width: 300 }}
            onClick={startGame}
            disabled={!isOwner || loading}
          >
            {loading ? "STARTING..." : "START"}
          </button>

          <div className="roomcode-box">
            <div className="roomcode-label">ROOMCODE:</div>
            <div
              className="roomcode-value"
              onClick={copyLobbyCode}
              title="Click to copy"
            >
              {copied ? "Copied!" : lobbyId}
            </div>
          </div>
        </div>
      </div>

      <Modal
        title={<div className="fadeIn leave-modal-title">Leave Lobby</div>}
        open={isLeaveModalVisible}
        onOk={handleLeaveLobby}
        onCancel={handleCancelLeave}
        okText="Yes, Leave"
        cancelText="Cancel"
        centered
        closeIcon={<div className="leave-modal-close">✕</div>}
        className="leave-modal-container"
        okButtonProps={{
          className: "leave-modal-confirm-button",
          style: {
            background: "#ff3b30",
            borderColor: "#e02d22",
            color: "white",
          },
        }}
        cancelButtonProps={{
          className: "leave-modal-cancel-button",
          style: {
            backgroundColor: "#f5f5f5",
            borderColor: "#d9d9d9",
            color: "#333",
          },
        }}
      >
        <p className="fadeIn leave-modal-message">
          Are you sure you want to leave this lobby?
        </p>
      </Modal>
    </Layout>
  );
};

export default withAuth(LobbyPage);
