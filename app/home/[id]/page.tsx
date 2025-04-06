"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { message } from "antd";
import withAuth from "@/hooks/withAuth";

const UserProfileEdit: React.FC = () => {
  const { id } = useParams();
  const router = useRouter();
  const apiService = useApi();

  const [newUsername, setNewUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await apiService.get(`/users/${id}`);
        setNewUsername(userData.username || "");
        setAvatarUrl(userData.avatarUrl || "");
      } catch (error) {
        message.error("Failed to load user data.");
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchUser();
  }, [apiService, id]);

  const handleUploadImage = () => {
    const url = prompt("Enter new image URL:");
    if (url) setAvatarUrl(url);
  };

  const handleDeleteImage = () => {
    setAvatarUrl("");
  };

  const handleConfirmChanges = async () => {
    try {
      await apiService.put(`/users/${id}`, {
        username: newUsername,
        avatarUrl,
      });
      message.success("Profile updated!");
      router.push("/home");
    } catch (error) {
      message.error("Update failed.");
    }
  };
  return (
    <>
    </>
  );
};

export default withAuth(UserProfileEdit);
