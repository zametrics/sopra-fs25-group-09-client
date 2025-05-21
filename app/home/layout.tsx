"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogoutOutlined } from "@ant-design/icons";
import { message } from "antd";
import { useApi } from "@/hooks/useApi";
import { User } from "@/types/user";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { Lobby } from "@/types/lobby";
import { Modal, Button } from "antd"; // Modal für Popup, Spin für Spinner

// Exporting the HomeLayout component as default so that it can be imported easily in other files
export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* The HomeLayout component receives 'children' as a prop.
    'children' is a special prop in React that allows passing components or elements
     inside the HomeLayout component when it is used, making it flexible for rendering dynamic content.
     React.ReactNode is a type that includes any valid React element (JSX, strings, numbers, fragments, etc.)
     It ensures that 'children' can be anything React can render. */

  // Using Next.js's `useRouter` hook to get access to the router object for navigating between pages
  const router = useRouter();

  // Using `usePathname` to get the current URL path (helps in identifying which page the user is on)
  const pathname = usePathname();

  // `useApi` is likely a custom hook that provides access to API functions for making network requests
  const apiService = useApi();

  // State variable to manage the avatar URL of the user
  const [avatarUrl, setAvatarUrl] = useState("");

  // State variable to control whether the avatar menu (for uploading or deleting an avatar) is visible
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);

  // Boolean flag to determine if the current page is the user's profile page based on the pathname
  const isProfilePage =
    pathname.startsWith("/home/") &&
    pathname !== "/home" &&
    !pathname.startsWith("/home/settings");

  // State variable to hold the URL of the avatar stored in localStorage, with a default value
  const [localAvatarUrl, setLocalAvatarUrl] =
    useState<string>("/icons/avatar.png");

  // State to store the `editUserId`, which is used when editing a user profile
  const [editUserId, setEditUserId] = useState<string | null>(null);

  // State to manage the new username that the user might set while editing their profile
  const [newUsername, setNewUsername] = useState("");

  // State to manage the current username, which is fetched from localStorage or initially set to an empty string
  const [username, setUsername] = useState<string>("");

  // State for Quickplay Loading
  const [quickPlayStatus, setQuickPlayStatus] = useState<
    "idle" | "searching" | "joining"
  >("idle");
  const [searchingDots, setSearchingDots] = useState(""); // Für die animierenden Punkte
  const [isNoLobbyModalVisible, setIsNoLobbyModalVisible] = useState(false); // Modal für Fehler

  // This line retrieves the current user's ID from localStorage (only runs in the browser, so `typeof window !== "undefined"` is used to avoid SSR issues)
  const currentUserId =
    typeof window !== "undefined" ? localStorage.getItem("userId") : "";

  const { isPlaying, toggle, volume, setVolume } = useBackgroundMusic(); //used oor accessing the background music hook

  useEffect(() => {
    // Check if running in the browser to avoid errors during server-side rendering (SSR)
    if (typeof window !== "undefined") {
      // Get the stored username from localStorage (or fallback to an empty string if not found)
      const storedUsername = localStorage.getItem("username") || "";
      // Update the state with the stored username
      setUsername(storedUsername);

      // Get the stored avatar URL from localStorage (or fallback to default avatar if not found)
      const storedAvatarUrl =
        localStorage.getItem("avatarUrl") || "/icons/avatar.png";
      // Update the state with the stored avatar URL
      setLocalAvatarUrl(storedAvatarUrl);
    }
  }, []); // Runs only once when the component mounts, to initialize state from localStorage

  useEffect(() => {
    // If there's no editUserId (we're not editing someone), fallback to locally stored values
    if (!editUserId) {
      setNewUsername(username || ""); // Pre-fill the username input with the stored username
      setAvatarUrl(localAvatarUrl); // Use the locally stored avatar
      return;
    }

    // If we do have an editUserId, fetch that user's info from the backend
    const fetchUser = async () => {
      const userData = await apiService.get<User>(`/users/${editUserId}`);
      setNewUsername(userData.username || ""); // Populate input with fetched username
      setAvatarUrl(userData.avatarUrl || localAvatarUrl); // Show their avatar, or fallback
    };

    // Fetch and set the data
    fetchUser();
  }, [apiService, editUserId, username, localAvatarUrl]);
  //    Runs when editUserId, apiService, username, or localAvatarUrl changes
  //    It ensures the right data is shown when editing a profile

  useEffect(() => {
    if (quickPlayStatus !== "searching") return;

    const interval = setInterval(() => {
      setSearchingDots((prev) => {
        if (prev.length >= 3) return "";
        return prev + ".";
      });
    }, 500);

    return () => clearInterval(interval);
  }, [quickPlayStatus]);

  useEffect(() => {
    const profilePage = pathname.startsWith("/home/") && pathname !== "/home";
    // If we're on a profile page (e.g., /home/123), extract the user ID from the URL
    if (profilePage) {
      const parts = pathname.split("/"); // Split path like ['home', '123']
      const id = parts[parts.length - 1]; // Get the last part => '123'
      setEditUserId(id); // Set it as the current user being edited
    } else {
      // If not on a profile route, clear the edit user state
      setEditUserId(null);
    }
  }, [pathname]);
  //    Runs whenever the URL path changes
  //    Helps determine if we're in "edit profile" mode and who we’re editing

  // Function to save the updated username
  const saveUsername = async () => {
    // Prevent saving an empty username
    if (!newUsername.trim()) {
      message.error("Username cannot be empty.");
      return;
    }

    try {
      // Build the object to send to the server
      const updatedFields = { newUsername };

      // Send a PUT request to update the username for the current editUserId
      await apiService.put(`/users/${editUserId}`, updatedFields);

      localStorage.setItem("username", newUsername); // Update in localStorage
      setUsername(newUsername); // Update state immediately
      // Notify user and update both localStorage and state
      message.success("Username updated successfully!");
    } catch (error) {
      // If the username hasn't actually changed, silently ignore
      if (newUsername === localStorage.getItem("username")) {
        console.error("", error);
        return;
      } else {
        // Otherwise show a generic error (e.g. username already taken)
        message.error("Error updating username. It might be taken.");
      }
    }
  };

  // Function that gets called when the user confirms profile changes
  const handleConfirmChanges = async () => {
    // Run both saveUsername and saveAvatar in parallel
    await Promise.all([saveUsername(), saveAvatar()]);
    // 🔁 Avatar-URL erneut aus localStorage holen + Cache umgehen
    const updatedAvatar = localStorage.getItem("avatarUrl");
    if (updatedAvatar) {
      setLocalAvatarUrl(updatedAvatar);
    }

    // After saving, navigate the user back to the main home page
    router.push("/home");
  };

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
    localStorage.removeItem("avatarUrl");
    router.push("/login");
  };

  // For seamless animation we are pushing the user to a new page
  const handleEditProfile = () => {
    router.push(`/home/${currentUserId}`);
  };

  // "Deleting" an image will just replace the image with a default image
  const handleDeleteImage = () => {
    setAvatarUrl("/icons/avatar.png"); // Reset to default avatar
  };

  const handleAvatarFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !currentUserId) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(
        `https://sopra-fs25-group-09-server.oa.r.appspot.com/api/files/upload-avatar/${currentUserId}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const url = await response.text();
      setAvatarUrl(url);
      localStorage.setItem("avatarUrl", url);
      message.success("Profilbild erfolgreich aktualisiert!");
      setShowAvatarMenu(false);
      await apiService.put(`/users/${currentUserId}/avatar`, {
        avatarUrl: url,
      });
    } catch (err) {
      message.error("Fehler beim Hochladen des Bildes");
      console.error("Upload Error:", err);
    }
  };

  // Async function to handle saving/updating the user's avatar URL
  const saveAvatar = async () => {
    // If the avatar URL is empty or only whitespace, show an error message and exit early
    if (!avatarUrl.trim()) {
      message.error("Please enter a valid image URL.");
      return;
    }

    try {
      // Construct the object with the updated avatar URL to send to the server
      const updatedFields = { avatarUrl };

      // Send a PUT request to update the user's avatar on the backend
      await apiService.put(`/users/${editUserId}/avatar`, updatedFields);

      // Update the avatar URL in localStorage so it's persisted between sessions
      localStorage.setItem("avatarUrl", avatarUrl);

      if (avatarUrl == localAvatarUrl) {
        // On success, show a success message to the user
        message.success("Profile picture updated successfully!");
      }

      // Close the avatar editing menu/modal
      setShowAvatarMenu(false);
    } catch (error) {
      // If there's an error, show an error message to the user
      message.error("Error updating profile picture.");
      // Also log the error to the console for debugging purposes
      console.error("Update error:", error);
    }
  };

  // Async function that handles the creation of a new game lobby
  const handleCreateLobby = async () => {
    try {
      // Get the current user's ID from localStorage
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? JSON.parse(userIdStr) : null;

      // If there's no user ID (e.g. user not logged in), show error and stop
      if (!userId) {
        message.error("User ID not found. Please log in again.");
        return;
      }

      // Set up default lobby settings
      const defaultLobbyData = {
        numOfMaxPlayers: 8, // Maximum players allowed
        playerIds: [userId], // Add the current user as the first player
        wordset: "english", // Word set to be used in the game
        numOfRounds: 3, // Number of rounds for the game
        drawTime: 80, // Drawing time in seconds per round
        lobbyOwner: userId, // Set the current user as the lobby owner
      };

      // Send POST request to backend to create the lobby
      const response = await apiService.post("/lobbies", defaultLobbyData);

      console.log("Lobby creation response:", response);

      // Type guard to check if the response has an `id` directly
      const hasId = (obj: unknown): obj is { id: string | number } => {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "id" in (obj as Record<string, unknown>)
        );
      };

      // Type guard to check if the response has a nested `data.id`
      const hasDataId = (
        obj: unknown
      ): obj is { data: { id: string | number } } => {
        return (
          typeof obj === "object" &&
          obj !== null &&
          "data" in (obj as Record<string, unknown>) &&
          typeof (obj as { data: unknown }).data === "object" &&
          (obj as { data: unknown }).data !== null &&
          "id" in (obj as { data: Record<string, unknown> }).data
        );
      };

      // Try to extract the lobby ID using the type guards
      let lobbyId;

      if (hasId(response)) {
        lobbyId = response.id;
      } else if (hasDataId(response)) {
        lobbyId = response.data.id;
      } else {
        // If we can't find the ID, show an error and exit
        console.error("Could not determine lobby ID from response:", response);
        message.error(
          "Created lobby but couldn't get ID. Please check lobby list."
        );
        return;
      }

      // If we successfully got the lobby ID, show a success message
      message.success("Lobby created successfully!");

      // Navigate the user to the newly created lobby
      router.push(`/lobbies/${lobbyId}`);
    } catch (error) {
      // Catch any errors during the process and notify the user
      console.error("Error creating lobby:", error);
      message.error("Failed to create lobby. Please try again.");
    } finally {
      // Optional: you could add cleanup code here if needed
    }
  };

  const joinLobby = async (codeToJoin: string) => {
    try {
      const userIdStr = localStorage.getItem("userId");
      const userId = userIdStr ? parseInt(JSON.parse(userIdStr), 10) : null;

      if (!userId) {
        console.error("Error: User not logged in");
        return;
      }

      // Attempt to join
      try {
        await apiService.put(
          `/lobbies/${codeToJoin}/join?playerId=${userId}`,
          {}
        );
        setTimeout(() => {
          router.push(`/lobbies/${codeToJoin}`);
        }, 1000);
      } catch (joinError) {
        // Explicitly type joinError if possible
        console.error("Debug - Join error:", joinError);
        // More specific error messages based on potential API responses
      }
    } catch (outerError) {
      console.error("Unexpected error during join:", outerError);
    }
    // Removed finally block's state resets as they are handled within error/success paths
  };

  const handleQuickPlay = async () => {
    if (quickPlayStatus !== "idle") return;
    setQuickPlayStatus("searching");

    const MAX_ATTEMPTS = 10;
    const INTERVAL_MS = 1000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const lobbies = await apiService.get<Lobby[]>("/lobbies");
        const openLobby = lobbies.find((lobby) => lobby.status === 0);

        if (openLobby) {
          setQuickPlayStatus("joining");
          await joinLobby(openLobby.id); // <-- nutzt bestehende Funktion
          return;
        }
      } catch (error) {
        console.error("Quickplay: error while polling lobbies", error);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    }

    // Nach 10s keine Lobby gefunden
    setQuickPlayStatus("idle");
    setIsNoLobbyModalVisible(true);
  };

  return (
    <div className="page-background">
      {/* MUSIC CONTROLS */}
      <div
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          borderRadius: "10px",
          padding: "10px 14px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <button
          onClick={toggle}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.2rem",
            cursor: "pointer",
          }}
        >
          {isPlaying ? "🔊" : "🔇"}
        </button>

        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{ width: "80px" }}
        />
      </div>

      <div className="home-wrapper">
        <div className="left-box">
          <img
            src="/icons/settings_icon.png"
            alt="Settings"
            className="settings-icon"
            style={{ cursor: "pointer" }}
            onClick={() => router.push("/home/settings")}
          />
          <h1 className="drawzone-logo-3-7rem">DRAWZONE</h1>
          <p className="drawzone-subtitle-1-5rem">ART BATTLE ROYALE</p>
          <button
            className="green-button"
            onClick={() => router.push("/join-lobby")}
          >
            JOIN LOBBY
          </button>
          <button className="green-button" onClick={handleCreateLobby}>
            HOST GAME
          </button>
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
                      style={{ marginTop: 5, marginBottom: 1 }}
                    />
                    <span
                      onClick={() => setShowAvatarMenu(!showAvatarMenu)}
                      style={{
                        position: "absolute",
                        bottom: 0,
                        right: 0,
                        cursor: "pointer",
                      }}
                    >
                      <img
                        src="/icons/edit_icon.png"
                        alt="Edit"
                        width={35}
                        height={35}
                      />
                    </span>
                    {showAvatarMenu && (
                      <div className="avatar-menu">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarFileUpload}
                          style={{ display: "none" }}
                          id="avatarUploadInput"
                        />
                        <label
                          htmlFor="avatarUploadInput"
                          className="upload-image-btn"
                        >
                          upload image
                        </label>

                        <button
                          onClick={handleDeleteImage}
                          className="delete-image-btn"
                        >
                          delete image
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
                <button
                  className="confirm-edit-profile-button"
                  onClick={handleConfirmChanges}
                >
                  Confirm changes
                </button>
                <button className="logout-button" onClick={handleLogout}>
                  <LogoutOutlined /> Log out
                </button>
              </>
            ) : (
              <>
                <div className="profile-top-row">
                  <img
                    src={avatarUrl === "" ? "/icons/avatar.png" : avatarUrl}
                    alt="Avatar"
                    className="avatar-image"
                  />
                  <div className="profile-username">{username}</div>
                </div>
                <button
                  className="edit-profile-button"
                  onClick={handleEditProfile}
                >
                  Edit Profile
                </button>
                <button className="logout-button" onClick={handleLogout}>
                  <LogoutOutlined /> Log out
                </button>
              </>
            )}
          </div>

          {children}

          <div className="quickplay-box">
            <h2 className="quickplay-title">QUICKPLAY</h2>
            <Button
              className="green-button"
              onClick={handleQuickPlay}
              disabled={quickPlayStatus !== "idle"}
              loading={quickPlayStatus === "joining"}
            >
              {quickPlayStatus === "searching" && `Searching${searchingDots}`}
              {quickPlayStatus === "idle" && "PLAY"}
              {quickPlayStatus === "joining" && "JOINING"}
            </Button>
          </div>
        </div>
      </div>
      <Modal
        className="modal-no-open-lobbies"
        open={isNoLobbyModalVisible}
        onOk={() => setIsNoLobbyModalVisible(false)}
        onCancel={() => setIsNoLobbyModalVisible(false)}
        centered
        width={330}
        closable={false}
        footer={null}
      >
        <div className="modal-content-custom">
          <h2 className="modal-title-custom">NO LOBBIES FOUND</h2>
          <p className="modal-text">
            we couldnt find any open lobbies right now 🙁
          </p>
          <button
            className="modal-button-primary green-button "
            onClick={() => {
              setIsNoLobbyModalVisible(false);
              handleCreateLobby();
            }}
          >
            Host Your Own
          </button>
          <button
            className="modal-cancel-button green-button"
            onClick={() => setIsNoLobbyModalVisible(false)}
          >
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
