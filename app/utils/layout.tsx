"use client";

import React, { useEffect, useState, useRef } from "react";
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
  currentUserId: string | null;
  localAvatarUrl: string;
  lobby: LobbyData | null;
}

interface PlayerLeftData {
  id: string | number; // ID might be string or number from server
  username: string;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  socket,
  lobbyId,
  currentUserId,
  localAvatarUrl,
  lobby,
}) => {
  const apiService = useApi();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Fetch initial players and handle socket events
  useEffect(() => {
    const fetchLobbyPlayers = async () => {
      // ... (keep this function as is for initial load) ...
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService
              .get<PlayerData>(`/users/${id}`)
              .catch(() => ({ id, username: "Guest" } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          // Ensure consistent types if necessary upon initial fetch
          setPlayers(
            playerData.map((p) => ({ ...p, id: Number(p.id) })) as PlayerData[]
          );
        } else {
          setPlayers([]); // Clear players if lobby is empty
        }
      } catch (error) {
        console.error("Error fetching lobby players:", error);
        // message.error("Failed to load players"); // Consider removing or making less intrusive
        setPlayers([]); // Clear players on error
      } finally {
        // Optional: handle loading state
      }
    };

    if (lobbyId) {
      fetchLobbyPlayers();
    }

    if (socket) {
      // --- Lobby State Update (Usually on join) ---
      socket.on(
        "lobbyState",
        ({
          players: receivedPlayers,
        }: {
          players: { id: string; username: string }[];
        }) => {
          // Make sure the IDs are numbers, matching PlayerData interface
          setPlayers(
            receivedPlayers.map((p) => ({
              id: Number(p.id), // Convert ID to number
              username: p.username,
            }))
          );
        }
      );

      // --- Chat Message Handling (No change needed) ---
      socket.on("chatMessage", (message: ChatMessage) => {
        setMessages((prev) => [...prev, message]);
      });

      // --- Player Joined Handling (Optimized) ---
      socket.on(
        "playerJoined",
        (newPlayer: { id: string | number; username: string }) => {
          console.log("Player joined event received:", newPlayer);
          setPlayers((prev) => {
            // Ensure ID is treated consistently (e.g., as number)
            const newPlayerId = Number(newPlayer.id);
            // Avoid adding duplicates if already present
            if (prev.some((p) => p.id === newPlayerId)) {
              return prev;
            }
            // Add the new player
            return [...prev, { id: newPlayerId, username: newPlayer.username }];
          });
          // fetchLobbyPlayers(); // REMOVED redundant fetch
        }
      );

      // --- Player Left Handling (MODIFIED) ---
      socket.on("playerLeft", (leftPlayer: PlayerLeftData) => {
        console.log("Player left event received:", leftPlayer);
        setPlayers((prev) => {
          // Filter out the player who left. Compare IDs consistently.
          // Convert both to string or number for reliable comparison.
          const leftPlayerIdString = String(leftPlayer.id);
          return prev.filter((p) => String(p.id) !== leftPlayerIdString);
        });
        // fetchLobbyPlayers(); // <<--- REMOVED THIS LINE ---<<
        message.info(`${leftPlayer.username || "A player"} left the lobby.`); // Optional feedback
      });

      // --- Error handling ---
      socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err);
        message.error(`Connection failed: ${err.message}`, 5);
      });

      socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (reason !== "io client disconnect") {
          // Don't show warning on manual leave/nav away
          message.warning("Lost connection to the server.", 3);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off("lobbyState");
        socket.off("chatMessage");
        socket.off("playerJoined");
        socket.off("playerLeft");
      }
    };
  }, [lobbyId, socket, apiService, currentUserId]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find(
        (p) => p.id.toString() === currentUserId
      )?.username;
      socket.emit("chatMessage", { lobbyId, message: chatInput, username });
      setChatInput("");
    }
  };

  return (
    <div className="page-background">
      <div className="player-box">
        <h1 className="players-chat-title">
          PLAYERS ({players.length}/{lobby?.numOfMaxPlayers || "?"}){" "}
          {/* Use ? if lobby might be null */}
        </h1>
        <div className="player-list">
          {players.map((player) => (
            <div
              key={player.id} // Use the number ID as key
              className={`player-entry ${
                // Compare consistently (e.g., both as strings)
                String(player.id) === String(currentUserId)
                  ? "player-entry-own"
                  : ""
              }`}
            >
              <div className="player-info">
                <img
                  src={
                    // Compare consistently
                    String(player.id) === String(currentUserId)
                      ? localAvatarUrl
                      : "/icons/avatar.png"
                  }
                  alt="Avatar"
                  className="player-avatar"
                />
                <span>{player.username}</span>
              </div>
              {/* Optional: Add owner indicator based on lobby.lobbyOwner */}
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
