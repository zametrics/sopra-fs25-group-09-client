"use client"; // Use client-side rendering as we need React hooks

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation"; // Use useParams from next/navigation
import { useApi } from "@/hooks/useApi"; // Custom hook to make API requests
import { User } from "@/types/user"; // TypeScript type for User
import { Card, Typography, Space, Button, Divider, message, DatePicker, Input } from "antd"; // Ant Design components
import { UploadOutlined } from '@ant-design/icons';
import withAuth from "@/hooks/withAuth";
import dayjs from "dayjs";

const { Title, Text } = Typography; // Extract Title and Text for typography styling

const UserProfile: React.FC = () => {
  const router = useRouter(); // For routing to navigate back to the user list
  const apiService = useApi(); // Custom hook to interact with API
  const [user, setUser] = useState<User | null>(null); // State to store user data
  const [dateOfBirth, setDateOfBirth] = useState<string>(""); // Date of Birth input (string)
  const [isEditing, setIsEditing] = useState(false); // For toggle editing mode
  const { id } = useParams(); // Extract the 'id' from the URL params
  
  const [avatarUrl, setAvatarUrl] = useState<string>(""); // New state for avatar URL input
  const [isEditingAvatar, setIsEditingAvatar] = useState(false); // Track avatar edit state
  
  // State to handle client-side logic
  const [isClient, setIsClient] = useState(false); 
  const [parsedToken, setParsedToken] = useState<string | null>(null);

  useEffect(() => {
    // Ensure that window and localStorage is accessed only on the client side
    if (typeof window !== 'undefined') {
      setIsClient(true); // Mark as client-side render
      const storedToken = localStorage.getItem("token");
      setParsedToken(storedToken ? JSON.parse(storedToken)?.token : null);
    }
  }, []);

// New function to handle avatar URL save
const saveAvatar = async () => {
  if (!avatarUrl.trim()) {
    message.error("Please enter a valid image URL.");
    return;
  }

  try {
    const updatedFields = { avatarUrl };
    // Correct endpoint for updating avatar URL
    await apiService.put(`/users/${user?.id}/avatar`, updatedFields);
    message.success("Profile picture updated successfully!");
    window.location.reload();  // Reload to reflect changes
    setIsEditingAvatar(false);  // Exit editing mode
  } catch (error) {
    message.error("Error updating profile picture.");
    console.error("Update error:", error);
  }
};

  // Effect to fetch the user data based on the ID in the URL
  useEffect(() => {
    if (!id) return; // If no ID is available, return early

    const fetchUser = async () => {
      try {
        const response = await apiService.get<User>(`/users/${id}`); // Make API call to fetch user data
        setUser(response); // Update state with the fetched user data
        setDateOfBirth(response.dateOfBirth || ""); // Pre-fill date of birth (if any)
        setAvatarUrl(response.avatarUrl || "");
      } catch (error) {
        console.error("Error fetching user data:", error); // Log error if the request fails
      }
    };

    fetchUser(); // Fetch the user when the component is mounted
  }, [apiService, id]); // Dependency on `id` to trigger refetching if it changes


type UserUpdateFields = {
  newUsername?: string;
  dateOfBirth?: string;
};
  
// Handle form submission to save Date of Birth
const saveDateOfBirth = async () => {
  if (!dateOfBirth) {
    message.error("Please enter a valid Date of Birth.");
    return;
  }

 // Use the UserUpdateFields type to ensure proper typing
 const updatedFields: UserUpdateFields = { dateOfBirth };

  try {
    // Send the PUT request to update the dateOfBirth
    await apiService.put(`/users/${user?.id}`, updatedFields);
    message.success("Date of Birth updated successfully!");
    window.location.reload(); // Refresh the page after the update
    setIsEditing(false); // Exit editing mode 
  } catch (error) {
    message.error("Error updating Date of Birth.");
    console.error("Error:", error);
  }
};


const [isEditingUsername, setIsEditingUsername] = useState(false); // Track username edit state
const [newUsername, setNewUsername] = useState<string>(""); // Store new username

useEffect(() => {
  if (user) {
    setNewUsername(user.username ?? "") //Fill username when user data is loaded
  }
}, [user]);

// Function to save the new username
const saveUsername = async () => {
  if (!newUsername.trim()) {
    message.error("Username cannot be empty.");
    return;
  }

  // Use the UserUpdateFields type to ensure proper typing
  const updatedFields: UserUpdateFields = { newUsername };

  try {
    // Send the PUT request to update the username
    await apiService.put(`/users/${user?.id}`, updatedFields);
    message.success("Username updated successfully!");
    window.location.reload(); // Refresh the page after the update
    setIsEditingUsername(false); // Exit editing mode
  } catch (error) {
    message.error("Error updating username. It might be taken.");
    console.error("Update error:", error);
  }
};


// Prevent rendering on the server side until after the component has mounted
if (!isClient) return null; 

return (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      padding: "2rem",
      background: `url(/images/background.jpg) no-repeat center center/cover`,
    }}
  >
    <Card
      title={<Title level={3}>User Profile of {user?.username}</Title>}
      loading={!user}
      style={{
        width: "80%",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        borderRadius: "10px",
        padding: "2rem",
      }}
    >
      {user && (
        <>
          {/* Avatar Section */}
          <Text style={{ fontSize: "16px", fontWeight: "500" }}>Profile Picture:</Text>
          <div style={{ marginTop: "8px", marginBottom: "16px" }}>
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Profile"
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  marginBottom: "10px",
                }}
              />
            ) : (
              <Text type="secondary">No profile picture set</Text>
            )}
            {user.token === parsedToken && (
              <>
                {isEditingAvatar ? (
                  <div>
                    <Input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="Enter image URL"
                      style={{ marginBottom: "10px" }}
                    />
                    <Space>
                      <Button type="primary" onClick={saveAvatar}>
                        Save
                      </Button>
                      <Button onClick={() => setIsEditingAvatar(false)}>
                        Cancel
                      </Button>
                    </Space>
                  </div>
                ) : (
                  <Button
                    type="link"
                    icon={<UploadOutlined />}
                    onClick={() => setIsEditingAvatar(true)}
                    style={{ marginLeft: "10px" }}
                  >
                    {user.avatarUrl ? "Change" : "Add"} Picture
                  </Button>
                )}
              </>
            )}
          </div>
          <Divider />

          {/* Username Editing Section */}
          <Text style={{ fontSize: "16px", fontWeight: "500" }}>Username:</Text>
          {isEditingUsername ? (
            <div style={{ marginTop: "8px" }}>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter new username"
              />
              <Space style={{ marginTop: "10px" }}>
                <Button type="primary" onClick={saveUsername}>Save</Button>
                <Button onClick={() => setIsEditingUsername(false)}>Cancel</Button>
              </Space>
            </div>
          ) : (
            <div style={{ marginTop: "8px" }}>
              <Text>{user.username}</Text>
              {user.token === parsedToken && (
                <Button
                  type="link"
                  onClick={() => setIsEditingUsername(true)}
                  style={{ marginLeft: "10px" }}
                >
                  Edit
                </Button>
              )}
            </div>
          )}
          <Divider />

          {/* Date of Birth Editing Section */}
          <Text style={{ fontSize: "16px", fontWeight: "500" }}>Date of Birth:</Text>
          {isEditing ? (
            <div style={{ marginTop: "8px" }}>
              <DatePicker
                value={dateOfBirth ? dayjs(dateOfBirth) : null}
                onChange={(date, dateString) => {
                  if (typeof dateString === "string") {
                    setDateOfBirth(dateString);
                  }
                }}
                format="YYYY-MM-DD"
                placeholder="Select your date of birth"
                popupClassName="custom-datepicker-dropdown"
              />
              <Space style={{ marginTop: "10px" }}>
                <Button type="primary" onClick={saveDateOfBirth}>Save</Button>
                <Button onClick={() => setIsEditing(false)}>Cancel</Button>
              </Space>
            </div>
          ) : (
            <div style={{ marginTop: "8px" }}>
              <Text>{user.dateOfBirth || "Not Set"}</Text>
              {user.token === parsedToken && (
                <Button
                  type="link"
                  onClick={() => setIsEditing(true)}
                  style={{ marginLeft: "10px" }}
                >
                  Edit
                </Button>
              )}
            </div>
          )}
          <Divider />

          {/* Other User Info */}
          <Text style={{ fontSize: "16px", fontWeight: "500" }}>
            Online Status: {user.status}
          </Text>
          <Divider />
          <Text style={{ fontSize: "16px", fontWeight: "500" }}>
            Created on: {user.createdAt && dayjs(user.createdAt).format("YYYY-MM-DD")}
          </Text>
          <Divider />

          {/* Back Button */}
          <Space style={{ display: "flex", justifyContent: "center", marginTop: "20px" }}>
            <Button onClick={() => router.push("/home")} type="default">
              Back to User List
            </Button>
          </Space>
        </>
      )}
    </Card>
  </div>
);
};

export default withAuth(UserProfile);