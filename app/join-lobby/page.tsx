"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, Input, Alert, Space } from 'antd'; // Use Alert instead of message
import withAuth from '@/hooks/withAuth';


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
    <div className='page-background'>
      <div className='settings-box'>

        <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</p>

        <div className="lobby-header" style= {{marginTop: 4}}>
          <h2 className="lobby-banner">JOIN AN ACTIVE LOBBY</h2>
          <button className="close-button" onClick={goBack}>✕</button>
        </div>

        
        {/* Display error message if present */}
        {errorMessage && (
          <Alert
            message={<span style={{ color: '#000000' }}>Error</span>}
            description={<span style={{ color: '#000000' }}>{errorMessage}</span>}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMessage(null)}
          />
        )}
        
        {/* Display success message if present */}
        {successMessage && (
          <Alert
            message={<span>Success</span>}
            description={<span>{successMessage}</span>}
            type="success"
            showIcon
          />
        )}
        
        <Space>
          <div>
            <Input
              placeholder="ENTER ROOMCODE"
              value={lobbyCode}
              onChange={(e) => setLobbyCode(e.target.value)}
              onPressEnter={handleJoinLobby}
              maxLength={6}
            />
          </div>
          
          <Button 
            loading={isJoining}
            onClick={handleJoinLobby}
            block
          >
            JOIN
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default withAuth(JoinLobbyPage);