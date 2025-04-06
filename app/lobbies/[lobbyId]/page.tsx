"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Card, Typography, Button, Spin, List, Divider, message, Space } from 'antd';
import { CopyOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';

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

const LobbyPage: React.FC = () => {
  const params = useParams();
  const lobbyId = params.lobbyId;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<PlayerData[]>([]);

  useEffect(() => {
    const fetchLobby = async () => {
      setLoading(true);
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        setLobby(response as LobbyData);
        
        // Fetch player details if there are any playerIds
        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) => 
            apiService.get<PlayerData>(`/users/${id}`)
              .catch(() => ({ id, username: 'Unknown Player' } as PlayerData))
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

  const copyLobbyCode = () => {
    navigator.clipboard.writeText(String(lobbyId))
      .then(() => message.success("Lobby code copied to clipboard!"))
      .catch(() => message.error("Failed to copy lobby code"));
  };

  const goBack = () => {
    router.push('/home');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Loading lobby information..." />
      </div>
    );
  }

  if (!lobby) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Card>
          <Title level={3}>Lobby Not Found</Title>
          <Text>The lobby you&apos;re looking for doesn&apos;t exist or has been closed.</Text>
          <Button onClick={goBack} type="primary" style={{ marginTop: 16 }}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '2rem',
      background: `url(/images/background.jpg) no-repeat center center/cover`,
    }}>
      <Card 
        style={{ 
          width: '80%', 
          maxWidth: '800px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '10px',
        }}
      >
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={goBack}
          style={{ marginBottom: '16px' }}
        >
          Back to Dashboard
        </Button>

        <Title level={2}>Lobby #{lobbyId}</Title>
        
        <Card type="inner" title="Share this code with friends to join">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
            <Title level={1} style={{ margin: 0, color: '#1890ff' }}>{lobbyId}</Title>
            <Button 
              icon={<CopyOutlined />} 
              onClick={copyLobbyCode} 
              type="text"
              size="large"
              style={{ marginLeft: '10px' }}
            />
          </div>
        </Card>
        
        <Divider />
        
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text strong>Game Settings:</Text>
            <List bordered style={{ marginTop: '10px' }}>
              <List.Item>
                <Text>Max Players: {lobby.numOfMaxPlayers}</Text>
              </List.Item>
              <List.Item>
                <Text>Wordset: {lobby.wordset}</Text>
              </List.Item>
              <List.Item>
                <Text>Rounds: {lobby.numOfRounds}</Text>
              </List.Item>
              <List.Item>
                <Text>Draw Time: {lobby.drawTime} seconds</Text>
              </List.Item>
            </List>
          </div>
          
          <div>
            <Text strong>Players ({players.length}/{lobby.numOfMaxPlayers}):</Text>
            <List
              bordered
              dataSource={players}
              style={{ marginTop: '10px' }}
              renderItem={(player) => (
                <List.Item>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    {player.id === lobby.lobbyOwner && (
                      <Text type="success" style={{ marginRight: '8px' }}>👑</Text>
                    )}
                    <Text>{player.username || 'Unknown Player'}</Text>
                  </div>
                </List.Item>
              )}
            />
          </div>
        </Space>
        
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
          <Button type="primary" size="large">
            Start Game
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default withAuth(LobbyPage);