"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useApi } from "@/hooks/useApi";
import { useSound } from "@/context/SoundProvider";

const SettingsPage = () => {
  const router = useRouter();
  const apiService = useApi();
  const { volume, setVolume } = useSound();

  const handleClose = () => {
    router.push("/home");
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete your account? This cannot be undone."
    );
    if (!confirmDelete) return;

    const userId = localStorage.getItem("userId");
    const token = localStorage.getItem("token");
    const parsedToken = token ? JSON.parse(token)?.token : null;

    if (!userId || !parsedToken) {
      message.error("Missing credentials. Please log in again.");
      return;
    }

    try {
      await apiService.delete(`/users/${userId}`, {
        headers: {
          Authorization: parsedToken,
        },
      });
    } catch (error) {
      console.error(error);
      message.error("Failed to delete account. You are being logged out.");
    }
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("userId");
    router.push("/login");
  };

  return (
    <div className="settings-overlay">
      <div className="settings-modal">
        <div className="settings-banner lobby-header">
          <h2 className="lobby-banner">Settings</h2>
          <button className="close-button" onClick={handleClose}>
            <img src="/icons/close_x.svg" alt="Close" className="close-icon" />
          </button>
        </div>

        <div className="settings-section">
          <div className="setting-label">SOUND EFFECTS</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            🔊
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
            {volume}%
          </label>
        </div>

        <button
          className="delete-account-button green-button"
          onClick={handleDeleteAccount}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
