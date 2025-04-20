"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import { useApi } from "@/hooks/useApi";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";

const SettingsPage = () => {
  const router = useRouter();
  const apiService = useApi();

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
        <button className="settings-close-button" onClick={handleClose}>
          ❌
        </button>
        <h2 className="settings-title">SETTINGS</h2>

        <div className="settings-section">
          <div className="setting-label">BACKGROUND MUSIC</div>
          <div className="toggle-placeholder">[✓]</div>
        </div>

        <div className="settings-section">
          <div className="setting-label">SOUND EFFECTS</div>
          <div className="toggle-placeholder">[✓]</div>
        </div>

        <button className="delete-account-button" onClick={handleDeleteAccount}>
          Delete Account
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
