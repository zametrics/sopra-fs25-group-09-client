"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, message, Input, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';


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
  const [isLeaveModalVisible, setIsLeaveModalVisible] = useState<boolean>(false);


  // State for lobby settings
  const [maxPlayers, setMaxPlayers] = useState<number>(8);
  const [drawTime, setDrawTime] = useState<number>(80);
  const [rounds, setRounds] = useState<number>(3);
  const [language, setLanguage] = useState<string>("english");
  const [type, setType] = useState<string>("standard");
  const [customWords, setCustomWords] = useState<string>("");
  const [useCustomWordsOnly, setUseCustomWordsOnly] = useState<boolean>(false);

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
            apiService.get<PlayerData>(`/users/${id}`).catch(() => ({ id, username: 'Guest' } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(playerData as PlayerData[]);
        }
      } catch (error) {
        console.error('Error fetching lobby:', error);
        message.error('Failed to load lobby information');
      } finally {
        setLoading(false);
      }
    };
  
    if (lobbyId) {
      fetchLobby();
    }
  }, [lobbyId, apiService]);

  //http://localhost:3001/
  //https://socket-server-826256454260.europe-west1.run.app/
useEffect(() => {
  const socketIo = io('https://socket-server-826256454260.europe-west1.run.app/', {
    path: '/api/socket',
  });
  setSocket(socketIo);

  const fetchCurrentUsername = async () => {
    try {
      const userData = await apiService.get<PlayerData>(`/users/${currentUserId}`);
      return userData.username;
    } catch (error) {
      console.error('Error fetching username:', error);
      return 'Guest';
    }
  };

  const joinLobby = async () => {
    const username = await fetchCurrentUsername();
    socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username });
    console.log('Emitted joinLobby:', { lobbyId, userId: currentUserId, username });
  };

  joinLobby();

  socketIo.on('lobbyState', ({ players }) => {
    console.log('lobbyState received:', players);
    setPlayers(
      players.map((p: { id: string; username: string }) => ({
        id: p.id,
        username: p.username,
      }))
    );
  });

  socketIo.on('chatMessage', (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  });

  socketIo.on('playerJoined', () => {

    const fetchLobby = async () => {
      setLoading(true);
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        setLobby(response as LobbyData);
  
        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService.get<PlayerData>(`/users/${id}`).catch(() => ({ id, username: 'Guest' } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(playerData as PlayerData[]);
        }
      } catch (error) {
        console.error('Error fetching lobby:', error);
        message.error('Failed to load lobby information');
      } finally {
        setLoading(false);
      }
    };

    fetchLobby();
    

  });

  socketIo.on('playerLeft', (leftPlayer: PlayerData) => {
    setPlayers((prev) => prev.filter((p) => p.id !== leftPlayer.id));
  });

  return () => {
    socketIo.disconnect();
  };
}, [lobbyId, currentUserId, apiService]);

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

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (!currentUserId || !lobbyId) return;
  
      handleLeaveLobby()
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [socket, currentUserId, lobbyId]);
  
  const handleCancelLeave = () => {
    setIsLeaveModalVisible(false);
  };

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find((p) => p.id.toString() === currentUserId)?.username;
      socket.emit('chatMessage', { lobbyId, message: chatInput, username });
      setChatInput('');
    }
  };

  const startGame = async () => {
    if (!lobby || !currentUserId) return;
    
    // Check if the current user is the lobby owner
    if (Number(currentUserId) !== lobby.lobbyOwner) {
      message.error("Only the lobby owner can start the game");
      return;
    }
    
    // Validate settings
    if (customWords && type === "custom") {
      const words = customWords.split(",").map(word => word.trim()).filter(word => word);
      if (words.length < 10) {
        message.error("Please provide at least 10 custom words");
        return;
      }
      
      if (words.some(word => word.length > 32)) {
        message.error("Words must be 32 characters or less");
        return;
      }
    }
    
    // Make sure we have at least 2 players
    if (players.length < 2) {
      message.error("At least 2 players are required to start the game");
      return;
    }
    
    try {
      setLoading(true);
      
      // Prepare the updated lobby data
      const gameSettings = {
        id: Number(lobbyId),
        lobbyOwner: lobby.lobbyOwner,
        numOfMaxPlayers: maxPlayers,
        playerIds: players.map(p => p.id),
        language: language,
        type: type === "custom" && customWords ? "custom" : type,
        numOfRounds: rounds,
        drawTime: drawTime
      };
      
      // Update lobby in the database
      await apiService.put(`/lobbies/${lobbyId}`, gameSettings);
      
      // Notify all players through socket that the game is starting
      if (socket) {
        socket.emit('gameStarting', { 
          lobbyId, 
          settings: {
            numOfRounds: rounds,
            drawTime: drawTime,
            language: language,
            type: type,
            customWords: type === "custom" ? customWords : null,
            useCustomWordsOnly: useCustomWordsOnly
          }
        });
      }
      
      // Redirect to the game page
      router.push(`/games/${lobbyId}`);
      
    } catch (error) {
      console.error("Error starting game:", error);
      message.error("Failed to start the game");
    } finally {
      setLoading(false);
    }
    console.log("Starting game with settings:", {
      rounds,
      drawTime,
      language,
      type,
      customWords: type === "custom" ? customWords.substring(0, 20) + "..." : null
    });
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
        <div className="player-box">
          Loading...
          </div>
          <div className="game-box">
          Loading...
          </div>
          <div className="chat-box">
          Loading...
          </div>
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
          <Button className= "green-button" onClick={() => router.push('/home')}>
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
              <span>{player.username}</span>
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
          <button className="close-button" onClick={showLeaveConfirmation}>✕</button>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">PLAYERS:</label>
          <input 
            type="range" 
            min={2} 
            max={8} 
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            disabled={Number(currentUserId) !== lobby.lobbyOwner}
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
            disabled={Number(currentUserId) !== lobby.lobbyOwner}
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
            disabled={Number(currentUserId) !== lobby.lobbyOwner}
          />
          <span className="slider-value">{rounds}</span>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">LANGUAGE:</label>
          <div className="wordset-controls">
            <select 
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={Number(currentUserId) !== lobby.lobbyOwner}
            >
              <option value="english">English</option>
              <option value="german">German</option>
              <option value="swissgerman">Schwitzerdütsch</option>
            </select>
          </div>
        </div>
        
        <div className="lobby-setting-group">
          <label className="lobby-label">WORD TYPE:</label>
          <div className="wordset-controls">
            <select 
              value={type}
              onChange={(e) => setType(e.target.value)}
              disabled={Number(currentUserId) !== lobby.lobbyOwner}
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
                  disabled={Number(currentUserId) !== lobby.lobbyOwner}
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
              disabled={Number(currentUserId) !== lobby.lobbyOwner}
            />
          )}
        </div>

        <div className="lobby-actions">
          <button 
            className="green-button" 
            style={{width: 300}}
            onClick={startGame}
            disabled={loading || Number(currentUserId) !== lobby.lobbyOwner}
          >
            {loading ? 'STARTING...' : 'START'}
          </button>

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