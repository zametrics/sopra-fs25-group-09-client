"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, message, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';
import Layout from '@/utils/layout';

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

const LobbyPage: React.FC = () => {
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [copied, setCopied] = useState(false);
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

  // Socket setup
  //http://localhost:3001 --- "https://socket-server-826256454260.europe-west1.run.app/" { path: "/api/socket" }
useEffect(() => {
  const socketIo = io('http://localhost:3001/', {
    path: '/api/socket',
  });
  setSocket(socketIo);

  const fetchCurrentUsername = async () => {
    try {
      const userData = await apiService.get<{ id: number; username: string }>(`/users/${currentUserId}`);
      return userData.username;
    } catch (error) {
      console.error('Error fetching username:', error);
      return 'Guest';
    }
  };

  const joinLobby = async () => {
    const username = await fetchCurrentUsername();
    socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username });
  };

  joinLobby();

  // Listen for gameStarting event to redirect all players
  socketIo.on('gameStarting', ({ lobbyId: receivedLobbyId }) => {
    if (receivedLobbyId === lobbyId) {
      apiService.put(
        `/lobbies/${lobbyId}/join?playerId=${currentUserId}`,
        {}
      );
      router.push(`/games/${lobbyId}`);
    }
  });

  return () => {
    socketIo.disconnect();
  };
}, [lobbyId, currentUserId, apiService, router]);

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
      await apiService.put(`/lobbies/${lobbyId}/leave?playerId=${currentUserId}`, {});
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

  const startGame = async () => {
    if (!lobby || !currentUserId) return;
    
    if (Number(currentUserId) !== lobby.lobbyOwner) {
      message.error("Only the lobby owner can start the game");
      return;
    }
    
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
    
    try {
      setLoading(true);
      
      const gameSettings = {
        id: Number(lobbyId),
        lobbyOwner: lobby.lobbyOwner,
        numOfMaxPlayers: maxPlayers,
        playerIds: lobby.playerIds,
        language: language,
        type: type === "custom" && customWords ? "custom" : type,
        numOfRounds: rounds,
        drawTime: drawTime
      };
      
      await apiService.put(`/lobbies/${lobbyId}`, gameSettings);
      
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
      
      router.push(`/games/${lobbyId}`);
      
    } catch (error) {
      console.error("Error starting game:", error);
      message.error("Failed to start the game");
    } finally {
      setLoading(false);
    }
  };

  // Loading screen
  if (loading) {
    return (
      <Layout socket={socket} lobbyId={lobbyId} currentUserId={currentUserId} localAvatarUrl={localAvatarUrl} lobby={lobby}>
        <div className="game-box">
          Loading...
        </div>
      </Layout>
    );
  }

  // No loading screen
  if (!lobby) {
    return (
      <Layout socket={socket} lobbyId={lobbyId} currentUserId={currentUserId} localAvatarUrl={localAvatarUrl} lobby={null}>
        <div className='login-register-box'>
          <h1 className='players-chat-title' style={{marginTop: -10, marginBottom: 30, fontSize: 50}}>Lobby Not Found</h1>
          <h2 className='players-chat-title'>Lobby {`#${lobbyId}`}</h2>
          <Button className="green-button" onClick={() => router.push('/home')}>
            Back to home
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout socket={socket} lobbyId={lobbyId} currentUserId={currentUserId} localAvatarUrl={localAvatarUrl} lobby={lobby}>
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
    </Layout>
  );
};

export default withAuth(LobbyPage);