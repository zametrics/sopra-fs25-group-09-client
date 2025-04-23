"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Button, Input, message } from "antd";
import { Socket } from "socket.io-client";
import { useApi } from "@/hooks/useApi";

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
}

interface PlayerData {
  id: number;
  username: string;
}

interface ChatMessage {
  username: string;
  message: string;
  timestamp: string;
}

interface LayoutProps {
  children: React.ReactNode;
  socket: Socket | null;
  lobbyId: string;
  currentUserId: string | null; // Keep as string if from localStorage
  localAvatarUrl: string;
  // --- Make lobby state mutable ---
  lobby: LobbyData | null;
  // --- NEW: Callback to update lobby state in parent ---
  // This is needed if the parent component (e.g., lobbies/page.tsx)
  // needs to react to the owner change for enabling/disabling controls.
  // If only the indicator in Layout needs updating, this isn't strictly necessary.
  onLobbyUpdate?: (updatedLobby: Partial<LobbyData>) => void;
}

interface PlayerLeftData {
  id: string | number; // ID might be string or number from server
  username: string;
}

// --- NEW Interface for Owner Change ---
interface LobbyOwnerChangedData {
  newOwnerId: number | string; // ID might be number or string
  newOwnerUsername: string;
}

// --- Interface for Lobby State Event (including owner) ---
interface LobbyStateData {
  players: { id: string; username: string }[]; // Assuming server sends string IDs now
  ownerId?: number | string | null; // Owner ID can be included
}

const Layout: React.FC<LayoutProps> = ({
  children,
  socket,
  lobbyId,
  currentUserId,
  localAvatarUrl,
  lobby: initialLobby, // Rename prop to avoid conflict with state
  onLobbyUpdate, // Get the update function
}) => {
  const apiService = useApi();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [currentWord, setCurrentWord] = useState<string>("");

  const colorPool: string[] = [
    "#e6194b",
    "#3cb44b",
    "#4363d8",
    "#f58231",
    "#911eb4",
    "#42d4f4",
    "#f032e6",
    "#1a1aff",
    "#008080",
  ];

  const usernameColorsRef = useRef<{ [key: string]: string }>({});
  const [lobby, setLobby] = useState<LobbyData | null>(initialLobby);

  // Update local lobby state if the prop changes
  useEffect(() => {
    setLobby(initialLobby);
  }, [initialLobby]);

  // --- Helper function to update lobby state locally and notify parent ---
  const updateLobbyState = useCallback(
    (updates: Partial<LobbyData>) => {
      setLobby((prevLobby) => {
        if (!prevLobby) return null; // Should not happen if updates occur
        const newLobby = { ...prevLobby, ...updates };
        // Notify parent component if callback provided
        if (onLobbyUpdate) {
          onLobbyUpdate(updates);
        }
        return newLobby;
      });
    },
    [onLobbyUpdate]
  ); // Dependency on the callback

  function getUsernameColor(username: string): string {
    const usernameColors = usernameColorsRef.current;

    if (!username || typeof username !== "string") return "black";

    if (usernameColors[username]) {
      return usernameColors[username];
    }

    const availableColors = colorPool.filter(
      (color) => !Object.values(usernameColors).includes(color)
    );

    const newColor =
      availableColors.length > 0
        ? availableColors[Math.floor(Math.random() * availableColors.length)]
        : "#" + Math.floor(Math.random() * 16777215).toString(16);

    usernameColors[username] = newColor;
    return newColor;
  }

  // --- useEffect for Fetching and Socket Listeners ---
  useEffect(() => {
    const fetchLobbyPlayersAndOwner = async () => {
      try {
        // Fetch full lobby details initially
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        setLobby(response); // Set the full lobby state

        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService
              .get<PlayerData>(`/users/${id}`)
              .catch(() => ({ id, username: "Guest" } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(
            playerData.map((p) => ({ ...p, id: Number(p.id) })) as PlayerData[]
          );
        } else {
          setPlayers([]);
        }
      } catch (error) {
        console.error("Error fetching lobby details:", error);
        setPlayers([]);
        setLobby(null); // Clear lobby on error
      }
    };

    if (lobbyId) {
      fetchLobbyPlayersAndOwner();
    }

    if (socket) {
      // --- Handle Full Lobby State Updates ---
      socket.on("lobbyState", (data: LobbyStateData & { currentPainterToken?: string | null }) => {
        console.log("Received lobbyState:", data);
        setPlayers(
          data.players.map((p) => ({
            id: Number(p.id),
            username: p.username,

          }))
        );
        if (data.ownerId !== undefined && data.ownerId !== null) {
          updateLobbyState({ lobbyOwner: Number(data.ownerId) });
        }
        if (data.currentPainterToken !== undefined) {
          updateLobbyState({ currentPainterToken: data.currentPainterToken });
        }
      });

      // --- Player Joined ---
      socket.on(
        "playerJoined",
        (newPlayer: { id: string | number; username: string }) => {
          // ... (keep existing optimized logic - ensure ID conversion is consistent) ...
          console.log("Player joined event received:", newPlayer);
          setPlayers((prev) => {
            const newPlayerId = Number(newPlayer.id);
            if (prev.some((p) => p.id === newPlayerId)) return prev;
            return [...prev, { id: newPlayerId, username: newPlayer.username }];
          });
        }
      );

      // --- Player Left ---
      socket.on("playerLeft", (leftPlayer: PlayerLeftData) => {
        // ... (keep existing optimized logic - ensure ID conversion is consistent) ...
        console.log("Player left event received:", leftPlayer);
        setPlayers((prev) => {
          const leftPlayerIdNumber = Number(leftPlayer.id); // Compare numbers
          return prev.filter((p) => p.id !== leftPlayerIdNumber);
        });
        message.info(`${leftPlayer.username || "A player"} left the lobby.`);
      });

      // --- *** NEW: Handle Owner Change Event *** ---
      socket.on("lobbyOwnerChanged", (data: LobbyOwnerChangedData) => {
        console.log(
          `Received lobbyOwnerChanged: New owner is ${data.newOwnerUsername} (${data.newOwnerId})`
        );
        const newOwnerNumericId = Number(data.newOwnerId);
        // Update the local lobby state
        updateLobbyState({ lobbyOwner: newOwnerNumericId });
        message.success(`${data.newOwnerUsername} is now the lobby owner!`);
      });
      // --- Chat Message Handling (No change needed) ---
      socket.on("chatMessage", (message: ChatMessage) => {
        setMessages((prev) => [...prev, message]);
      });

      // --- Error handling ---
      socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err);
        message.error(`Connection failed: ${err.message}`, 5);
      });

                  // --- NEW: Word Selected Listener ---
      socket.on("word-selected", (data: { word: string }) => {
        console.log(`Received word-selected for lobby ${lobbyId}: ${data.word}`);
        setCurrentWord(data.word); // Update currentWord state
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (reason !== "io client disconnect") {
          // Don't show warning on manual leave/nav away
          message.warning("Lost connection to the server.", 3);
        }
      });
    }

    // --- Cleanup ---
    return () => {
      if (socket) {
        socket.off("lobbyState");
        socket.off("playerJoined");
        socket.off("playerLeft");
        socket.off("lobbyOwnerChanged"); // <-- Unregister new listener
        socket.off("chatMessage");
        socket.off("connect_error");
        socket.off("word-selected"); // Unregister word-selected
        socket.off("disconnect");
      }
    };
    // Add updateLobbyState to dependencies
  }, [lobbyId, socket, apiService, currentUserId, updateLobbyState]);


  /* EMERGENCY CODE DO NOT TOUCH LEAVE IT DONT CHANGE!
  const fetchCurrentWord = async () => {
    try {
      const response = await apiService.get<string>(`/lobbies/${lobbyId}/word`);
      setCurrentWord(response);
    } catch (error) {
      console.error("Failed to fetch current word:", error);
    }
  };

  */

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find(
        (p) => p.id.toString() === currentUserId
      )?.username;

      if (chatInput === currentWord) { // Now chatInput (string) is compared to the resolved string
        socket.emit("chatMessage", { lobbyId, message: `${username} GUESSED THE CORRECT WORD!`, username });
        setChatInput("");

      } else{
        socket.emit("chatMessage", { lobbyId, message: chatInput, username });
        setChatInput("");
    }
    }
  };

  return (
    <div className="page-background">
      <div className="player-box">
        {/* Use local lobby state for display */}
        <h1 className="players-chat-title">
          PLAYERS ({players.length}/{lobby?.numOfMaxPlayers || "?"})
        </h1>
        <div className="player-list">
          {players.map((player) => (
            <div
              key={player.id} // Use number ID
              className={`player-entry ${
                // Use string for comparison with currentUserId from localStorage
                String(player.id) === currentUserId ? "player-entry-own" : ""
              }`}
            >
              <div className="player-info">
                <img
                  src={
                    String(player.id) === currentUserId
                      ? localAvatarUrl
                      : "/icons/avatar.png"
                  }
                  alt="Avatar"
                  className="player-avatar"
                />
                <span>{player.username}</span>
              </div>
              {/* Use local lobby state to check owner */}
              {lobby && player.id === lobby.lobbyOwner && (
                <span className="player-owner-indicator" title="Lobby Owner">
                  👑
                </span>
              )}
              
            </div>
          ))}
        </div>
      </div>

      {children}

      {/* ... Chat Box ... */}
      <div className="chat-box">
        <h1 className="players-chat-title">CHAT</h1>
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className="chat-message">
              <span
                style={{ color: getUsernameColor(msg.username) }}
                className="chat-username"
              >
                {msg.username}:
              </span>
              <span className="chat-text"> {msg.message}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input-area">
          <Input
            className="chat-input"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onPressEnter={sendMessage}
            placeholder="Type your message here!"
          />
          <Button className="chat-send-button" onClick={sendMessage}>
            <span role="img" aria-label="send">
              📨
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Layout;
