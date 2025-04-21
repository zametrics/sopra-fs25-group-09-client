"use client";

import React, { useEffect, useState, useRef } from 'react';
import { Button, Input, message } from 'antd';
import { Socket } from 'socket.io-client';
import { useApi } from '@/hooks/useApi';

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

const Layout: React.FC<LayoutProps> = ({ children, socket, lobbyId, currentUserId, localAvatarUrl, lobby }) => {
  const apiService = useApi();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const colorPool: string[] = [
    '#e6194b', '#3cb44b', '#4363d8', '#f58231',
    '#911eb4', '#42d4f4', '#f032e6', '#1a1aff', '#008080',
  ];

  const usernameColorsRef = useRef<{ [key: string]: string }>({});

  function getUsernameColor(username: string): string {
    const usernameColors = usernameColorsRef.current;

    if (!username || typeof username !== 'string') return 'black';

    if (usernameColors[username]) {
      return usernameColors[username];
    }

    const availableColors = colorPool.filter(
      (color) => !Object.values(usernameColors).includes(color)
    );

    const newColor =
      availableColors.length > 0
        ? availableColors[Math.floor(Math.random() * availableColors.length)]
        : '#' + Math.floor(Math.random() * 16777215).toString(16);

    usernameColors[username] = newColor;
    return newColor;
  }

  // Fetch initial players and handle socket events
  useEffect(() => {
    const fetchLobbyPlayers = async () => {
      setLoading(true);
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService.get<PlayerData>(`/users/${id}`).catch(() => ({ id, username: 'Guest' } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(playerData as PlayerData[]);
        }
      } catch (error) {
        console.error('Error fetching lobby players:', error);
        message.error('Failed to load players');
      } finally {
        setLoading(false);
      }
    };

    if (lobbyId) {
      fetchLobbyPlayers();
    }

    if (socket) {
      socket.on('lobbyState', ({ players }) => {
        setPlayers(
          players.map((p: { id: string; username: string }) => ({
            id: p.id,
            username: p.username,
          }))
        );
      });

      socket.on('chatMessage', (message: ChatMessage) => {
        setMessages((prev) => [...prev, message]);
      });

      socket.on('playerJoined', () => {
        fetchLobbyPlayers();
      });

      socket.on('playerLeft', (leftPlayer: PlayerData) => {
        setPlayers((prev) => prev.filter((p) => p.id !== leftPlayer.id));
        fetchLobbyPlayers();
      });
    }

    return () => {
      if (socket) {
        socket.off('lobbyState');
        socket.off('chatMessage');
        socket.off('playerJoined');
        socket.off('playerLeft');
      }
    };
  }, [lobbyId, socket, apiService]);

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find((p) => p.id.toString() === currentUserId)?.username;
      socket.emit('chatMessage', { lobbyId, message: chatInput, username });
      setChatInput('');
    }
  };

  return (
    <div className="page-background">
      <div className="player-box">
        <h1 className="players-chat-title">
          PLAYERS ({players.length}/{lobby?.numOfMaxPlayers || 8})
        </h1>
        <div className="player-list">
          {players.map((player) => (
            <div
              key={player.id}
              className={`player-entry ${player.id.toString() === currentUserId ? 'player-entry-own' : ''}`}
            >
              <div className="player-info">
                <img
                  src={player.id.toString() === currentUserId ? localAvatarUrl : '/icons/avatar.png'}
                  alt="Avatar"
                  className="player-avatar"
                />
                <span>{player.username}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {children}

      <div className="chat-box">
        <h1 className="players-chat-title">CHAT</h1>
        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className="chat-message">
              <span style={{ color: getUsernameColor(msg.username) }} className="chat-username">
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
            <span role="img" aria-label="send">📨</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Layout;