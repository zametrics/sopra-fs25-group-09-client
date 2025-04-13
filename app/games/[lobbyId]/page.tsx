"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, Spin, message, Input, Modal } from 'antd';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLeaveModalVisible, setIsLeaveModalVisible] = useState<boolean>(false);

  //PLACEHOLDER WORD
  const wordToGuess = "daniel";

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
    const socketIo = io('https://socket-server-826256454260.europe-west1.run.app/', {
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


  const goBack = () => {
    router.push('/home');
  };

  const showLeaveConfirmation = () => {
      setIsLeaveModalVisible(true);
    };
  
    const handleLeaveLobby = async () => {
      if (!currentUserId || !lobbyId) {
        router.push('/home');
        return;
      }
  
      try {
        setLoading(true);
        
        // Remove player from lobby in database
        // Adding an empty object as the second parameter to satisfy the put method signature
        await apiService.put(`/lobbies/${lobbyId}/leave?playerId=${currentUserId}`, {});
        
        // Notify other players via socket
        if (socket) {
          socket.emit('leaveLobby', { 
            lobbyId, 
            userId: currentUserId 
          });
        }
        
        message.success('You have left the lobby');
        router.push('/home');
      } catch (error) {
        console.error('Error leaving lobby:', error);
        message.error('Failed to leave lobby properly, redirecting anyway');
        router.push('/home');
      } finally {
        setLoading(false);
        setIsLeaveModalVisible(false);
      }
    };
    
    const handleCancelLeave = () => {
      setIsLeaveModalVisible(false);
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
          <h1 className='players-chat-title' style={{marginTop: -10, marginBottom: 30, fontSize: 50}}>Game Not Found</h1>
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
      
      {/* Game Box */}
      <div className="game-box">
      <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
      <h2 className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</h2>

      <button onClick={showLeaveConfirmation}>LEAVE GAME</button>

      {/* Word Display Area */}
      <div className="word-display-area">
        <span className="word-to-guess">
          {/* Ensure uppercase before mapping */}
          {wordToGuess.toLowerCase().split('').map((letter, index) => (
            <span key={index} className="word-letter">{letter}</span>
          ))}
        </span>
      </div>

      <canvas id="drawingCanvas" className="drawing-canvas"></canvas>

      {/* Updated Drawing Tools */}
    <div className='drawing-tools-arrangement'>
      <div className="drawing-tools">
        {/* Color Picker - Use an image now */}
        <button className="tool-button color-picker-btn" aria-label="Choose Color">
          <img src="/icons/color-wheel.svg" alt="Color Picker" className="tool-icon-image" /> {/* <--- USE IMAGE */}
        </button>

        {/* Brush Sizes - Four distinct buttons/divs */}
        <button className="tool-button brush-size brush-size-1 active-tool" aria-label="Brush Size 1"> {/* <--- Added active-tool for example */}
           <div className="brush-dot"></div>
        </button>
        <button className="tool-button brush-size brush-size-2" aria-label="Brush Size 2">
           <div className="brush-dot"></div>
        </button>
        <button className="tool-button brush-size brush-size-3" aria-label="Brush Size 3">
           <div className="brush-dot"></div>
        </button>
        <button className="tool-button brush-size brush-size-4" aria-label="Brush Size 4">
           <div className="brush-dot"></div>
        </button>

        {/* Fill Tool */}
        <button className="tool-button tool-icon" aria-label="Fill Tool">
          <img src="/icons/fill-tool-black.svg" alt="Fill" className="tool-icon-image"/> {/* <--- Ensure black icon */}
          {/* Or use icon library: <FaFillDrip size={24} color="#000" /> */}
        </button>
        </div>
        <div className="drawing-tools">

        {/* Undo Tool */}
        <button className="tool-button tool-icon" aria-label="Undo">
           <img src="/icons/undo-tool-black.svg" alt="Undo" className="tool-icon-image"/> {/* <--- Ensure black icon */}
           {/* Or use icon library: <FaUndo size={24} color="#000" /> */}
        </button>

        {/* Clear Tool (Trash Can) */}
        <button className="tool-button tool-icon" aria-label="Clear Canvas">
           <img src="/icons/trash-tool-black.svg" alt="Clear" className="tool-icon-image"/> {/* <--- Ensure black icon */}
           {/* Or use icon library: <FaTrashAlt size={24} color="#000" /> */}
        </button>
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

    {/* Leave Confirmation Modal */}
    <Modal
        title={<div className="leave-modal-title">Leave Lobby</div>}
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
          style: { background: '#ff3b30', borderColor: '#e02d22', color: 'white' }
        }}
        cancelButtonProps={{ 
          className: "leave-modal-cancel-button",
          style: { backgroundColor: '#f5f5f5', borderColor: '#d9d9d9', color: '#333' }
        }}
      >
        <p className="leave-modal-message">
          Are you sure you want to leave this lobby?
        </p>
      </Modal>

    </div>
  );
};

export default withAuth(LobbyPage);