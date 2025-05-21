"use client";

import React, { FC, useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Button, Spin, message, Modal } from "antd";
import { useRouter } from "next/navigation";
import withAuth from "@/hooks/withAuth";
import io, { Socket } from "socket.io-client";
import { useDraw } from "@/hooks/useDraw";
import { drawLine } from "@/utils/drawLine";
import Layout from "@/utils/layout";
import { useSound } from "@/context/SoundProvider";

interface LobbyData {
  id: number;
  currentWord: string;
  numOfMaxPlayers: number;
  playerIds: number[];
  type: string;
  numOfRounds: number;
  drawTime: number;
  lobbyOwner: number;
  language: string;
  currentPainterToken: string | null;
  status: number;
}

interface WordOption {
  word: string;
  selected: boolean;
}

type Point = { x: number; y: number };

interface DrawBatchData {
  points: Point[];
}

interface DrawBatchEmitData extends DrawBatchData {
  // Type for received data
  color: string;
  brushSize: number;
}

interface DrawBatchEmitDataWithUser extends DrawBatchEmitData {
  userId: string; // Assuming userId from localStorage is a string
}

// --- NEW: Interface for Fill Area event data ---
interface FillAreaData {
  x: number;
  y: number;
  color: string; // The fill color (hex)
}
interface FillAreaDataWithUser extends FillAreaData {
  userId: string;
}

// --- NEW: Interface for Draw End event ---
interface DrawEndData {
  userId: string;
}

// Type for the clear event data from the server
interface ClearEmitData {
  userId: string;
}

// Interfaces for state request/response
interface GetCanvasStateData {
  requesterId: string;
}
// interface SendCanvasStateData {
//   targetUserId: string;
//   dataUrl: string;
// }
interface LoadCanvasStateData {
  dataUrl: string;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

const colorPalette = [
  "#FFFFFF",
  "#C0C0C0",
  "#FF0000",
  "#FFA500",
  "#FFFF00",
  "#00FF00",
  "#00FFFF",
  "#0000FF",
  "#FF00FF",
  "#A0522D", // Row 1
  "#000000",
  "#808080",
  "#8B0000",
  "#D2691E",
  "#008000",
  "#00008B",
  "#4B0082",
  "#800080",
  "#8B4513",
  "#4D2600", // Row 2 (adjusted some for contrast/variety)
];

// --- Define Brush Sizes ---
const brushSizes = {
  size1: 4, // Smallest
  size2: 8, // Small-Medium (Default)
  size3: 12, // Medium-Large
  size4: 24, // Largest
};

type Tool = "brush" | "fill"; // Add more tools later if needed

const MAX_HISTORY_SIZE = 20; // Limit undo steps to prevent memory issues

interface SyncCanvasData {
  userId: string;
  dataUrl: string; // Send canvas state as Data URL
}

// --- NEW: Define constants for session storage keys ---
const DISCONNECT_TIMEOUT_ID_KEY = "disconnectTimeoutId";
const DISCONNECT_LOBBY_ID_KEY = "disconnectLobbyId";

const LobbyPage: FC = ({}) => {
  const [activeTool, setActiveTool] = useState<Tool>("brush"); // Default to brush
  const [brushSize, setBrushSize] = useState<number>(brushSizes.size2); // Default size
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  // old socket implementation
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false); // Prevent multiple initial loads
  const [score, setScores] = useState<{ [key: number]: number }>({});
  const [diffScores, setDiffScores] = useState<{ [playerId: string]: number }>(
    {}
  );

  const [isLastRound, setIsLastRound] = useState<boolean>(false);
  const [lastLoading, setLastLoading] = useState<boolean>(false);

  const [usernameCache, setUsernameCache] = useState<{
    [playerId: string]: string;
  }>({});

  const [color, setColor] = useState<string>("#000000");
  const [isColorPickerVisible, setIsColorPickerVisible] =
    useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement>(null); // Ref for click outside detection
  const colorButtonRef = useRef<HTMLButtonElement>(null); // Ref for the trigger button
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]); // --- State for Undo History ---
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null); // Ref to access the canvas element directly for ImageData
  // const wordToGuess = "daniel"; //PLACEHOLDER WORD
  const currentUserId =
    typeof window !== "undefined" ? localStorage.getItem("userId") : "";

  const raw =
    typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // parse and extract `.token`
  const currentUserToken = raw
    ? (JSON.parse(raw) as { token?: string }).token || null
    : null;
  //console.log("just the uuid:", currentUserToken);

  const [isCurrentUserPainter, setIsCurrentUserPainter] =
    useState<boolean>(false);

  const remoteUsersLastPointRef = useRef<Map<string, Point | null>>(new Map());
  const localAvatarUrl =
    typeof window !== "undefined"
      ? localStorage.getItem("avatarUrl") || "/icons/avatar.png"
      : "/icons/avatar.png";
  const [cursorStyle, setCursorStyle] = useState<string>("crosshair");
  const [customCursorPos, setCustomCursorPos] = useState({ x: 0, y: 0 });
  const [isCustomCursorVisible, setIsCustomCursorVisible] = useState(false);
  const [useCustomElementCursor, setUseCustomElementCursor] = useState(false); // Flag to control which cursor system to use
  const [isLeaveModalVisible, setIsLeaveModalVisible] =
    useState<boolean>(false);

  const [timer, setTimer] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState("*");
  const [numOfRounds, setNumOfRounds] = useState("*");

  const [wordOptions, setWordOptions] = useState<WordOption[]>([]);
  const [showWordSelection, setShowWordSelection] = useState<boolean>(false);
  const [selectedWord, setSelectedWord] = useState<string>("");
  const drawerScoreRef = useRef<number>(0);

  const [isSelectingPainter, setIsSelectingPainter] = useState<boolean>(false);
  const [showChoosingModal, setShowChoosingModal] = useState<boolean>(false);
  const [loadedSelectingWord, setLoadedSelectingWord] =
    useState<boolean>(false);
  const [isfirstRound, setisFirstRound] = useState<boolean>(true);
  const [currentWordModal, setCurrentWordModal] = useState<string>("");

  const wordToGuess = selectedWord || "placeholder"; //PLACEHOLDER WORD
  const [currentPainterUsername, setCurrentPainterUsername] = useState<
    string | null
  >(null);

  const isPainterRef = useRef(false);
  const { play, stop } = useSound();

  //letterRevealing
  const [roundStartTime, setRoundStartTime] = useState<number | null>(null);
  const [revealedIdx, setRevealedIdx] = useState<number[]>([]);
  const [roundHash, setRoundHash] = useState<number | null>(null);

  function delay(ms = 1000) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  useEffect(() => {
    isPainterRef.current = isCurrentUserPainter;
  }, [isCurrentUserPainter]);

  useEffect(() => {
    if (
      //sound between rounds
      !loadedSelectingWord &&
      selectedWord === "default_word" &&
      !showWordSelection &&
      !isfirstRound
    ) {
      // we only care about the current user’s diff
      const diff = diffScores[String(currentUserId)] ?? 0;

      stop("tick"); // stop the countdown sound (if any)

      if (diff !== 0) {
        play("roundEnd"); // positive / got points
      } else {
        play("roundLost"); // no points this round
      }
    }

    //sound guesser
    else if (
      !isCurrentUserPainter &&
      selectedWord === "default_word" &&
      showChoosingModal &&
      loadedSelectingWord &&
      !isLastRound
    ) {
      play("guess");

      //sound painter
    } else if (
      isCurrentUserPainter &&
      showWordSelection &&
      selectedWord === "default_word"
    ) {
      play("guess");
    }

    //sound painter
  }, [loadedSelectingWord, selectedWord, showWordSelection, isfirstRound]); // <- rerun whenever the diff object updates

  useEffect(() => {
    if (timer === null) return;

    // if round starts (timer reset)
    if (roundStartTime === null || timer > roundStartTime) {
      setRevealedIdx([]); // delete old indexes again
      if (currentPainterUsername) {
        setRoundHash(hashString(currentPainterUsername));
      }
    }
  }, [timer, currentPainterUsername]);

  //helper to make revealed letters not random for all players in lobby
  function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  useEffect(() => {
    //check if word is picked yet
    if (
      roundStartTime === null ||
      timer === null ||
      isCurrentUserPainter ||
      selectedWord === "default_word" ||
      selectedWord === "placeholder"
    )
      return;

    //calculate maxReveal based on word length
    const maxReveal = Math.max(
      1,
      Math.floor(selectedWord.replace(/ /g, "").length * 0.38)
    );

    //calculate interval time of reveal
    const interval = roundStartTime / (maxReveal + 1);

    //how many reveals already?
    const revealsShouldHaveHappened = Math.floor(
      (roundStartTime - timer) / interval
    );

    //less reveals then their should be?
    if (revealsShouldHaveHappened > revealedIdx.length) {
      // filter spaces for reveal
      const candidates = selectedWord
        .split("")
        .map((c, i) => (c !== " " && !revealedIdx.includes(i) ? i : -1))
        .filter((i) => i !== -1);

      if (candidates.length) {
        //set revealed indexes using hash to make it same for all clients
        const next =
          candidates[(roundHash! + revealedIdx.length) % candidates.length];
        setRevealedIdx((prev) => [...prev, next]);
      }
    }
  }, [timer]);

  const triggerNextPainterSelection = async () => {
    console.log(
      "triggerNextPainterSelection called at:",
      new Date().toISOString()
    );
    if (!lobbyId) {
      console.error("Cannot select next painter: Lobby ID missing.");
      return;
    }
    try {
      const updatedLobby = await apiService.post<LobbyData>(
        `/lobbies/${lobbyId}/nextPainter`,
        {}
      );
      setLobby(updatedLobby);

      console.log(
        "Lobby updated with new painter:",
        updatedLobby.currentPainterToken
      );
      if (!updatedLobby.currentPainterToken) {
        console.warn("Backend returned null currentPainterToken");
      }
    } catch (error) {
      console.error("Error selecting next painter:", error);
      message.error("Failed to select next painter.");
    }
  };

  // function delay(ms = 1000) {
  //   return new Promise((resolve) => setTimeout(resolve, ms));
  // }

  const fetchWordOptions = async () => {
    console.log("THE WORD FETCHER: ", isCurrentUserPainter);
    const lobbyData = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
    if (!lobbyData) {
      console.error("Error: Couldnt connect to server");
    }
    //only allow word options if word hasnt been picked yet
    console.log(lobbyData.currentWord);
    console.log(typeof lobbyData.currentWord);
    console.log(JSON.stringify(lobbyData.currentWord));
    if (
      !(
        lobbyData.currentWord == '"default_word"' ||
        lobbyData.currentWord == "default_word"
      )
    ) {
      console.log(
        "Skipping word fetch: User already picked a word",
        lobbyData.currentWord
      );
      return;
    }

    if (!isCurrentUserPainter) {
      console.log("Skipping word fetch: User is not the current painter");

      return;
    }
    if (!lobby) {
      console.log("Skipping word fetch: Lobby not loaded");
      return;
    }

    try {
      const language = lobby.language;
      const wordType = lobby.type;

      console.log(`Fetching words: lang=${language}, type=${wordType}`);

      const response = await apiService.get<string[]>(
        `/api/words/gpt?lang=${language}&type=${wordType}&count=3`
      );
      await new Promise((f) => setTimeout(f, 1000));

      if (response && Array.isArray(response)) {
        console.log("API response:", response);
        const options = response.map((word) => ({ word, selected: false }));
        setWordOptions(options);
        if (socket) {
          console.log("SELECTING WORD LOG");
          await socket.emit("selecting-word");
        }

        setShowWordSelection(true);

        //reset diffscore
        setDiffScores(
          Object.fromEntries(
            lobbyData.playerIds.map((id) => [id.toString(), 0])
          )
        );
      } else {
        console.error("Invalid response format for word options:", response);
        if (socket) {
          console.log("SELECTING WORD LOG");
          await socket.emit("selecting-word");
        }
        setWordOptions([
          { word: "apple", selected: false },
          { word: "banana", selected: false },
          { word: "cherry", selected: false },
        ]);
        setShowWordSelection(true);
      }

      setisFirstRound(false);
    } catch (error) {
      console.error("Error fetching word options:", error);
      setWordOptions([
        { word: "apple", selected: false },
        { word: "banana", selected: false },
        { word: "cherry", selected: false },
      ]);
      setShowWordSelection(true);
    }
  };

  // Trigger fetchWordOptions when isCurrentUserPainter changes
  useEffect(() => {
    const asyncFetch = async () => {
      if (isCurrentUserPainter) {
        console.log("User became painter, trying to fetch word options");

        fetchWordOptions();
      }
    };
    asyncFetch();
  }, [isCurrentUserPainter]);

  const handleWordSelect = async (selectedIndex: number) => {
    if (selectedIndex < 0 || selectedIndex >= wordOptions.length) {
      console.error("Invalid word selection index:", selectedIndex);
      return;
    }

    // Update the selected state
    const updatedOptions = wordOptions.map((option, index) => ({
      ...option,
      selected: index === selectedIndex,
    }));

    setWordOptions(updatedOptions);

    // Set the selected word
    const word = wordOptions[selectedIndex].word;
    setSelectedWord(word);
    await apiService.put<LobbyData>(`/lobbies/${lobbyId}/word`, word);

    // Emit the selected word to other players via socket
    if (socket) {
      console.log(`Emitting selected word "${word}" to other players`);
      setShowWordSelection(false);
      socket.emit("clear");

      //Tell other clients you are drawing
      const currentUserName = localStorage.getItem("username");
      console.log(currentUserName);
      socket.emit("chatMessage", {
        lobbyId: lobbyId,
        message: "alert3wd3orjfojedfwvkvie2_",
        username: currentPainterUsername,
      });
      //clear again locally cause of bugs
      const canvas = canvasElementRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      remoteUsersLastPointRef.current.clear();
      saveCanvasState();
      setCurrentWordModal(word);

      await socket.emit("startTimer", {
        lobbyId,
        drawTime: lobby?.drawTime,
        numOfRounds: lobby?.numOfRounds,
      });

      await socket.emit("word-selected", {
        lobbyId,
        word,
      });
    }
  };

  // const wordToGuess = selectedWord || "noword";

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Get mouse position relative to the page
    setCustomCursorPos({ x: e.pageX, y: e.pageY });

    // If the custom element should be active but isn't visible yet, make it visible
    if (useCustomElementCursor && !isCustomCursorVisible) {
      setIsCustomCursorVisible(true);
    }
  };

  // 1. Callback for IMMEDIATE LOCAL drawing
  const handleLocalDraw = useCallback(
    ({ ctx, currentPoint, prevPoint }: Draw) => {
      // Use current color and brushSize state for local drawing
      drawLine({ prevPoint, currentPoint, ctx, color, brushSize });
    },
    [color, brushSize]
  ); // Dependencies: re-create if color or size changes

  // --- Callback for THROTTLED BATCH EMISSION ---
  const handleDrawEmitBatch = useCallback(
    (batchData: DrawBatchData) => {
      // console.log(`Emitting batch of ${batchData.points.length} points`); // Debug
      if (socket && activeTool === "brush" && batchData.points.length > 0) {
        socket.emit("draw-line-batch", {
          // Use a distinct event name for batches
          points: batchData.points,
          color, // Add current color
          brushSize, // Add current brush size
        });
      }
    },
    [socket, color, brushSize, activeTool]
  );

  // --- Save Canvas State Function ---
  const saveCanvasState = useCallback(() => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const currentImageData = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
    setHistoryStack((prev) => {
      // Optimization: Avoid saving if identical to the last state
      // This helps prevent duplicates from rapid events but is less critical now
      // if (prev.length > 0) {
      //     const lastData = prev[prev.length - 1].data;
      //     if (lastData.byteLength === currentImageData.data.byteLength &&
      //         lastData.every((value, index) => value === currentImageData.data[index])) {
      //          console.log("Skipping save, state identical."); // Debug
      //         return prev;
      //     }
      // }
      const newHistory = [...prev, currentImageData];
      if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
      }
      // console.log("Canvas state saved. History size:", newHistory.length); // Debug
      return newHistory;
    });
  }, []); // Should have empty dependencies

  const loadCanvasFromDataUrl = useCallback(
    (dataUrl: string, resetHistory: boolean) => {
      const canvas = canvasElementRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;
      const image = new Image();
      image.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0);
        if (resetHistory) {
          const newImageData = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
          );
          setHistoryStack([newImageData]); // Reset history with this state
        }
        setIsCanvasInitialized(true); // Mark as loaded
      };
      image.onerror = (err) => {
        console.error("Failed to load image for canvas state:", err);
        setIsCanvasInitialized(true); // Still mark done to avoid retries
      };
      image.src = dataUrl;
    },
    []
  ); // No dependencies needed for setters

  // --- Draw End Emit Callback ---
  const handleDrawEndEmit = useCallback(() => {
    if (socket && activeTool === "brush") {
      // console.log("Brush stroke ended"); // Debug
      // Emit the signal for remote clients
      socket.emit("draw-end");
      // console.log("Emitted draw-end"); // Debug

      // --- CRUCIAL: Save the state AFTER the brush stroke is finished ---
      // console.log("Saving state AFTER brush stroke end"); // Debug
      saveCanvasState();
    }
    // Do nothing if another tool was active when mouseup occurred
  }, [socket, activeTool, saveCanvasState]); // Add saveCanvasState dependency

  const handleCanvasMouseEnter = () => {
    // Show custom cursor only if the fill tool is active
    if (useCustomElementCursor) {
      setIsCustomCursorVisible(true);
    }
  };
  // --- Setup useDraw Hook with Batching ---
  const THROTTLE_MILLISECONDS = 75;
  const { canvasRef: hookCanvasRef, onMouseDown } = useDraw(
    handleLocalDraw,
    handleDrawEmitBatch,
    handleDrawEndEmit,
    THROTTLE_MILLISECONDS
  );

  const handleCanvasMouseLeave = () => {
    // Always hide custom cursor when leaving the canvas
    setIsCustomCursorVisible(false);
  };

  const combinedCanvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      canvasElementRef.current = node; // For direct access (undo/history)
      hookCanvasRef(node); // For useDraw hook
      // Ensure canvas dimensions are set after node exists (could also be done in useDraw's ref callback)
      if (node) {
        node.width = 650; // Or dynamic size
        node.height = 500;
      }
    },
    [hookCanvasRef]
  ); // Dependency on hookCanvasRef

  // --- Flood Fill Implementation ---
  const floodFill = (
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    fillColorHex: string
  ) => {
    const canvas = ctx.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data; // Pixel data array (RGBA)

    const fillColorRgba = hexToRgba(fillColorHex);
    if (!fillColorRgba) {
      console.error("Invalid fill color hex:", fillColorHex);
      return; // Invalid fill color
    }

    // Helper to get color at a point
    const getPixel = (
      x: number,
      y: number
    ): [number, number, number, number] => {
      if (x < 0 || y < 0 || x >= width || y >= height) {
        return [-1, -1, -1, -1]; // Out of bounds marker
      }
      const offset = (y * width + x) * 4;
      return [
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
      ];
    };

    // Helper to compare colors (RGBA arrays)
    const colorsMatch = (c1: number[], c2: number[]): boolean => {
      return (
        c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2] && c1[3] === c2[3]
      );
    };

    const targetColor = getPixel(startX, startY);

    if (targetColor[0] === -1) return; // Clicked out of bounds
    if (colorsMatch(targetColor, fillColorRgba)) return; // Clicked area is already the fill color

    const queue: [number, number][] = [[startX, startY]]; // Queue of [x, y] coordinates

    while (queue.length > 0) {
      const [x, y] = queue.shift()!; // Get next pixel coordinates
      const currentColor = getPixel(x, y);

      if (currentColor[0] !== -1 && colorsMatch(currentColor, targetColor)) {
        // Set the pixel color in imageData
        const offset = (y * width + x) * 4;
        data[offset] = fillColorRgba[0]; // R
        data[offset + 1] = fillColorRgba[1]; // G
        data[offset + 2] = fillColorRgba[2]; // B
        data[offset + 3] = fillColorRgba[3]; // A

        // Add neighbors to the queue
        queue.push([x + 1, y]);
        queue.push([x - 1, y]);
        queue.push([x, y + 1]);
        queue.push([x, y - 1]);
      }
    }

    // Put the modified pixel data back onto the canvas
    ctx.putImageData(imageData, 0, 0);
  };

  // --- Fill Tool MouseDown Handler (Saves state AFTER fill) ---
  const handleFillMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // ... (get context, coords, etc.) ...
      const canvas = canvasElementRef.current;
      if (!canvas || !socket) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.round((e.clientX - rect.left) * scaleX);
      const y = Math.round((e.clientY - rect.top) * scaleY);
      const currentFillColor = color;

      // Perform local flood fill
      floodFill(ctx, x, y, currentFillColor);
      // Emit the fill event
      socket.emit("fill-area", { x, y, color: currentFillColor });
      // Save state AFTER local action
      saveCanvasState();
    },
    [socket, color, floodFill, saveCanvasState]
  );

  // --- Combined MouseDown Handler (REMOVED saveCanvasState) ---
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isCurrentUserPainter) {
        console.log("Drawing blocked: User is not the current painter");
        return;
      }
      if (activeTool === "brush") {
        onMouseDown(e);
      } else if (activeTool === "fill") {
        handleFillMouseDown(e);
      } else {
        console.warn(`Unexpected activeTool value: ${activeTool}`);
      }
    },
    [activeTool, onMouseDown, handleFillMouseDown, isCurrentUserPainter]
  );

  useEffect(() => {
    const fetchLobbyInfos = async () => {
      const lobbyState = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);

      if (!lobbyState) {
        console.error("Server connection failed, could not fetch lobbystate");
        return;
      }

      // Bereinige die Quotes, wenn nötig
      let cleanWord = lobbyState.currentWord;

      try {
        // Nur parsen, wenn es tatsächlich ein JSON-String ist
        cleanWord = JSON.parse(lobbyState.currentWord);
      } catch (err) {
        console.error(err);
      }

      setSelectedWord(cleanWord);
      console.log("Final wordToGuess:", cleanWord);
      await socket?.emit("get-round-infos", lobbyId);
    };

    fetchLobbyInfos();

    console.log("Painter Status:", {
      isCurrentUserPainter,
      currentPainterToken: lobby?.currentPainterToken,
      currentUserToken,
    });

    fetchUsernamesForLobby();
  }, [isCurrentUserPainter, currentUserToken, lobby]);

  useEffect(() => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;

    let newCursorStyle = "crosshair"; // Default if no tool active or custom element used
    let useCustomElement = false; // Reset flag

    if (activeTool === "fill") {
      // --- Enable Custom DOM Element Cursor for Fill ---
      newCursorStyle = "none"; // Hide the default cursor
      useCustomElement = true; // Signal to use the custom element
      console.log(
        "Cursor Effect: Enabling custom DOM element cursor for Fill."
      );
    } else if (activeTool === "brush") {
      // --- Use SVG Data URL for Brush (Assuming this works) ---
      // ... (Keep the existing brush SVG generation logic) ...
      const size = Math.max(brushSize, 2);
      const radius = size / 2;
      const strokeWidth = 1;
      const svgSize = size + strokeWidth * 2;
      const center = svgSize / 2;
      const originalRgb = hexToRgb(color);
      let finalFillColor = "rgba(0,0,0,0.5)";
      if (originalRgb) {
        const darkerRgb = darkenRgb(originalRgb, 0.2);
        const alpha = Math.max(0, Math.min(1, 0.6));
        finalFillColor = rgbToRgbaString(darkerRgb, alpha);
      }
      const brushSvg = `<svg width="${svgSize}" height="${svgSize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg"><circle cx="${center}" cy="${center}" r="${radius}" fill="${finalFillColor}" stroke="grey" stroke-width="${strokeWidth}"/></svg>`;
      const brushDataUrl = `data:image/svg+xml;base64,${btoa(brushSvg)}`;
      const hotspot = Math.floor(center);
      newCursorStyle = `url(${brushDataUrl}) ${hotspot} ${hotspot}, crosshair`; // Set the brush cursor
      useCustomElement = false; // Don't use custom element for brush
      console.log("Cursor Effect: Setting SVG data URL cursor for Brush.");
    } else {
      // Default cursor if no specific tool is active
      useCustomElement = false;
      newCursorStyle = "crosshair"; // Or 'default'
    }

    // Apply the basic cursor style (e.g., 'none' or the brush SVG)
    setCursorStyle(newCursorStyle);
    // Set the flag to control the custom DOM element's visibility/behavior
    setUseCustomElementCursor(useCustomElement);
  }, [activeTool, brushSize, color]);

  // Fetch lobby data
  // Join then fetch lobby & pick a painter
  useEffect(() => {
    const joinThenFetch = async () => {
      console.log(score);
      setLoading(true);
      try {
        // 1) Join
        await apiService.put(
          `/lobbies/${lobbyId}/join?playerId=${currentUserId}`,
          {}
        );

        // 2) Fetch
        const lobbyData = await apiService.get<LobbyData>(
          `/lobbies/${lobbyId}`
        );

        console.log("Join fetch response:", {
          lobbyId,
          playerIds: lobbyData.playerIds,
          currentPainterToken: lobbyData.currentPainterToken,
        });

        // 3) Set lobby and painter status

        if (!lobby?.currentPainterToken) {
          setLobby(lobbyData);
        }

        setRoundStartTime(lobbyData?.drawTime);

        setIsCurrentUserPainter(
          lobbyData.currentPainterToken === currentUserToken
        );
      } catch (err) {
        console.error("Join error:", err);
      } finally {
        setLoading(false);
      }
    };

    if (currentUserId) {
      joinThenFetch();
    }
  }, []); // Removed apiService assuming it's stable

  useEffect(() => {
    const assignPainterIfNeeded = async () => {
      if (loading) {
        console.log("Skipping painter assignment:", {
          loading,
          lobby,
          lobbyId,
          currentUserId,
        });
        return;
      }

      try {
        // Fetch the current lobby state
        const lobbyData = await apiService.get<LobbyData>(
          `/lobbies/${lobbyId}`
        );

        // Only assign painter if no painter exists and user is lobby owner
        if (
          !lobbyData.currentPainterToken &&
          lobby?.lobbyOwner.toString() === currentUserId
        ) {
          // Assign the next painter
          const updatedLobby = await apiService.post<LobbyData>(
            `/lobbies/${lobbyId}/nextPainter`,
            {}
          );

          // Update the lobby state
          setLobby(updatedLobby);

          // Use the updatedLobby from the POST response to set painter status
          console.log("Painter token check:", {
            currentUserToken,
            painterToken: updatedLobby.currentPainterToken,
          });
          setIsCurrentUserPainter(
            updatedLobby.currentPainterToken === currentUserToken
          );

          if (!socket) return;
          socket?.emit("painter-selection-complete", { lobbyId });
        } else {
          // If no painter assignment is needed, use the fetched lobby data
          setLobby(lobbyData);
          console.log("Painter token checkasdhusdifhuisdhif:");
          setIsCurrentUserPainter(
            lobbyData.currentPainterToken === currentUserToken
          );
        }

        setLoading(true);
      } catch (err) {
        console.error("Painter assignment error:", err);
      }
    };

    if (!loading && socket) {
      assignPainterIfNeeded();
    }
  }, [loading, socket]);

  useEffect(() => {
    // Remove the automatic timer start from here
    // Optionally, you can add a log to confirm the socket and lobby are ready
    if (socket && lobby && lobby.drawTime) {
      console.log(
        "Socket and lobby ready, waiting for word selection to start timer:",
        lobbyId
      );
    }
  }, [socket, lobby, lobbyId]);

  // IMPLEMENT LATER REMIND ILIAS IF YOU SEE THIS
  //  const showLeaveConfirmation = () => {
  //    setIsLeaveModalVisible(true);
  //  };

  // --- Refactor leave logic into a stable function ---
  const performLeaveLobby = useCallback(async (redirect = true) => {
    if (!currentUserId || !lobbyId || !socket) {
      console.warn("Attempted to leave lobby without necessary info.");
      if (redirect) router.push("/home");
      return;
    }

    console.log(
      `Performing leave action for user ${currentUserId} from lobby ${lobbyId}`
    );

    try {
      // Notify backend first
      await apiService.put(
        `/lobbies/${lobbyId}/leave?playerId=${currentUserId}`,
        {}
      );
      console.log(
        `Backend notified of user ${currentUserId} leaving lobby ${lobbyId}`
      );

      // Then notify other players via socket
      socket.emit("leaveLobby", { lobbyId, userId: currentUserId });
      console.log(
        `Socket event 'leaveLobby' emitted for user ${currentUserId}`
      );

      if (redirect) {
        message.success("You have left the lobby");
        router.push("/home");
      }
    } catch (error) {
      console.error("Error leaving lobby:", error);
      if (redirect) {
        message.error("Failed to leave lobby cleanly, redirecting anyway");
        router.push("/home");
      }
    } finally {
      setIsLeaveModalVisible(false); // Ensure modal closes if open
      // Clean up disconnect timer info from session storage if it exists
      sessionStorage.removeItem(DISCONNECT_TIMEOUT_ID_KEY);
      sessionStorage.removeItem(DISCONNECT_LOBBY_ID_KEY);
    }
  }, []); // Dependencies for the leave action

  const handleLeaveLobby = () => {
    // Clear any pending automatic disconnect timer *before* manually leaving
    const timeoutId = sessionStorage.getItem(DISCONNECT_TIMEOUT_ID_KEY);
    if (timeoutId) {
      console.log(
        "Clearing pending auto-disconnect timer due to manual leave."
      );
      clearTimeout(Number(timeoutId));
      sessionStorage.removeItem(DISCONNECT_TIMEOUT_ID_KEY);
      sessionStorage.removeItem(DISCONNECT_LOBBY_ID_KEY);
    }
    performLeaveLobby(true); // Perform the leave action with redirection
  };

  const handleCancelLeave = () => {
    setIsLeaveModalVisible(false);
  };

  function capitalizeFirstLetter(val: string) {
    return String(val).charAt(0).toUpperCase() + String(val).slice(1);
  }

  // --- Color Picker Toggle Handler ---
  const toggleColorPicker = () => {
    setIsColorPickerVisible((prev) => !prev);
  };

  // Color Select might implicitly select brush tool, or keep current tool
  const handleColorSelect = (selectedColor: string) => {
    setColor(selectedColor);
    setIsColorPickerVisible(false);
    // Optional: setActiveTool('brush'); // Uncomment if changing color should always switch to brush
  };

  // --- Tool Change Handler ---
  const handleToolChange = (tool: Tool) => {
    setActiveTool(tool);
    // Deselect other tools visually if needed (CSS handles this with .active-tool)
  };

  // --- Brush Size Change Handler ---
  // Brush Size Change also selects the brush tool
  const handleBrushSizeChange = (newSize: number) => {
    setActiveTool("brush"); // Select brush tool when a size is clicked
    setBrushSize(newSize);
  };

  // --- Undo Handler (with sync) ---
  const handleUndo = useCallback(() => {
    // ... (Implementation from previous step: local undo + emit sync-request) ...
    if (!isCurrentUserPainter) {
      console.log("Undo blocked: User is not the current painter.");
      return;
    } //makes sure only painter can undo
    if (historyStack.length === 0 || !socket) return;
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const newHistory = historyStack.slice(0, -1);
    setHistoryStack(newHistory);
    const prevState =
      newHistory.length > 0 ? newHistory[newHistory.length - 1] : null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (prevState) {
      ctx.putImageData(prevState, 0, 0);
    }
    const restoredDataUrl = canvas.toDataURL("image/png");
    socket.emit("sync-request", { dataUrl: restoredDataUrl });
  }, [historyStack, socket]);

  // --- Helper: Hex to RGBA ---
  const hexToRgba = (hex: string): [number, number, number, number] | null => {
    if (!hex || hex.charAt(0) !== "#") return null;
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16), // R
          parseInt(result[2], 16), // G
          parseInt(result[3], 16), // B
          255, // A (alpha is always 255 for fill)
        ]
      : null;
  };

  function hexToRgb(hex: string): RGB | null {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  // Darkens an RGB color by a percentage (0-1)
  function darkenRgb(rgb: RGB, percent: number): RGB {
    const factor = 1 - percent;
    return {
      r: Math.max(0, Math.floor(rgb.r * factor)),
      g: Math.max(0, Math.floor(rgb.g * factor)),
      b: Math.max(0, Math.floor(rgb.b * factor)),
    };
  }

  // Converts an RGB object and alpha value to an RGBA string
  function rgbToRgbaString(rgb: RGB, alpha: number): string {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  // const usernameColorsRef = useRef<{ [key: string]: string }>({});

  //   function getUsernameColor(username: string): string {
  //   const usernameColors = usernameColorsRef.current;

  //   if (!username || typeof username !== 'string') return 'black';

  //   if (usernameColors[username]) {
  //     return usernameColors[username];
  //   }

  //   const availableColors = colorPool.filter(
  //     (color) => !Object.values(usernameColors).includes(color)
  //   );

  //   const newColor =
  //     availableColors.length > 0
  //       ? availableColors[Math.floor(Math.random() * availableColors.length)]
  //       : '#' + Math.floor(Math.random() * 16777215).toString(16);

  //   usernameColors[username] = newColor;
  //   return newColor;
  // }

  // --- Socket useEffect ---
  useEffect(() => {
    let isMounted = true;
    let socketIo: Socket | null = null;

    const connectAndSetupSocket = async () => {
      // --- Check for pending disconnect on mount ---
      const storedTimeoutId = sessionStorage.getItem(DISCONNECT_TIMEOUT_ID_KEY);
      const storedLobbyId = sessionStorage.getItem(DISCONNECT_LOBBY_ID_KEY);

      if (storedTimeoutId && storedLobbyId && storedLobbyId === lobbyId) {
        console.log(
          `[Mount] Found pending disconnect timer (${storedTimeoutId}) for this lobby (${lobbyId}). Clearing it.`
        );
        clearTimeout(Number(storedTimeoutId));
        sessionStorage.removeItem(DISCONNECT_TIMEOUT_ID_KEY);
        sessionStorage.removeItem(DISCONNECT_LOBBY_ID_KEY);
      } else if (storedTimeoutId || storedLobbyId) {
        console.log(
          "[Mount] Cleaning up stale disconnect timer info from session storage."
        );
        sessionStorage.removeItem(DISCONNECT_TIMEOUT_ID_KEY);
        sessionStorage.removeItem(DISCONNECT_LOBBY_ID_KEY);
      }

      // http://localhost:3001 https://socket-server-826256454260.europe-west1.run.app/
      socketIo = io(
        "https://socket-server-826256454260.europe-west1.run.app/",
        {
          path: "/api/socket",
        }
      );
      setSocket(socketIo);


      // --- Join Logic ---
      try {
        const userData = await apiService.get<{ id: number; username: string }>(
          `/users/${currentUserId}`
        );
        socketIo.emit("joinLobby", {
          lobbyId,
          userId: currentUserId,
          username: userData.username,
        });
        socketIo.emit("joinGame", {
          lobbyId,
          userId: currentUserId,
          username: userData.username,
        });
        console.log("Emitted joinLobby");
      } catch (error) {
        console.error("Error fetching username for join:", error);
        socketIo.emit("joinLobby", {
          lobbyId,
          userId: currentUserId,
          username: "Guest",
        });
      }

      // --- Request initial state ---
      if (!isCanvasInitialized && isMounted) {
        console.log("Requesting initial state...");
        socketIo.emit("request-initial-state");
      }

      // --- Socket Event Listeners ---
      socketIo.on("connect", () => {
        console.log("Socket connected:", socketIo?.id);
      });
      socketIo.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
        if (isMounted) {
          message.warning("Disconnected from server.");
        }
      });

      socketIo.on("timerUpdate", (newTime: number) => {
        setTimer(newTime);
        if (newTime == 15) {
          play("tick");
        }
      });

      socketIo.on("word-selected", (data) => {
        console.log("Received selected word from another player:", data.word);
        setSelectedWord(data.word);
        setShowWordSelection(false);
        setCurrentWordModal(data.word);
        drawerScoreRef.current = 0;
      });

      socketIo.on("roundEnded", async () => {
        await apiService.put<LobbyData>(
          `/lobbies/${lobbyId}/word`,
          "default_word"
        );

        setisFirstRound(false);
        console.log("Round ended at:", new Date().toISOString());

        setShowChoosingModal(false);
        setCurrentPainterUsername(null);
        setIsCurrentUserPainter(false);
        setSelectedWord("");
        setShowWordSelection(false);
        setIsSelectingPainter(true); // NEW: Block navigation
        setLoadedSelectingWord(false);
        stop("tick");
        setRevealedIdx([]); // delete indexes

        const iWasPainter = isPainterRef.current; // ← value **before** resets
        setIsCurrentUserPainter(false); // local UI only

        if (iWasPainter) {
          console.log("Current painter triggering next painter selection");
          try {
            await triggerNextPainterSelection();
            socketIo?.emit("painter-selection-complete", { lobbyId });
            console.log("emit painter-selection-complete");
          } catch (err) {
            console.error("Error in triggerNextPainterSelection:", err);
            message.error("Failed to select next painter");
          }
        } else {
          console.log("Non-painter waiting for painter selection");
        }
      });

      socketIo.on("gameEnded", async () => {
        console.log("Round ended at:", new Date().toISOString());
        setLastLoading(true);
        setLoadedSelectingWord(false);
        setSelectedWord("default_word");
        setShowWordSelection(false);
        await delay(1500);
        setIsLastRound(true);
        play("leaderboard");
      });

      socketIo.on("painter-selection-complete", async () => {
        console.log(
          "Received painter-selection-complete, fetching lobby state"
        );

        try {
          const lobbyData = await apiService.get<LobbyData>(
            `/lobbies/${lobbyId}`
          );
          console.log(
            `Fetched lobby ${lobbyId}, NEW TOKEN: ${lobbyData.currentPainterToken}`
          );

          console.log("STEP 1 PASSED");
          const currentPainterToken = lobbyData.currentPainterToken;
          console.log(lobbyData?.playerIds);
          for (const id of lobbyData?.playerIds ?? []) {
            console.log("STEP 2 PASSED", id);
            const userData = await apiService.get<{
              id: number;
              token: string;
              username: string;
            }>(`/users/${id}`);
            console.log("STEP 3 PASSED", showChoosingModal);

            if (userData.token == currentPainterToken) {
              console.log(userData.username);
              await setCurrentPainterUsername(userData.username);
              break;
            }
          }
          console.log("STEP 4 PASSED", currentPainterUsername);
          setShowChoosingModal(true);

          setLobby(lobbyData);
          setIsCurrentUserPainter(
            lobbyData.currentPainterToken === currentUserToken
          );

          setIsSelectingPainter(false); // NEW: Allow navigation
        } catch (err) {
          console.error("Failed to fetch lobby:", err);
          message.error("Could not update lobby state");
        }
      });

      socketIo.on("gameUpdate", (gameData) => {
        console.log("Received gameUpdate:", gameData);
        if (isMounted) {
          setLobby((prev) =>
            prev && gameData.playerIds
              ? { ...prev, playerIds: gameData.playerIds }
              : prev
          );
          setCurrentRound(gameData.currentRound ?? currentRound);
          setNumOfRounds(gameData.numOfRounds ?? numOfRounds);
        }
      });

      socketIo.on("load-canvas-state", (data: LoadCanvasStateData) => {
        if (!isCanvasInitialized && data.dataUrl && isMounted) {
          console.log("Received load-canvas-state. Loading canvas...");
          loadCanvasFromDataUrl(data.dataUrl, true);
        }
      });

      socketIo.on("get-canvas-state", (data: GetCanvasStateData) => {
        if (
          canvasElementRef.current &&
          socketIo &&
          data.requesterId != currentUserId
        ) {
          console.log(
            `Received request to provide canvas state for ${data.requesterId}. Sending...`
          );
          const currentDataUrl =
            canvasElementRef.current.toDataURL("image/png");
          socketIo.emit("send-canvas-state", {
            targetUserId: data.requesterId,
            dataUrl: currentDataUrl,
          });
        }
      });

      socketIo.on("draw-line-batch", (data: DrawBatchEmitDataWithUser) => {
        console.log("received drawing information from socket server");
        const canvas = canvasElementRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const drawerUserId = data.userId;
        const lastPointForUser =
          remoteUsersLastPointRef.current.get(drawerUserId) || null;
        let prevPointForDrawing: Point | null = lastPointForUser;

        if (!data.points || data.points.length === 0) return;

        for (const currentPoint of data.points) {
          drawLine({
            prevPoint: prevPointForDrawing,
            currentPoint,
            ctx,
            color: data.color,
            brushSize: data.brushSize,
          });
          prevPointForDrawing = currentPoint;
        }

        const finalPointInBatch = data.points[data.points.length - 1];
        remoteUsersLastPointRef.current.set(drawerUserId, finalPointInBatch);
      });

      socketIo.on("clear", (data: ClearEmitData) => {
        console.log(`Received clear instruction from user ${data.userId}`);
        const canvas = canvasElementRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        remoteUsersLastPointRef.current.clear();
        saveCanvasState();
      });

      socketIo.on("draw-end", (data: DrawEndData) => {
        remoteUsersLastPointRef.current.set(data.userId, null);
      });

      socketIo.on("fill-area", (data: FillAreaDataWithUser) => {
        const canvas = canvasElementRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        floodFill(ctx, data.x, data.y, data.color);
        saveCanvasState();
      });

      socketIo.on("sync-canvas", (data: SyncCanvasData) => {
        if (isMounted) {
          loadCanvasFromDataUrl(data.dataUrl, true);
        }
      });

      socketIo.on("playerLeft", (leftPlayer: { id: number | string }) => {
        const leftPlayerId = String(leftPlayer.id);
        if (remoteUsersLastPointRef.current.has(leftPlayerId)) {
          remoteUsersLastPointRef.current.delete(leftPlayerId);
          console.log(
            `Cleared last point state for user ${leftPlayerId} who left.`
          );
        }
      });

      socketIo.on("selecting-word", () => {
        setLoadedSelectingWord(true);
        setisFirstRound(false);
        const lobbyData = lobby;
        if (lobbyData) {
          setDiffScores(
            Object.fromEntries(
              lobbyData.playerIds.map((id) => [id.toString(), 0])
            )
          );
        }
        console.log("SELECTING WORD RECEIVED LOG");
      });

      socketIo.on("scoreUpdated", ({ playerId, score, drawer }) => {
        console.log(
          `[Score] Received score update for player ${playerId}: ${score} -> Drawer: ${drawer}`
        );
        if (drawer) {
          drawerScoreRef.current = Number(score);
          console.log(`DrawerScore: ${drawerScoreRef.current}`);
        } else {
          play("correctGuess");
        }

        setScores((prevScores) => {
          const lastScore = prevScores?.[playerId] ?? null;
          let diff = 0;
          if (!drawer) {
            diff = lastScore !== null ? score - lastScore : score;
          } else if (drawer) {
            diff =
              lastScore !== null
                ? drawerScoreRef.current - lastScore
                : drawerScoreRef.current;
            console.log(`Drawer Score: ${diff}`);
          }
          // Update diffScores as well
          setDiffScores((prevDiffs) => ({
            ...prevDiffs,
            [playerId]: diff,
          }));

          return {
            ...prevScores,
            [playerId]: score,
          };
        });
      });

      if (
        canvasElementRef.current &&
        historyStack.length === 0 &&
        !isCanvasInitialized &&
        isMounted
      ) {
        saveCanvasState();
      }
    };

    connectAndSetupSocket();

    return () => {
      console.log("[Unmount] GamePage cleanup running...");
      isMounted = false;

      console.log(
        "[Unmount] Client-side timer logic removed. Server handles disconnect delay."
      );

      if (socketIo) {
        console.log("[Unmount] Removing socket listeners...");
        socketIo.off("connect");
        socketIo.off("disconnect");
        socketIo.off("timerUpdate");
        socketIo.off("word-selected");
        socketIo.off("roundEnded");
        socketIo.off("gameUpdate");
        socketIo.off("load-canvas-state");
        socketIo.off("get-canvas-state");
        socketIo.off("draw-line-batch");
        socketIo.off("clear");
        socketIo.off("draw-end");
        socketIo.off("fill-area");
        socketIo.off("sync-canvas");
        socketIo.off("playerLeft");
        socketIo.off("selecting-word");
        socketIo.off("painter-selection-complete");
        socketIo.off("scoreUpdated");
        socketIo.off("gameEnded");
        // NEW: Delay disconnection to allow event receipt
        setTimeout(() => {
          console.log("[Unmount] Disconnecting socket after delay...");
          socketIo?.disconnect();
        }, 5000); // 5-second delay
      }
      setSocket(null);
    };
  }, [
    lobbyId,
    currentUserId,
    currentUserToken,
    isCanvasInitialized,
    loadCanvasFromDataUrl,
    saveCanvasState,
  ]); // NEW: Stable dependencies

  useEffect(() => {
    if (isSelectingPainter) {
      console.log("Blocking navigation during painter selection");
      const handleBeforePopState = () => {
        console.log("Preventing navigation during painter selection");
        return false; // Block navigation
      };
      window.history.pushState(null, "", window.location.href); // Prevent back/forward
      window.addEventListener("popstate", handleBeforePopState);
      return () => {
        window.removeEventListener("popstate", handleBeforePopState);
      };
    }
  }, [isSelectingPainter]);

  // --- Local Clear Function ---
  const socketClearCanvas = () => {
    if (!isCurrentUserPainter) {
      console.log("Clear blocked: User is not the current painter.");
      return;
    }

    if (socket) {
      socket.emit("clear");
    }
    const canvas = canvasElementRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteUsersLastPointRef.current.clear();
    saveCanvasState(); // Save the blank state
    console.log(usernameCache["1"]);
  };

  async function fetchUsernamesForLobby(): Promise<void> {
    try {
      const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
      const playerIds = response.playerIds;

      if (Array.isArray(playerIds)) {
        // Kopie vom aktuellen Cache
        const newCache = { ...usernameCache };

        for (const id of playerIds) {
          const stringId = String(id);

          if (!(stringId in newCache)) {
            const user = await apiService.get<{ id: number; username: string }>(
              `/users/${id}`
            );
            newCache[stringId] = user.username;
          }
        }

        setUsernameCache(newCache);
        console.log("[Usernames] Spielernamen geladen:", newCache);
      } else {
        console.error("[Usernames] Spieler-IDs sind kein Array:", playerIds);
      }
    } catch (error) {
      console.error("[Usernames] Fehler beim Abrufen der Spielernamen:", error);
    }
  }

  // --- Keep rendering logic (Loading, Not Found, Main Game UI) ---
  if (loading && !lobby) {
    // Show loading only if lobby isn't fetched yet
    return (
      <Layout
        socket={socket}
        lobbyId={lobbyId}
        currentUserId={currentUserId}
        localAvatarUrl={localAvatarUrl}
        lobby={lobby}
      >
        <div className="game-box">
          <Spin size="large" /> Loading Game...
        </div>
      </Layout>
    );
  }

  if (!lobby && !loading) {
    // Show not found only after loading attempt fails
    return (
      <Layout
        socket={socket}
        lobbyId={lobbyId}
        currentUserId={currentUserId}
        localAvatarUrl={localAvatarUrl}
        lobby={null}
      >
        <div className="login-register-box">
          <h1
            className="players-chat-title"
            style={{ marginTop: -10, marginBottom: 30, fontSize: 50 }}
          >
            Game Not Found
          </h1>
          <h2 className="players-chat-title">Lobby {`#${lobbyId}`}</h2>
          <Button className="green-button" onClick={() => router.push("/home")}>
            Back to home
          </Button>
        </div>
      </Layout>
    );
  }

  const fillCursorStyle: React.CSSProperties = {
    position: "absolute",
    // Adjust width/height to match your image dimensions
    width: "24px",
    height: "24px",
    backgroundImage: "url(/icons/fill-tool-cursor.svg)", // Your image path
    backgroundSize: "contain", // Or 'cover' or specific dimensions
    backgroundRepeat: "no-repeat",
    // IMPORTANT: Offset based on your desired hotspot (adjust these)
    // Moves the image so the hotspot aligns with the actual mouse position (customCursorPos)
    transform: "translate(-5px, -20px)", // Example: move left 5px, up 20px
    pointerEvents: "none", // Crucial: prevents the div from blocking canvas events
    zIndex: 9999, // Ensure it's above other elements
    display: useCustomElementCursor && isCustomCursorVisible ? "block" : "none", // Toggle visibility
    left: `${customCursorPos.x}px`,
    top: `${customCursorPos.y}px`,
  };

  return (
    <Layout
      socket={socket}
      lobbyId={lobbyId}
      currentUserId={currentUserId}
      localAvatarUrl={localAvatarUrl}
      lobby={lobby}
    >
      {" "}
      {/* <-- START React Fragment */}
      <div style={fillCursorStyle} />
      <div>
        {/* Game Box */}
        <div className="game-box">
          <div
            className="timer-area"
            style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              zIndex: 10,
            }}
          >
            <div>
              <div className="timer-container">
                <svg className="timer-circle" viewBox="0 0 100 100">
                  <circle className="timer-circle-bg" cx="50" cy="50" r="45" />
                  <circle
                    className="timer-circle-progress"
                    cx="50"
                    cy="50"
                    r="45"
                    style={{
                      strokeDashoffset:
                        timer !== null
                          ? 283 - (283 * timer) / (lobby?.drawTime || 60)
                          : 283,
                    }}
                  />
                </svg>
                <div className="timer-content">
                  <span className="timer-value">
                    {timer !== null ? timer : "--"}
                  </span>
                  <span className="timer-label">seconds</span>
                </div>
              </div>
              <div className="round-content">
                <span className="lable-round">
                  Round
                  <div style={{ display: "flex" }}>
                    {<div className="currentRound">{currentRound || "--"}</div>}
                    <span className="allRound">
                      &nbsp;of&nbsp;{numOfRounds || "--"}
                    </span>
                  </div>
                </span>
              </div>
            </div>
          </div>
          <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
          <h2 className="drawzone-subtitle-1-1rem">art battle royale</h2>
          {/* <Button
            onClick={() => {
              console.log("Start Timer clicked, lobbyId:", lobbyId);
              if (lobby && lobby.drawTime) {
                socket?.emit("startTimer", { 
                  lobbyId,
                  drawTime: lobby.drawTime // Pass the drawTime to server
                });
              } else {
                console.error("Cannot start timer: drawTime not available");
              }
            }}
          >
            Start Timer
          </Button> */}
          {/* Added a class */}
          <div className="word-display-area">
            <span className="word-to-guess">
              {wordToGuess === "default_word" || wordToGuess === "placeholder"
                ? Array.from({ length: 3 }).map((letter, index) => (
                    <span key={index} className={"word-letter space-letter"}>
                      {"\u00A0"}
                    </span>
                  ))
                : selectedWord
                    .toLowerCase()
                    .split("")
                    .map((char, idx) => {
                      const isSpace = char === " ";
                      const visible =
                        isCurrentUserPainter || revealedIdx.includes(idx);
                      return (
                        <span
                          key={idx}
                          className={`word-letter${
                            isSpace ? " space-letter" : ""
                          }`}
                        >
                          {isSpace ? "\u00A0" : visible ? char : "\u00A0"}
                        </span>
                      );
                    })}
            </span>
          </div>
          {/* Drawing Canvas */}
          <canvas
            ref={combinedCanvasRef}
            onMouseDown={handleCanvasMouseDown} // Use the combined handler
            style={{ cursor: cursorStyle }}
            onMouseMove={handleCanvasMouseMove}
            onMouseEnter={handleCanvasMouseEnter}
            onMouseLeave={handleCanvasMouseLeave}
            className="drawing-canvas"
          ></canvas>
          {/* Drawing Tools */}
          <div className="drawing-tools-arrangement">
            {/* --- Left Tool Group --- */}
            <div className="drawing-tools">
              {/* Color Picker Button */}
              <div style={{ position: "relative" }}>
                {" "}
                {/* Wrapper for positioning popup */}
                <button
                  ref={colorButtonRef} // Add ref to the button
                  className="tool-button color-picker-btn"
                  aria-label="Choose Color"
                  onClick={toggleColorPicker} // Attach toggle handler
                >
                  {/* Display current color */}

                  <img
                    src="/icons/color-wheel.svg"
                    alt="Color Picker"
                    className="tool-icon-image"
                  />
                </button>
                {/* --- NEW: Color Picker Popup --- */}
                {isColorPickerVisible && (
                  <div ref={colorPickerRef} className="color-picker-popup">
                    {colorPalette.map((paletteColor) => (
                      <button
                        key={paletteColor}
                        className="color-swatch"
                        style={{ backgroundColor: paletteColor }}
                        onClick={() => handleColorSelect(paletteColor)}
                        aria-label={`Select color ${paletteColor}`}
                      />
                    ))}
                  </div>
                )}
              </div>{" "}
              {/* End relative wrapper */}
              {/* --- UPDATED Brush Size Buttons --- */}
              <button
                className={`tool-button brush-size brush-size-1 ${
                  activeTool === "brush" && brushSize === brushSizes.size1
                    ? "active-tool"
                    : ""
                }`}
                aria-label="Brush Size 1"
                onClick={() => handleBrushSizeChange(brushSizes.size1)}
              >
                <div
                  className="brush-dot"
                  style={{ backgroundColor: color }}
                ></div>
              </button>
              <button
                className={`tool-button brush-size brush-size-2 ${
                  activeTool === "brush" && brushSize === brushSizes.size2
                    ? "active-tool"
                    : ""
                }`}
                aria-label="Brush Size 2"
                onClick={() => handleBrushSizeChange(brushSizes.size2)}
              >
                <div
                  className="brush-dot"
                  style={{ backgroundColor: color }}
                ></div>
              </button>
              <button
                className={`tool-button brush-size brush-size-3 ${
                  activeTool === "brush" && brushSize === brushSizes.size3
                    ? "active-tool"
                    : ""
                }`}
                aria-label="Brush Size 3"
                onClick={() => handleBrushSizeChange(brushSizes.size3)}
              >
                <div
                  className="brush-dot"
                  style={{ backgroundColor: color }}
                ></div>
              </button>
              <button
                className={`tool-button brush-size brush-size-4 ${
                  activeTool === "brush" && brushSize === brushSizes.size4
                    ? "active-tool"
                    : ""
                }`}
                aria-label="Brush Size 4"
                onClick={() => handleBrushSizeChange(brushSizes.size4)}
              >
                <div
                  className="brush-dot"
                  style={{ backgroundColor: color }}
                ></div>
              </button>
              {/* --- UPDATED Fill Tool Button --- */}
              <button
                className={`tool-button tool-icon ${
                  activeTool === "fill" ? "active-tool" : ""
                }`} // Add active class conditionally
                aria-label="Fill Tool"
                onClick={() => handleToolChange("fill")} // Set tool to 'fill' on click
              >
                <img
                  src="/icons/fill-tool-black.svg"
                  alt="Fill"
                  className="tool-icon-image"
                />
              </button>
            </div>

            {/* --- Right Tool Group --- */}
            <div className="drawing-tools">
              {/* Undo Tool */}
              <button
                className="tool-button tool-icon"
                aria-label="Undo"
                onClick={handleUndo}
                disabled={historyStack.length === 0}
              >
                <img
                  src="/icons/undo-tool-black.svg"
                  alt="Undo"
                  className="tool-icon-image"
                />
              </button>

              {/* Clear Tool (Trash Can) */}
              <button
                className="tool-button tool-icon"
                aria-label="Clear Canvas"
                onClick={socketClearCanvas} // <<< Use the emitting clear function
              >
                <img
                  src="/icons/trash-tool-black.svg"
                  alt="Clear"
                  className="tool-icon-image"
                />
              </button>
            </div>
          </div>{" "}
          {/* End drawing-tools-arrangement */}
        </div>{" "}
        {/* End game-box */}
        {/* Leave Confirmation Modal */}
        <Modal
          title={<div className="leave-modal-title">Leave Lobby</div>}
          open={isLeaveModalVisible}
          onOk={handleLeaveLobby}
          onCancel={handleCancelLeave}
          okText="Yes, Leave"
          cancelText="Cancel"
          centered
          closeIcon={<div className="leave-modal-close">✕</div>}
          className="leave-modal-container"
          okButtonProps={{
            className: "leave-modal-confirm-button",
            style: {
              background: "#ff3b30",
              borderColor: "#e02d22",
              color: "white",
            },
          }}
          cancelButtonProps={{
            className: "leave-modal-cancel-button",
            style: {
              backgroundColor: "#f5f5f5",
              borderColor: "#d9d9d9",
              color: "#333",
            },
          }}
        >
          <p className="leave-modal-message">
            Are you sure you want to leave this lobby?
          </p>
        </Modal>
        {isCurrentUserPainter && showWordSelection && (
          <div className="word-selection-overlay">
            <div className="word-selection-container">
              <h2>
                YOU ARE <span className="drawing-accent">DRAWING!</span>
              </h2>
              <p className="word-selection-subtitle">pick a word:</p>
              <div className="word-options">
                {wordOptions.map((option, index) => (
                  <button
                    key={index}
                    className={`word-option ${
                      option.selected ? "selected" : ""
                    }`}
                    onClick={() => handleWordSelect(index)}
                  >
                    {<span className="option-text">{option.word}</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* Show guessing screen to all non-painters while no word has been picked */}
        {!isCurrentUserPainter &&
          selectedWord === "default_word" &&
          showChoosingModal &&
          loadedSelectingWord &&
          !isLastRound && (
            <div className="word-selection-overlay">
              <div className="word-selection-container">
                <h2>
                  YOU ARE <span className="guessing-accent">GUESSING!</span>
                </h2>
                <p className="word-selection-subtitle">
                  {currentPainterUsername ?? "Someone"} is choosing a word
                  <span className="guessing-dots"></span>
                </p>
              </div>
            </div>
          )}
        {/* Loading screen inbetween rounds*/}
        {!loadedSelectingWord &&
          selectedWord === "default_word" &&
          !showWordSelection &&
          !isfirstRound &&
          !isLastRound && (
            <div className="loading-overlay word-selection-overlay">
              <div className="ready-container word-selection-container">
                <h3 className="settings-subtitle">The correct word was:</h3>
                <div className="correct-word">
                  {currentWordModal === "" ? (
                    <span className="error-correct-word">
                      errorFetchingCurrentWord
                    </span>
                  ) : (
                    capitalizeFirstLetter(String(currentWordModal))
                  )}
                </div>
                <div className="score-update-list">
                  {Object.entries(diffScores).map(([playerId, diff]) => (
                    <div
                      key={playerId}
                      className="player-list-diff player-list"
                    >
                      <span className="score-diff-text player_box_text player-entry">
                        {usernameCache[playerId] || "Player " + playerId}
                      </span>
                      <span className="score-diff-text player_box_text score-diff-box player-score-box">
                        +{diff}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="loading-message-diff loading-message">
                  {lastLoading ? "Waiting for results" : "Loading next round"}
                  <span className="guessing-dots"></span>
                </p>
              </div>
            </div>
          )}
        {/* Show game settings at round start while waiting */}
        {!loadedSelectingWord &&
          selectedWord === "default_word" &&
          !showWordSelection &&
          isfirstRound &&
          !isLastRound && (
            <div className="loading-overlay word-selection-overlay">
              <div className="ready-container word-selection-container">
                <div className="ready-title">Get Ready!</div>
                <h3 className="settings-subtitle">Game settings:</h3>
                <ul className="game-settings-list">
                  <li>
                    <strong>Draw Time:</strong> {lobby?.drawTime} seconds
                  </li>
                  <li>
                    <strong>Rounds:</strong> {lobby?.numOfRounds}
                  </li>
                  <li>
                    <strong>Wordset:</strong>{" "}
                    {capitalizeFirstLetter(String(lobby?.type))}
                  </li>
                  <li>
                    <strong>Language:</strong>{" "}
                    {capitalizeFirstLetter(
                      String(
                        lobby?.language === "de" ? "german" : lobby?.language
                      )
                    )}
                  </li>
                </ul>
                <p className="loading-message">
                  Loading<span className="guessing-dots"></span>
                </p>
              </div>
            </div>
          )}
      </div>
    </Layout>
  );
};

export default withAuth(LobbyPage);
