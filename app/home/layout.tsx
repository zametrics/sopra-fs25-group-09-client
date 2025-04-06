"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutOutlined } from "@ant-design/icons";
import { message } from "antd";
import { useApi } from "@/hooks/useApi";
import { User } from "@/types/user";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const apiService = useApi();

  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);

  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
  const username = typeof window !== "undefined" ? localStorage.getItem("username") : "";
  const localAvatarUrl = typeof window !== "undefined" ? localStorage.getItem("avatarUrl") || "/icons/avatar.png" : "/icons/avatar.png";

  const isProfilePage = pathname.startsWith("/home/") && pathname !== "/home";

  useEffect(() => {
    if (isProfilePage) {
      const parts = pathname.split("/");
      const id = parts[parts.length - 1];
      setEditUserId(id);
    } else {
      setEditUserId(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!editUserId) {
      setNewUsername(username || "");
      setAvatarUrl(localAvatarUrl);
      return;
    }

    const fetchUser = async () => {
      try {
        const userData = await apiService.get<User>(`/users/${editUserId}`);
        setNewUsername(userData.username || "");
        setAvatarUrl(userData.avatarUrl || localAvatarUrl);
      } catch (error) {
        message.error("Failed to load user data.");
      }
    };

    fetchUser();
  }, [apiService, editUserId, username, localAvatarUrl]);

  const handleLogout = () => {
    localStorage.clear();
    router.push("/login");
  };

  const handleEditProfile = () => {
    router.push(`/home/${currentUserId}`);
  };

  const handleUploadImage = () => {
    const url = prompt("Enter new image URL:");
    if (url && url.trim()) {
      setAvatarUrl(url);
    } else if (url !== null) {
      message.error("Please enter a valid image URL.");
    }
  };

  const handleDeleteImage = () => {
    setAvatarUrl("/icons/avatar.png"); // Reset to default avatar
  };

  const saveAvatar = async () => {
    if (!avatarUrl.trim()) {
      message.error("Please enter a valid image URL.");
      return;
    }

    try {
      const updatedFields = { avatarUrl };
      await apiService.put(`/users/${editUserId}/avatar`, updatedFields);
      message.success("Profile picture updated successfully!");
      localStorage.setItem("avatarUrl", avatarUrl);
      setShowAvatarMenu(false);
    } catch (error) {
      message.error("Error updating profile picture.");
      console.error("Update error:", error);
    }
  };

  const saveUsername = async () => {
    if (!newUsername.trim()) {
      message.error("Username cannot be empty.");
      return;
    }

    try {
      const updatedFields = { newUsername };
      await apiService.put(`/users/${editUserId}`, updatedFields);
      message.success("Username updated successfully!");
      localStorage.setItem("username", newUsername);
    } catch (error) {
      message.error("Error updating username. It might be taken.");
      console.error("Update error:", error);
    }
  };

  const handleConfirmChanges = async () => {
    try {
      await Promise.all([saveUsername(), saveAvatar()]);
      router.push("/home");
    } catch (error) {
      message.error("Update failed.");
    }
  };

  return (
    <div className="page-background">
      <div className="home-wrapper">
        <div className="left-box">
          <img src="/icons/settings_icon.png" alt="Settings" className="settings-icon" />
          <h1 className="drawzone-logo-3-7rem">DRAWZONE</h1>
          <p className="drawzone-subtitle-1-5rem">ART BATTLE ROYALE</p>
          <button className="green-button" onClick={() => router.push("/join-lobby")}>JOIN LOBBY</button>
          <button className="green-button" onClick={async () => {
            try {
              const userIdStr = localStorage.getItem("userId");
              const userId = userIdStr ? JSON.parse(userIdStr) : null;
              const response = await apiService.post("/lobbies", {
                numOfMaxPlayers: 8,
                playerIds: [userId],
                wordset: "english",
                numOfRounds: 3,
                drawTime: 80,
                lobbyOwner: userId,
              });
              const lobbyId = response?.data?.id || response?.id;
              router.push(`/lobbies/${lobbyId}`);
            } catch {
              message.error("Failed to create lobby.");
            }
          }}>HOST GAME</button>
        </div>

        <div className="right-side">
          <div className="profile-box">
            {isProfilePage ? (
              <>
                <div className="profile-top-row">
                  <div style={{ position: "relative" }}>
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="avatar-image"
                      style={{marginTop: 5, marginBottom: 1}}
                    />
                    <span
                      onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                      style={{ position: "absolute", bottom: 0, right: 0, cursor: "pointer" }}
                    >
                      <img src="/icons/edit_icon.png" alt="Edit" width={35} height={35} />
                    </span>
                    {showAvatarMenu && (
                      <div className="avatar-menu">
                        <button onClick={handleUploadImage}>Upload Image</button>
                        <button onClick={handleDeleteImage} style={{ color: "red" }}>
                          Delete Image
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="profile-username-edit"
                  />
                </div>
                <button className="confirm-edit-profile-button" onClick={handleConfirmChanges}>Confirm changes</button>
                <button className="logout-button" onClick={handleLogout}>
                  <LogoutOutlined /> Log out
                </button>
              </>
            ) : (
              <>
                <div className="profile-top-row">
                  <img src={localAvatarUrl} alt="Avatar" className="avatar-image" />
                  <div className="profile-username">{username}</div>
                </div>
                <button className="edit-profile-button" onClick={handleEditProfile}>Edit Profile</button>
                <button className="logout-button" onClick={handleLogout}>
                  <LogoutOutlined /> Log out
                </button>
              </>
            )}
          </div>

          {children}

          <div className="quickplay-box">
            <h2 className="quickplay-title">QUICKPLAY</h2>
            <button className="green-button" onClick={() => router.push("/quickplay")}>PLAY</button>
          </div>
        </div>
      </div>
    </div>
  );
}
