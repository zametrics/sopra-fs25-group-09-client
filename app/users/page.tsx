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
import { Button, Card, Table, Avatar, Typography, Space, message } from "antd"; // UI components from Ant Design
import type { TableProps } from "antd"; // Importing the type for table properties
import { LogoutOutlined, UserOutlined, PlusOutlined } from "@ant-design/icons"; // Icons from Ant Design

import withAuth from "@/hooks/withAuth"; // Import the authentication wrapper

// Optionally, you can import a CSS module or file for additional styling:
// import "@/styles/views/Dashboard.scss";

const { Title } = Typography; // Extracting the Title component from Typography for styling

// Defining columns for the Ant Design table that displays User objects
const columns: TableProps<User>["columns"] = [
  {
    title: "Avatar", // Table column title
    dataIndex: "avatar", // The key in the user object that holds avatar URLs
    key: "avatar",
    render: () => (
      // Displays a default user icon if no avatar is available
      <Avatar src={undefined} icon={<UserOutlined />} />
    ),
  },
  {
    title: "Username",
    dataIndex: "username",
    key: "username",
    render: (text) => (
      <span
        style={{
          display: "inline-block",
          padding: "4px 8px",
          border: "1px solidrgb(13, 21, 28)",
          borderRadius: "5px",
          backgroundColor: "rgba(234, 234, 234, 0.1)",
          color: "rgb(255, 255, 255)",
          fontWeight: "bold",
          cursor: "pointer",
        }}
      >
        {text}
      </span>
    ),
  },

  
  {
    title: "ID",
    dataIndex: "id",
    key: "id",
  },
];

const Dashboard: React.FC = () => {
  const router = useRouter(); // Next.js hook for navigation
  const apiService = useApi(); // Custom hook for making API requests
  const [users, setUsers] = useState<User[] | null>(null); // State to store user data
  const [isCreatingLobby, setIsCreatingLobby] = useState(false); // State to track lobby creation status

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

<div
  style={{
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "100vh", // Makes the background cover the full viewport
    padding: "2rem",
    background: `url(/images/background.jpg) no-repeat center center/cover`, // This uses the image as the background
  }}
>

      <Card
        title={<Title level={3}>👥 User Overview</Title>} // Displaying a title with an icon
        loading={!users} // Shows a loading state if users haven't been fetched yet
        style={{ 
          width: "80%", 
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)", // Adds a subtle shadow for a cleaner UI
          borderRadius: "10px", // Rounds the card's edges for a modern look
          padding: "2rem"
        }}
      >
        {users && (
          <>
            {/* Ant Design Table Component */}
            <Table<User>
              columns={columns} // Columns defined above
              dataSource={users} // The user data fetched from the backend
              rowKey="id" // Ensures each row has a unique identifier
              pagination={{ pageSize: 5 }} // Limits the number of users displayed per page
              onRow={(row) => ({
                onClick: () => router.push(`/users/${row.id}`), // Navigates to a user's profile on click
                style: { cursor: "pointer" }, // Changes the cursor to indicate clickability
              })}
            />
            
            {/* Buttons for Logout and Create Lobby */}
            <Space style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
              <Button onClick={handleLogout} type="primary" icon={<LogoutOutlined />} danger>
                Logout
              </Button>
              <Button 
                onClick={handleCreateLobby} 
                type="primary" 
                icon={<PlusOutlined />}
                loading={isCreatingLobby}
              >
                Create Lobby
              </Button>
            </Space>
          </>
        )}
      </Card>
    </div>
  );
};

export default withAuth(Dashboard);