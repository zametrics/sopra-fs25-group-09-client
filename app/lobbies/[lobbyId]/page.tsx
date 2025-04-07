"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, Spin, message, Input } from 'antd';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';


interface LobbyData {
  id: number;
  numOfMaxPlayers: number;
  playerIds: number[];
  wordset: string;
  numOfRounds: number;
  drawTime: number;
  lobbyOwner: number;
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

const LobbyPage: React.FC = () => {
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
  const localAvatarUrl = typeof window !== "undefined" ? localStorage.getItem("avatarUrl") || "/icons/avatar.png" : "/icons/avatar.png";


// Fetch lobby data
  useEffect(() => {
    const fetchLobby = async () => {
      setLoading(true);
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        setLobby(response as LobbyData);

        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService.get<PlayerData>(`/users/${id}`).catch(() => ({ id, username: 'Unknown Player' } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(playerData as PlayerData[]);
        }
      } catch (error) {
        console.error("Error fetching lobby:", error);
        message.error("Failed to load lobby information");
      } finally {
        setLoading(false);
      }
    };

    if (lobbyId) {
      fetchLobby();
    }
  }, [lobbyId, apiService]);

  //test http://localhost:3001/
  useEffect(() => {
    const socketIo = io('http://localhost:3001/', {
      path: '/api/socket',
    });
    setSocket(socketIo);
  
// Get current user's username from players state or fetch it
const currentUsername = players.find((p) => p.id === Number(currentUserId))?.username ||"unknwon";

// Join lobby with userId and username
socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username: currentUsername });

// Listen for chat messages
socketIo.on('chatMessage', (message: ChatMessage) => {
  setMessages((prev) => [...prev, message]);
});

// Listen for player joining
socketIo.on('playerJoined', (newPlayer: PlayerData) => {
  setPlayers((prev) => {
    const existingPlayer = prev.find((p) => p.id === newPlayer.id);
    if (existingPlayer) {
      // Update existing player if username changes (e.g., on reconnect)
      return prev.map((p) => (p.id === newPlayer.id ? { ...p, username: newPlayer.username } : p));
    }
    return [...prev, newPlayer];
  });
});

  // Listen for player leaving
  socketIo.on('playerLeft', (leftPlayer: PlayerData) => {
    setPlayers((prev) => prev.filter((p) => p.id !== leftPlayer.id));
  });

  return () => {
    socketIo.disconnect();
  };
}, [lobbyId, currentUserId]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function copyLobbyCode() {
    navigator.clipboard.writeText(lobbyId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  }
  const goBack = () => {
    router.push('/home');
  };

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find((p) => p.id === lobby?.lobbyOwner)?.username || 'You';
      socket.emit('chatMessage', { lobbyId, message: chatInput, username });
      setChatInput('');
    }
  };
  
  const colorPool: string[] = [
    '#e6194b', // kräftiges Rot
    '#3cb44b', // kräftiges Grün
    '#4363d8', // kräftiges Blau
    '#f58231', // kräftiges Orange
    '#911eb4', // dunkles Violett
    '#42d4f4', // kräftiges Türkis
    '#f032e6', // sattes Pink
    '#1a1aff', // Royal Blue
    '#008080', // Teal
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

  
  

  //Loading screen
  if (loading) {
    return (
      <div className='page-background'>
        <Spin size="large" tip="Loading lobby information..." />
      </div>
    );
  }

  //No loading screen
  if (!lobby) {
    return (
      <div className='page-background'>
        <div className='login-register-box'>
          <h1 className='players-chat-title' style={{marginTop: -10, marginBottom: 30, fontSize: 50}}>Lobby Not Found</h1>
          <h2 className='players-chat-title'>Lobby {`#${lobbyId}`}</h2>
          <Button className= "green-button" onClick={goBack}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-background">
            <div className="player-box">
  <h1 className="players-chat-title">
    PLAYERS ({players.length}/{lobby.numOfMaxPlayers})
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
          <span>{player.username || 'Unknown Player'}</span>
        </div>
      </div>
    ))}
  </div>
</div>



      

      {/* Settings Box */}
      <div className="settings-box">
        <h1 className="drawzone-logo-4rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-5rem">ART BATTLE ROYALE</p>
        
        <div className="lobby-header">
          <h2 className="lobby-banner">HOST A LOBBY</h2>
          <button className="close-button" onClick={goBack}>✕</button>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">PLAYERS:</label>
          <input type="range" min={2} max={8} value={lobby.numOfMaxPlayers}/>
          <span className="slider-value">{lobby.numOfMaxPlayers}</span>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">DRAWTIME:</label>
          <input type="range" min={15} max={120} step={5} value={lobby.drawTime}/>
          <span className="slider-value">{lobby.drawTime}s</span>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">ROUNDS:</label>
          <input type="range" min={1} max={10} value={lobby.numOfRounds}/>
          <span className="slider-value">{lobby.numOfRounds}</span>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">CUSTOM WORDS:</label>
          <div className="wordset-controls">
            <select>
              <option value="english">Choose wordlist</option>
              <option value="animals">Animals</option>
              <option value="custom">Custom</option>
            </select>
            <label>
              <input type="checkbox" />
              Use custom words only
            </label>
        </div>
        <textarea
          placeholder="Minimum of 10 words. 1–32 characters per word! Separated by a , (comma)"
        />
      </div>
      


      <div className="lobby-actions">
        <button className="green-button" style={{width: 300, marginLeft: 10}}>START</button>

        <div className="roomcode-box">
          <div className="roomcode-label">ROOMCODE:</div>
          <div
            className="roomcode-value"
            onClick={copyLobbyCode}
            title="Click to copy"
          >
            {copied ? 'Copied!' : lobbyId}
          </div>
        </div>

      </div>
        
      </div>



     {/* Chat Box */}
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

export default withAuth(LobbyPage);