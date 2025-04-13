"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Typography, Button, Input, Alert, Spin } from 'antd'; // Added Spin for loading
import withAuth from '@/hooks/withAuth';
import Image from 'next/image'; // Import Image component

// --- Import necessary CSS ---
import './JoinLobbyPage.css'; // Create this new CSS file

const { Text } = Typography;

// Define an interface for the Lobby data structure based on your backend DTO
interface Lobby {
  id: string;
  lobbyOwner: number;
  numOfMaxPlayers: number;
  playerIds: Int32Array;
  language: string;
  numOfRounds: number;
  drawTime: number;
  type: string;
  // Add other relevant fields if needed
}

const LOBBIES_PER_PAGE = 6; // Number of lobbies to show per page

const JoinLobbyPage: React.FC = () => {
  const [lobbyCodeInput, setLobbyCodeInput] = useState(''); // Renamed from lobbyCode
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [isLoadingLobbies, setIsLoadingLobbies] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const router = useRouter();
  const apiService = useApi();

  // --- Fetch Lobbies ---
  useEffect(() => {
    const fetchLobbies = async () => {
      setIsLoadingLobbies(true);
      setErrorMessage(null); // Clear previous errors
      try {
        // Assuming your API endpoint is /lobbies and returns Lobby[]
        // Adjust the endpoint and expected structure if needed
        const response = await apiService.get<Lobby[]>('/lobbies');
        // Filter out potentially full or inactive lobbies if necessary on the frontend,
        // though ideally the backend should provide only joinable lobbies.
        setLobbies(response || []);
      } catch (error) {
        console.error("Failed to fetch lobbies:", error);
        setErrorMessage("Could not load active lobbies. Please try again later.");
        setLobbies([]); // Clear lobbies on error
      } finally {
        setIsLoadingLobbies(false);
      }
    };

    fetchLobbies();
  }, [apiService]); // Dependency array ensures this runs once on mount

  // --- Join Logic (Generalized) ---
  const joinLobby = async (codeToJoin: string) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!codeToJoin || codeToJoin.trim() === '' || !/^\d{6}$/.test(codeToJoin)) {
      setErrorMessage('Invalid lobby code format (must be 6 digits)');
      return;
    }

    setIsJoining(true); // Use a specific state if needed, or reuse isJoining

    try {
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? JSON.parse(userIdStr) : null;

      if (!userId) {
        setErrorMessage("User ID not found. Please log in again.");
        setIsJoining(false);
        return;
      }

      // Check if lobby exists (optional, join call might handle this)
      // You might skip this explicit check if the join endpoint handles "not found" gracefully.
      try {
        await apiService.get(`/lobbies/${codeToJoin}`);
      } catch (fetchError) {
        console.error("Debug - Fetch error during join check:", fetchError);
        setErrorMessage(`Lobby with code ${codeToJoin} was not found.`);
        setIsJoining(false);
        return;
      }

      // Attempt to join
      try {
        await apiService.put(`/lobbies/${codeToJoin}/join?playerId=${userId}`, {});
        setSuccessMessage(`Successfully joined lobby ${codeToJoin}`);
        setTimeout(() => {
          router.push(`/lobbies/${codeToJoin}`);
        }, 1000); // Redirect after success
      } catch (joinError) { // Catch specific errors if possible
         console.error("Debug - Join error:", joinError);
         // Provide more specific feedback if the API returns details
         const errorDetail = "Failed to join the lobby. It might be full, already started, or you might already be in it.";
         setErrorMessage(errorDetail);
         setIsJoining(false);
      }

    } catch (outerError) {
      console.error("Unexpected error during join:", outerError);
      setErrorMessage("An unexpected error occurred. Please try again.");
      setIsJoining(false);
    } finally {
       // Potentially set a specific loading state for joining back to false
       // setIsJoining(false); // Keep it true until redirect or final error
    }
  };

  // --- Handler for the bottom input field join ---
  const handleJoinByInput = () => {
    joinLobby(lobbyCodeInput);
  };

  // --- Handler for the join buttons in the list ---
  const handleJoinFromList = (lobbyCode: string) => {
    joinLobby(lobbyCode);
  };

  const goBack = () => {
    router.push('/home');
  };

  // --- Pagination Logic ---
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


  return (
    <div className='page-background'>
      {/* Use settings-box or a potentially wider container if needed */}
      <div className='settings-box join-lobby-container'> {/* Added join-lobby-container class */}

        <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
        <p className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</p>

        <div className="lobby-header" style={{ marginTop: 4 }}>
          <h2 className="lobby-banner">JOIN AN ACTIVE LOBBY</h2>
          <button className="close-button" onClick={goBack}>✕</button>
        </div>

        {/* --- Lobby List --- */}
        <div className="lobby-list-area">
          {isLoadingLobbies ? (
            <div className="loading-lobbies">
              <Spin size="large" />
              <Text>Loading lobbies...</Text>
            </div>
          ) : lobbies.length === 0 && !errorMessage ? (
             <div className="no-lobbies-found">
                 <Text>No active lobbies found.</Text>
                 <Text>Why not create one?</Text>
             </div>
          ) : (
            <div className="lobby-list">
              {currentLobbies.map((lobby) => (
                <div key={lobby.id} className="lobby-list-entry">
                  <div className="lobby-list-info">
                    <span className="lobby-host-name">{`${lobby.id}`}</span> {/* Fallback name */}
                    <span className="lobby-status-text">WAITING FOR PLAYERS..</span>
                  </div>
                  <div className="lobby-list-details">
                    <span className="lobby-player-count">{`${lobby.playerIds.length}/${lobby.numOfMaxPlayers}`}</span>
                    {/* Use Button components for better consistency and accessibility */}
                    <Button
                      className="lobby-join-button"
                      onClick={() => handleJoinFromList(lobby.id.toString())}
                      disabled={isJoining} // Disable while any join is in progress
                      icon={<Image src="/icons/play_arrow.svg" alt="Join" width={18} height={18} />} // Add play icon
                     >
                       JOIN
                    </Button>
                    <Button
                      className="lobby-spectate-button"
                      // onClick={() => handleSpectate(lobby.lobbyCode)} // Add spectate handler if needed
                       disabled={true} // Disable if spectate isn't implemented
                       icon={<Image src="/icons/visibility.svg" alt="Spectate" width={20} height={20}/>} // Add eye icon
                     >
                        {/* Optionally add text or keep it icon-only */}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

         {/* --- Error/Success Messages --- */}
         {errorMessage && (
          <Alert
            className="join-lobby-alert"
            message={<span style={{ color: '#a81010' }}>Error</span>} // Darker red for contrast
            description={<span style={{ color: '#000000' }}>{errorMessage}</span>}
            type="error"
            showIcon
            closable
            onClose={() => setErrorMessage(null)}
          />
        )}
        {successMessage && (
          <Alert
            className="join-lobby-alert"
            message={<span style={{ color: '#0d6316' }}>Success</span>} // Darker green
            description={<span style={{ color: '#000000' }}>{successMessage}</span>}
            type="success"
            showIcon
            // No need for closable on success, it disappears on redirect
          />
        )}


        {/* --- Pagination --- */}
        {totalPages > 1 && (
          <div className="pagination-controls">
            <Button
              className="pagination-button prev"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
              icon={<Image src="/icons/arrow_back.svg" alt="Previous" width={20} height={20} />}
            >
              PREVIOUS
            </Button>
            <span className="page-info">{`${currentPage}/${totalPages}`}</span>
            <Button
              className="pagination-button next"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              icon={<Image src="/icons/arrow_forward.svg" alt="Next" width={20} height={20} />}
            >
              NEXT
            </Button>
          </div>
        )}

        {/* --- Room Code Input --- */}
        <div className="roomcode-join-area">
          <Input
            className="roomcode-input-bottom"
            placeholder="ENTER ROOMCODE"
            value={lobbyCodeInput}
            onChange={(e) => setLobbyCodeInput(e.target.value.replace(/\D/g, ''))} // Allow only digits
            onPressEnter={handleJoinByInput}
            maxLength={6}
            disabled={isJoining}
          />
          <Button
            className="roomcode-join-button-bottom"
            loading={isJoining && lobbyCodeInput !== ''} // Show loading only if this specific join is attempted
            onClick={handleJoinByInput}
            disabled={isJoining}
          >
            JOIN
          </Button>
        </div>

      </div>
    </div>
  );
};

// Create dummy icon files in public/icons/ if you don't have them
// public/icons/play_arrow.svg (orange play icon)
// public/icons/visibility.svg (pink eye icon)
// public/icons/arrow_back.svg (back arrow)
// public/icons/arrow_forward.svg (forward arrow)

export default withAuth(JoinLobbyPage);