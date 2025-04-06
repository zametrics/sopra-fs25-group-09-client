// your code here for S2 to display a single user profile after having clicked on it
// each user has their own slug /[id] (/1, /2, /3, ...) and is displayed using this file
// try to leverage the component library from antd by utilizing "Card" to display the individual user
// import { Card } from "antd"; // similar to /app/users/page.tsx

// this code is part of S2 to display a list of all registered users
// clicking on a user in this list will display /app/users/[id]/page.tsx
"use client"; // For components that need React hooks and browser APIs, SSR (server-side rendering) has to be disabled. Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation"; // Next.js navigation hook for client-side routing
import { useApi } from "@/hooks/useApi"; // Custom API hook for making backend requests
import useLocalStorage from "@/hooks/useLocalStorage"; // Hook to manage local storage values
import { User } from "@/types/user"; // Importing the User type for TypeScript
import { Typography, message } from "antd"; // UI components from Ant Design
import { Form } from "antd"; // Importing the type for table properties
import { LogoutOutlined} from "@ant-design/icons"; // Icons from Ant Design

import withAuth from "@/hooks/withAuth"; // Import the authentication wrapper

// Optionally, you can import a CSS module or file for additional styling:
// import "@/styles/views/Dashboard.scss";

const { Title } = Typography; // Extracting the Title component from Typography for styling


const Dashboard: React.FC = () => {
  const router = useRouter(); // Next.js hook for navigation
  const apiService = useApi(); // Custom hook for making API requests
  const [] = Form.useForm();
  const [setUsers] = useState<User[] | null>(null); // State to store user data
  const [setIsCreatingLobby] = useState(false); // State to track lobby creation status
  const userId = localStorage.getItem("userId");
  const username = localStorage.getItem("username");

  const {
    // value: token, // is commented out because we don't need to know the token value for logout
    // set: setToken, // is commented out because we don't need to set or update the token value    

    //clear: clearToken, // all we need in this scenario is a method to clear the token

  } = useLocalStorage<string>("token", ""); // Fetching and managing the token in local storage

  const handleLogout = async () => {
    const storedToken = localStorage.getItem("token");
  
    // Extract the token from the stored object
    const parsedToken = storedToken ? JSON.parse(storedToken)?.token : null;
  
    // Log the parsedToken value to the console
    console.log("Parsed Token:", parsedToken);
  
    if (parsedToken) {
      try {
        // Send the token directly, not wrapped in an object
        await apiService.post("/logout", { token: parsedToken });  
      } catch (error) {
        console.error("Logout failed", error);
      }
    }
  
    // Clear the token and username from localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    router.push("/login");
  };
  
  // New function to create a lobby with default values
  const handleCreateLobby = async () => {
    setIsCreatingLobby(true);
    
    try {
      // Get the current user's ID
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? JSON.parse(userIdStr) : null;
      
      if (!userId) {
        message.error("User ID not found. Please log in again.");
        setIsCreatingLobby(false);
        return;
      }
      
      // Default values as specified
      const defaultLobbyData = {
        numOfMaxPlayers: 8,
        playerIds: [userId], // Add the creator as the first player
        wordset: "english",
        numOfRounds: 3,
        drawTime: 80,
        lobbyOwner: userId // Set the lobby owner
      };
      
      // Make the API call to create the lobby
      const response = await apiService.post("/lobbies", defaultLobbyData);
      
      console.log("Lobby creation response:", response);
      
      const hasId = (obj: unknown): obj is { id: string | number } => {
        return typeof obj === "object" && obj !== null && "id" in (obj as Record<string, unknown>);
      };
      
      const hasDataId = (obj: unknown): obj is { data: { id: string | number } } => {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "data" in (obj as Record<string, unknown>) &&
          typeof (obj as { data: unknown }).data === "object" &&
          (obj as { data: unknown }).data !== null &&
          "id" in (obj as { data: Record<string, unknown> }).data
        );
      };
      
      
      
      let lobbyId;
      
      if (hasId(response)) {
        lobbyId = response.id;
      } else if (hasDataId(response)) {
        lobbyId = response.data.id;
      } else {
        console.error("Could not determine lobby ID from response:", response);
        message.error("Created lobby but couldn't get ID. Please check lobby list.");
        return;
      }
      
      // Show success message and redirect to the lobby
      message.success(`Lobby created successfully! ID: ${lobbyId}`);
      
      // Redirect to the lobby page
      router.push(`/lobbies/${lobbyId}`);
      
    } catch (error) {
      console.error("Error creating lobby:", error);
      message.error("Failed to create lobby. Please try again.");
    } finally {
      setIsCreatingLobby(false);
    }
  };
  
  
  const handleJoinLobby = () => {
    console.log("Joining lobby...");
    // Redirect or handle joining the lobby
    router.push("/join-lobby");
  };


  const handlePlay = () => {
    console.log("Starting Quickplay...");
    // Redirect to Quickplay page or handle play logic
    router.push("/quickplay");
  };


  // Fetching the list of users when the component loads
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users: User[] = await apiService.get<User[]>("/users"); // Making an API call to fetch users
        setUsers(users); // Updating state with fetched users
        console.log("Fetched users:", users); // Logging users to the console for debugging
      } catch (error) {
        console.error("Error fetching users:", error); // Logs error if API call fails
      }
    };

    fetchUsers(); // Calls the function to fetch users when the component mounts
  }, [apiService]); // Dependency array:
  // - This ensures the effect runs only when 'apiService' changes.
  // - Since 'apiService' is a custom hook with memoization, this will not re-run unnecessarily.

  return (
    <div className="page-background">
      <div className="home-wrapper">
        {/* Left Box */}
        <div className="left-box">
          <img src="/icons/settings_icon.png" alt="Settings" className="settings-icon" />
          <h1 className="drawzone-logo-3-7rem">DRAWZONE</h1>
          <p className="drawzone-subtitle-1-5rem">ART BATTLE ROYALE</p>

          <button className="green-button" onClick={handleJoinLobby}>
            JOIN LOBBY
          </button>
          <button className="green-button" onClick={handleCreateLobby}>
            HOST GAME
          </button>
        </div>

        {/* Right Side */}
        <div className="right-side">
          {/* Profile */}
          <div className="profile-box">
            <div className="profile-top-row">
              <img src="/icons/avatar.png" alt="Avatar" className="avatar-image" />
              <div className="profile-username">{username}</div>
            </div>
            <button className="edit-profile-button"
            onClick={() => router.push(`/home/${userId}`)} // Redirecting to user's profile edit page
              >
              Edit Profile
            </button>
            <button className="logout-button" onClick={handleLogout}>
              <LogoutOutlined /> Log out
            </button>
          </div>

          {/* Quickplay */}
          <div className="quickplay-box">
            <h2 className="quickplay-title">QUICKPLAY</h2>
            <button className="green-button" onClick={handlePlay}>
              PLAY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withAuth(Dashboard);