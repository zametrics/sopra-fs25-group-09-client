"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Card, Typography, Button, Spin, List, Divider, message, Space, Input } from 'antd';
import { CopyOutlined, ArrowLeftOutlined, SendOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';

const { Title, Text } = Typography;

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

  // Initialize Socket.IO
  useEffect(() => {
    const socketIo = io('https://socket-server-826256454260.europe-west1.run.app', {
      path: '/api/socket',
    });
    setSocket(socketIo);

    socketIo.emit('joinLobby', lobbyId);

    socketIo.on('chatMessage', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socketIo.disconnect();
    };
  }, [lobbyId]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const copyLobbyCode = () => {
    navigator.clipboard.writeText(lobbyId).then(() => message.success("Lobby code copied to clipboard!")).catch(() => message.error("Failed to copy lobby code"));
  };

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
      <div className='settings-box'>
        <h1 className= "drawzone-logo-4rem">DRAWZONE</h1>
        <p className='drawzone-subtitle-1-5rem'>Art Battle Royale</p>
        <h2 className='lobby-banner'>Host a lobby</h2>
        <Button className='lobby-banner:after' onClick={goBack}>goBack
        </Button>
          <div>
            <List bordered>
              <List.Item><Text>Max Players: {lobby.numOfMaxPlayers}</Text></List.Item>
              <List.Item><Text>Wordset: {lobby.wordset}</Text></List.Item>
              <List.Item><Text>Rounds: {lobby.numOfRounds}</Text></List.Item>
              <List.Item><Text>Draw Time: {lobby.drawTime} seconds</Text></List.Item>
            </List>
          </div>


        <div>
          <Button className='green-button'>Start</Button>
          <Card type="inner" title="Roomcode:">
          <div>
            <Text>{lobbyId}</Text>
            <Button icon={<CopyOutlined />} onClick={copyLobbyCode}/>
          </div>
        </Card>
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