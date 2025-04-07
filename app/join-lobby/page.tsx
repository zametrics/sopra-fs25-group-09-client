"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Card, Typography, Button, Input, Alert, Space } from 'antd'; // Use Alert instead of message
import { ArrowLeftOutlined, EnterOutlined } from '@ant-design/icons';
import withAuth from '@/hooks/withAuth';

const { Title, Text } = Typography;

const JoinLobbyPage: React.FC = () => {
  const [lobbyCode, setLobbyCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Add error state
  const [successMessage, setSuccessMessage] = useState<string | null>(null); // Add success state
  const router = useRouter();
  const apiService = useApi();

  const handleJoinLobby = async () => {
    // Reset messages
    setErrorMessage(null);
    setSuccessMessage(null);
    
    // First, validate the lobby code format
    if (!lobbyCode || lobbyCode.trim() === '') {
      setErrorMessage('Please enter a lobby code');
      return;
    }

    // Check if the lobby code is 6 digits
    const codeRegex = /^\d{6}$/;
    if (!codeRegex.test(lobbyCode)) {
      setErrorMessage('Lobby code must be 6 digits');
      return;
    }

    setIsJoining(true);
    
    try {
      // Get the current user's ID
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? JSON.parse(userIdStr) : null;
      
      if (!userId) {
        setErrorMessage("User ID not found. Please log in again.");
        setIsJoining(false);
        return;
      }
      
      // Check if the lobby exists
      try {
        await apiService.get(`/lobbies/${lobbyCode}`);
      } catch (fetchError) {
        console.log("Debug - Fetch error:", fetchError);
        setErrorMessage(`Lobby with code ${lobbyCode} was not found`);
        setIsJoining(false);
        return;
      }
      
      // Try to join the lobby
      try {
        await apiService.put(`/lobbies/${lobbyCode}/join?playerId=${userId}`, {});
        setSuccessMessage(`Successfully joined lobby ${lobbyCode}`);
        
        // Short delay before redirect
        setTimeout(() => {
          router.push(`/lobbies/${lobbyCode}`);
        }, 1000);
      } catch (joinError) {
        console.log("Debug - Join error:", joinError);
        setErrorMessage("Failed to join the lobby. You might already be in it or it's full.");
        setIsJoining(false);
      }
      
    } catch (outerError) {
      console.error("Unexpected outer error:", outerError);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsJoining(false);
    } finally {
      setIsJoining(false);
    }
  };

  const goBack = () => {
    router.push('/home');
  };

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
          maxWidth: '500px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '10px',
          padding: '20px'
        }}
      >
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={goBack}
          style={{ marginBottom: '16px' }}
        >
          Back to Dashboard
        </Button>

        <Title level={2} style={{ textAlign: 'center' }}>Join a Lobby</Title>
        
        {/* Display error message if present */}
        {errorMessage && (
          <Alert
            message={<span style={{ color: '#000000' }}>Error</span>}
            description={<span style={{ color: '#000000' }}>{errorMessage}</span>}
            type="error"
            showIcon
            style={{ marginBottom: '16px', color:'black'}}
            closable
            onClose={() => setErrorMessage(null)}
          />
        )}
        
        {/* Display success message if present */}
        {successMessage && (
          <Alert
            message={<span style={{ color: '#000000' }}>Success</span>}
            description={<span style={{ color: '#000000' }}>{successMessage}</span>}
            type="success"
            showIcon
            style={{ marginBottom: '16px', color:'black'}}
          />
        )}
        
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text>Enter the 6-digit lobby code:</Text>
            <Input
              size="large"
              placeholder="Enter lobby code"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value)}
              style={{ marginTop: '8px'}}
              onPressEnter={handleJoinLobby}
              maxLength={6}
            />
          </div>
          
          <Button 
            type="primary" 
            icon={<EnterOutlined />}
            loading={isJoining}
            onClick={handleJoinLobby}
            size="large"
            block
          >
            Join Lobby
          </Button>
        </Space>
      </Card>
    </div>
  );
};

export default withAuth(JoinLobbyPage);