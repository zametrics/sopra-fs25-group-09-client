"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Typography, Button, Input, Spin, Modal} from 'antd'; // Removed Space as we use custom layout
import withAuth from '@/hooks/withAuth';
import Image from 'next/image';

// --- Import necessary CSS ---
import './JoinLobbyPage.css'; // Styles for this component

const { Text } = Typography; // Only Text needed

// Define an interface for the Lobby data structure based on your backend DTO
// Adjust based on your ACTUAL API response structure
interface Lobby {
  id: string; // Assuming 'id' is the 6-digit lobby code here
  lobbyOwner: number; // Or potentially an object with owner info
  numOfMaxPlayers: number;
  playerIds: number[]; // Assuming it's an array of player IDs
  language: string;
  numOfRounds: number;
  drawTime: number;
  type: string;
  // Add hostUsername if available from backend, otherwise derive it
  hostUsername?: string; // optionaler Hostname aus User-Endpoint
}

const LOBBIES_PER_PAGE = 6;

const JoinLobbyPage: React.FC = () => {
  const [lobbyCodeInput, setLobbyCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joiningLobbyCode, setJoiningLobbyCode] = useState<string | null>(null); // Track which join is active
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isErrorModalVisible, setIsErrorModalVisible] = useState(false); // New state for modal
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  
  const router = useRouter();
  const apiService = useApi();

  useEffect(() => {
    const fetchLobbies = async () => {
      setIsLoadingLobbies(true);
      setErrorMessage(null);
      try {
        const response = await apiService.get<Lobby[]>('/lobbies');
        // **Important**: Ensure the response structure matches the Lobby interface
        // You might need to map the response if names differ
        setLobbies(response || []);
      } catch (error) {
        console.error("Failed to fetch lobbies:", error);
        setErrorMessage("Could not load active lobbies. Please try again later.");
        setLobbies([]);
      } finally {
        setIsLoadingLobbies(false);
      }
    };

    fetchLobbies();
  }, [apiService]);

  useEffect(() => {
    const fetchOwnerUsernames = async () => {
      const uniqueOwnerIds = [...new Set(lobbies.map(l => l.lobbyOwner))];
      const ownerMap: Record<number, string> = {};
  
      await Promise.all(uniqueOwnerIds.map(async (ownerId) => {
        try {
          const userRes = await apiService.get<{ username: string }>(`/users/${ownerId}`);
          ownerMap[ownerId] = userRes.username;
        } catch (err) {
          console.warn(err || "Could not fetch user with ID", ownerId);
          ownerMap[ownerId] = "Unknown";
        }
      }));
  
      setLobbies(prev =>
        prev.map(lobby => ({
          ...lobby,
          hostUsername: ownerMap[lobby.lobbyOwner] || "Unknown"
        }))
      );
    };
  
    if (lobbies.length > 0) {
      fetchOwnerUsernames();
    }
  }, [lobbies]);
  

  const joinLobby = async (codeToJoin: string) => {
    setErrorMessage(null); // Clear previous errors first
    setIsErrorModalVisible(false); // Hide any existing modal

    if (!codeToJoin || codeToJoin.trim() === '' || !/^\d{6}$/.test(codeToJoin)) {
      setErrorMessage('Invalid lobby code format (must be 6 digits)');
      setIsErrorModalVisible(true); // Show modal for format error
      return;
    }

    setIsJoining(true);
    setJoiningLobbyCode(codeToJoin);

    try {
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? parseInt(JSON.parse(userIdStr), 10) : null;

      if (!userId) {
        setErrorMessage("User ID not found. Please log in again.");
        setIsErrorModalVisible(true); // Show modal
        setIsJoining(false);
        setJoiningLobbyCode(null);
        return;
      }

      // Attempt to join
      try {
        await apiService.put(`/lobbies/${codeToJoin}/join?playerId=${userId}`, {});
        setTimeout(() => {
          router.push(`/lobbies/${codeToJoin}`);
        }, 1000);
      } catch (joinError) { // Explicitly type joinError if possible
         console.error("Debug - Join error:", joinError);
         // More specific error messages based on potential API responses
         const errorDetail = "Failed to join the lobby. It might be full, already started, or you might already be in it.";

         setErrorMessage(errorDetail);
         setIsErrorModalVisible(true); // Show modal
         setIsJoining(false);
         setJoiningLobbyCode(null);
      }

    } catch (outerError) {
      console.error("Unexpected error during join:", outerError);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsErrorModalVisible(true); // Show modal
      setIsJoining(false);
      setJoiningLobbyCode(null);
    }
    // Removed finally block's state resets as they are handled within error/success paths
  };

  const handleJoinByInput = () => {
    joinLobby(lobbyCodeInput);
  };

  const handleJoinFromList = (lobbyCode: string) => {
    joinLobby(lobbyCode);
  };

  const goBack = () => {
    router.push('/home');
  };

  const totalPages = Math.ceil(lobbies.length / LOBBIES_PER_PAGE);
  const startIndex = (currentPage - 1) * LOBBIES_PER_PAGE;
  const endIndex = startIndex + LOBBIES_PER_PAGE;
  const currentLobbies = lobbies.slice(startIndex, endIndex);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  const isRoomCodeValid = /^\d{6}$/.test(lobbyCodeInput);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <div className='page-background'>
      <div className='settings-box join-lobby-container'>

        <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</p>

        <div className="lobby-header" style={{ marginTop: 4 }}>
          <h2 className="lobby-banner">JOIN AN ACTIVE LOBBY</h2>
          <button className="close-button" onClick={goBack}>✕</button>
        </div>

        {/* --- Lobby List Area --- */}
        <div className="lobby-list-area">
          {isLoadingLobbies ? (
            <div className="loading-lobbies"><Spin size="large" /><Text>Loading lobbies...</Text></div>
          ) : lobbies.length === 0 && !errorMessage ? (
             <div className="no-lobbies-found"><Text>No active lobbies found.</Text><Text>Why not create one?</Text></div>
          ) : (
            <div className="lobby-list">
              {currentLobbies.map((lobby) => {
                 // Derive host username (replace with actual data if available)
                 const hostUsername = lobby.hostUsername || "Loading...";
                 const currentPlayers = lobby.playerIds?.length || 0; // Safely get player count
                 const lobbyCode = lobby.id; // Assuming lobby.id is the code

                 return (
                    <div key={lobbyCode} className='lobby-entry-container'>
                    <div className="lobby-list-entry">
                      {/* Info Section (Left) */}
                      <div className="lobby-list-info">
                        <span className="lobby-host-name">{hostUsername}</span>
                        <span className="lobby-status-text">WAITING FOR PLAYERS..</span>
                        <span className="lobby-player-count">{`${currentPlayers}/${lobby.numOfMaxPlayers}`}</span>
                      </div>
                    </div>
                    <div className="lobby-list-actions">
                    <Button
                       className="list-join-button" // Specific class for list JOIN
                       onClick={() => handleJoinFromList(lobbyCode.toString())}
                       loading={isJoining && joiningLobbyCode === lobbyCode} // Show loading only on this button
                       disabled={isJoining} // Disable all joins while one is in progress
                    >
                       JOIN
                       <img src="/icons/play_arrow_orange.svg" alt="" width={20} height={20} className="list-join-icon"/>
                    </Button>
                    <Button
                       className="list-spectate-button" // Specific class for list SPECTATE
                       disabled={true} // Spectate not implemented
                       // onClick={() => handleSpectate(lobbyCode)}
                       aria-label="Spectate" // For accessibility
                    >
                       <img src="/icons/visibility_pink.svg" alt="" width={20} height={20} className="list-spectate-icon"/>
                    </Button>
                 </div>
                 </div>
                 );
              })}
            </div>
          )}
        </div>


        {/* --- Room Code Input (Always Visible) --- */}
        <div className="roomcode-join-area">
          <Input
            className="roomcode-input-bottom" // Use specific class
            placeholder="ENTER ROOMCODE"
            value={lobbyCodeInput}
            onChange={(e) => setLobbyCodeInput(e.target.value.replace(/\D/g, ''))}
            onPressEnter={handleJoinByInput}
            maxLength={6}
            disabled={isJoining}
          />
          <Button
            // Conditionally apply classes for grey/green state
            className={`roomcode-join-button-bottom ${isRoomCodeValid ? 'join-button-active' : 'join-button-inactive'}`}
            loading={isJoining && joiningLobbyCode === lobbyCodeInput} // Show loading only on this button
            onClick={handleJoinByInput}
            disabled={isJoining || !isRoomCodeValid} // Disable if joining or code is invalid
          >
            JOIN
          </Button>
        </div>

        {/* --- Pagination (Always Visible Below Input) --- */}
        {/* Render pagination even if totalPages <= 1 to show the controls, but disable buttons */}
        <div className="pagination-controls">
            <Button
              className={`pagination-button ${canGoPrev ? 'pagination-button-active' : 'pagination-button-inactive'}`}
              onClick={handlePreviousPage}
              disabled={!canGoPrev || isJoining} // Also disable while joining
            >
               <Image src={canGoPrev ? "/icons/arrow_back_white.svg" : "/icons/arrow_back_grey.svg"} alt="Previous" width={20} height={20} />
               PREVIOUS
            </Button>
            <span className="page-info">{totalPages > 0 ? `${currentPage}/${totalPages}` : '0/0'}</span>
            <Button
              className={`pagination-button ${canGoNext ? 'pagination-button-active' : 'pagination-button-inactive'}`}
              onClick={handleNextPage}
              disabled={!canGoNext || isJoining} // Also disable while joining
            >
               NEXT
               <Image src={canGoNext ? "/icons/arrow_forward_white.svg" : "/icons/arrow_forward_grey.svg"} alt="Next" width={20} height={20} />
            </Button>
          </div>

          {/* --- Error Modal --- */}
        <Modal
          title={<span style={{ fontWeight: 'bold', color: '#D32F2F' }}>Error Joining Lobby</span>} // Example styling
          open={isErrorModalVisible}
          onOk={() => setIsErrorModalVisible(false)} // Close modal on OK
          onCancel={() => setIsErrorModalVisible(false)} // Close modal on X or Esc
          centered // Display modal in the center
          footer={[ // Customize footer button
            <Button
              key="ok"
              type="primary" // Or default
              onClick={() => setIsErrorModalVisible(false)}
              style={{ backgroundColor: '#D32F2F', borderColor: '#D32F2F' }} // Example button styling
            >
              OK
            </Button>,
          ]}
        >
          <p style={{ fontSize: '1rem', color: '#333' }}>{errorMessage}</p>
        </Modal>

      </div>
    </div>
  );
};

// --- Create necessary icon files in public/icons/ ---
// play_arrow_orange.svg (Orange play icon from template)
// visibility_pink.svg (Pink eye icon from template)
// arrow_back_white.svg (White left arrow)
// arrow_back_grey.svg (Grey left arrow)
// arrow_forward_white.svg (White right arrow)
// arrow_forward_grey.svg (Grey right arrow)

export default withAuth(JoinLobbyPage);