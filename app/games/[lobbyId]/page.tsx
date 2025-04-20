"use client";

import React, { FC, useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Button, Spin, message, Input, Modal } from "antd";
import { useRouter } from "next/navigation";
import withAuth from "@/hooks/withAuth";
import io, { Socket } from "socket.io-client";
import { useDraw } from "@/hooks/useDraw";
import { drawLine } from "@/utils/drawLine";

interface LobbyData {
  id: number;
  numOfMaxPlayers: number;
  playerIds: number[];
  wordset: string;
  numOfRounds: number;
  drawTime: number;
  lobbyOwner: number;
}

interface PlayerData {
  id: number;
  username: string;
}

// interface ChatMessage {
//   username: string;
//   message: string;
//   timestamp: string;
// }

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

const LobbyPage: FC = ({}) => {
  const [activeTool, setActiveTool] = useState<Tool>("brush"); // Default to brush
  const [brushSize, setBrushSize] = useState<number>(brushSizes.size2); // Default size
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  // old socket implementation
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isCanvasInitialized, setIsCanvasInitialized] = useState(false); // Prevent multiple initial loads
  //const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [color,setColor] = useState<string>('#000000')
  const [isColorPickerVisible, setIsColorPickerVisible] = useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement>(null); // Ref for click outside detection
  const colorButtonRef = useRef<HTMLButtonElement>(null); // Ref for the trigger button
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]); // --- State for Undo History ---
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null); // Ref to access the canvas element directly for ImageData
  const wordToGuess = "daniel"; //PLACEHOLDER WORD
  const currentUserId =
    typeof window !== "undefined" ? localStorage.getItem("userId") : "";
  const remoteUsersLastPointRef = useRef<Map<string, Point | null>>(new Map());
  const localAvatarUrl =
    typeof window !== "undefined"
      ? localStorage.getItem("avatarUrl") || "/icons/avatar.png"
      : "/icons/avatar.png";
  const [cursorStyle, setCursorStyle] = useState<string>("crosshair");
  const [customCursorPos, setCustomCursorPos] = useState({ x: 0, y: 0 });
  const [isCustomCursorVisible, setIsCustomCursorVisible] = useState(false);
  const [useCustomElementCursor, setUseCustomElementCursor] = useState(false); // Flag to control which cursor system to use
  const [isLeaveModalVisible, setIsLeaveModalVisible] = useState<boolean>(false);

  const [timer, setTimer] = useState<number | null>(null);
  const [currentRound, setCurrentRound] = useState(69);
  const [numOfRounds, setNumOfRounds] = useState(420);

  
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
      // NO saveCanvasState here. State is saved on action completion.
      if (activeTool === "brush") {
        // Just initiate the drawing process via the hook
        onMouseDown(e);
      } else if (activeTool === "fill") {
        // Fill handler will save state after completion
        handleFillMouseDown(e);
      }
    },
    [activeTool, onMouseDown, handleFillMouseDown]
  ); // Removed saveCanvasState dependency

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
  useEffect(() => {
    const fetchLobby = async () => {
      setLoading(true);
      try {
        const response = await apiService.get<LobbyData>(`/lobbies/${lobbyId}`);
        setLobby(response as LobbyData);

        if (response.playerIds && response.playerIds.length > 0) {
          const playerPromises = response.playerIds.map((id: number) =>
            apiService
              .get<PlayerData>(`/users/${id}`)
              .catch(() => ({ id, username: "Unknown Player" } as PlayerData))
          );
          const playerData = await Promise.all(playerPromises);
          setPlayers(playerData as PlayerData[]);
        }
      } catch (error) {
        console.error("Error fetching lobby:", error);
        message.error("Failed to load lobby information");
      } finally {
        setLoading(false);
      }
    };

    if (lobbyId) {
      fetchLobby();
    }
  }, [lobbyId, apiService]);

  useEffect(() => {
    if (socket && lobby && lobby.drawTime) {
      console.log("Auto-starting timer on page load, lobbyId:", lobbyId);
      socket.emit("startTimer", { 
        lobbyId,
        drawTime: lobby.drawTime
      });
    }
  }, [socket, lobby, lobbyId]);

  // old socket implementation
  //test http://localhost:3001/
  //https://socket-server-826256454260.europe-west1.run.app/
  //  useEffect(() => {
  //    const socketIo = io('http://localhost:3001/', {
  //      path: '/api/socket',
  //    });
  //    setSocket(socketIo);
  //// Get current user's username from players state or fetch it
  //const currentUsername = players.find((p) => p.id === Number(currentUserId))?.username ||"unknwon";
  //
  //// Join lobby with userId and username
  //socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username: currentUsername });
  //
  //
  //// Listen for chat messages
  //socketIo.on('chatMessage', (message: ChatMessage) => {
  //  setMessages((prev) => [...prev, message]);
  //});
  //
  //// Listen for player joining
  //socketIo.on('playerJoined', (newPlayer: PlayerData) => {
  //  setPlayers((prev) => {
  //    const existingPlayer = prev.find((p) => p.id === newPlayer.id);
  //    if (existingPlayer) {
  //      // Update existing player if username changes (e.g., on reconnect)
  //      return prev.map((p) => (p.id === newPlayer.id ? { ...p, username: newPlayer.username } : p));
  //    }
  //    return [...prev, newPlayer];
  //  });
  //});
  //
  //  // Listen for player leaving
  //  socketIo.on('playerLeft', (leftPlayer: PlayerData) => {
  //    setPlayers((prev) => prev.filter((p) => p.id !== leftPlayer.id));
  //  });
  //
  //}, [lobbyId, currentUserId]);
  //

// old chat code 
//
 // // Scroll to the latest message
 // useEffect(() => {
 //   messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 // }, [messages]);
//
 //  // --- NEW useEffect for Click Outside Color Picker ---
 //  useEffect(() => {
 //   const handleClickOutside = (event: MouseEvent) => {
 //     if (
 //       isColorPickerVisible &&
 //       colorPickerRef.current &&
 //       !colorPickerRef.current.contains(event.target as Node) &&
 //       colorButtonRef.current && // Check if the button ref exists
 //       !colorButtonRef.current.contains(event.target as Node) // Check if the click was on the button itself
 //     ) {
 //       setIsColorPickerVisible(false);
 //     }
 //   };
//
 //   document.addEventListener('mousedown', handleClickOutside);
 //   return () => {
 //     document.removeEventListener('mousedown', handleClickOutside);
 //   };
 // }, [isColorPickerVisible]); // Re-run when visibility changes
 // 
 const goBack = () => {
    router.push('/home');
 };

 const showLeaveConfirmation = () => {
  setIsLeaveModalVisible(true);
};

const handleLeaveLobby = async () => {
  if (!currentUserId || !lobbyId) {
    router.push('/home');
    return;
  }

  try {
    setLoading(true);
    
    // Remove player from lobby in database
    // Adding an empty object as the second parameter to satisfy the put method signature
    await apiService.put(`/lobbies/${lobbyId}/leave?playerId=${currentUserId}`, {});
    
    // Notify other players via socket
    if (socket) {
      socket.emit('leaveLobby', { 
        lobbyId, 
        userId: currentUserId 
      });
    }
    
    message.success('You have left the lobby');
    router.push('/home');
  } catch (error) {
    console.error('Error leaving lobby:', error);
    message.error('Failed to leave lobby properly, redirecting anyway');
    router.push('/home');
  } finally {
    setLoading(false);
    setIsLeaveModalVisible(false);
  }
};

const handleCancelLeave = () => {
  setIsLeaveModalVisible(false);
};
//
 // const sendMessage = () => {
 //   if (chatInput.trim() && socket) {
 //     const username = players.find((p) => p.id === lobby?.lobbyOwner)?.username || 'You';
 //     socket.emit('chatMessage', { lobbyId, message: chatInput, username });
 //     setChatInput('');
 //   }
 // };
  
  // const colorPool: string[] = [
  //   '#e6194b', // kräftiges Rot
  //   '#3cb44b', // kräftiges Grün
  //   '#4363d8', // kräftiges Blau
  //   '#f58231', // kräftiges Orange
  //   '#911eb4', // dunkles Violett
  //   '#42d4f4', // kräftiges Türkis
  //   '#f032e6', // sattes Pink
  //   '#1a1aff', // Royal Blue
  //   '#008080', // Teal
  // ];

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

    // Helper to fetch username (replace with your actual implementation)
    const fetchCurrentUsername = async (): Promise<string> => {
      try {
        // Assuming you have a way to get the username, maybe from apiService or localStorage
        const userData = await apiService.get<PlayerData>(
          `/users/${currentUserId}`
        );
        return userData?.username || "Player";
      } catch {
        return "Player";
      }
    };
    //http:/localhost:3001 --- "https://socket-server-826256454260.europe-west1.run.app/" { path: "/api/socket" }
    const setupSocket = async () => {
      socketIo = io(
        "https://socket-server-826256454260.europe-west1.run.app/",
        { path: "/api/socket" }
      ); // Use your server URL
      setSocket(socketIo);

      // --- Join Logic ---
      const username = await fetchCurrentUsername();
      socketIo.emit("joinLobby", { lobbyId, userId: currentUserId, username }); // Uses existing server handler
      console.log("Emitted joinLobby");

      // --- Request initial state AFTER joining ---
      if (!isCanvasInitialized && isMounted) {
        console.log("Requesting initial canvas state...");
        socketIo.emit("request-initial-state");
      }

      // --- Listener for receiving the final initial state ---
      socketIo.on("timerUpdate", (newTime: number) => {
        //console.log("Received timer update:", newTime);
        setTimer(newTime);
      });

      socketIo.on('gameUpdate', (gameData) => {
        console.log('Received game update:', gameData);
        if (gameData.currentRound) setCurrentRound(gameData.currentRound);
        if (gameData.numOfRounds) setNumOfRounds(gameData.numOfRounds);
      });
    
      
      socketIo.on("load-canvas-state", (data: LoadCanvasStateData) => {
        if (!isCanvasInitialized && data.dataUrl && isMounted) {
          console.log("Received load-canvas-state. Loading canvas...");
          loadCanvasFromDataUrl(data.dataUrl, true); // Load and reset history
        }
      });

      // --- Listener to PROVIDE state if requested ---
      socketIo.on("get-canvas-state", (data: GetCanvasStateData) => {
        // Check if this client should respond (e.g., not the requester themselves, although server handles this)
        // Also ensure canvas is ready and socket exists
        if (canvasElementRef.current && socketIo) {
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

      // --- Listener for INCOMING draw batches ---
      socketIo.on("draw-line-batch", (data: DrawBatchEmitDataWithUser) => {
        console.log("received drawing information from socket server");
        const canvas = canvasElementRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const drawerUserId = data.userId;

        // IMPORTANT: Normally, socket.to(lobbyId) excludes the sender.
        // If your server logic changes to use io.to(lobbyId),
        // you MUST uncomment the check below to avoid drawing your own lines twice.
        // if (drawerUserId === currentUserId) {
        //     // console.log("Ignoring own draw batch echo"); // Debug
        //     return;
        // }

        // Ensure points exist
        if (!data.points || data.points.length === 0) {
          // console.log(`Received empty batch from ${drawerUserId}, ignoring.`); // Debug
          return;
        }

        // Retrieve the last known point for this specific user
        const lastPointForUser =
          remoteUsersLastPointRef.current.get(drawerUserId) || null;
        let prevPointForDrawing: Point | null = lastPointForUser; // Start with the stored point

        // console.log(`Drawing batch from ${drawerUserId}. Connecting from:`, prevPointForDrawing, `Points: ${data.points.length}`); // Debug

        // Iterate through the received points and draw segments
        for (const currentPoint of data.points) {
          // Draw the segment connecting the previous point to the current one
          drawLine({
            prevPoint: prevPointForDrawing, // Use the evolving previous point
            currentPoint: currentPoint,
            ctx,
            color: data.color,
            brushSize: data.brushSize,
          });
          // Update the previous point for the *next* segment within this batch
          prevPointForDrawing = currentPoint;
        }

        // --- CRUCIAL: Update the last known point for this user ---
        // Store the very last point from this batch
        const finalPointInBatch = data.points[data.points.length - 1];
        remoteUsersLastPointRef.current.set(drawerUserId, finalPointInBatch);
        // console.log(`Updated last point for ${drawerUserId} to:`, finalPointInBatch); // Debug
      });

      // --- Listener for Clear (Save the cleared state locally) ---
      socketIo.on("clear", (data: ClearEmitData) => {
        console.log(`Received clear instruction from user ${data.userId}`);
        const canvas = canvasElementRef.current;
        const ctx = canvas?.getContext("2d");
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        remoteUsersLastPointRef.current.clear();
        // Save the cleared state triggered by remote user
        saveCanvasState();
      });

      // --- NEW: Listener for INCOMING Draw End ---
      socketIo.on("draw-end", (data: DrawEndData) => {
        const enderUserId = data.userId;
        // console.log(`Received draw-end from user ${enderUserId}`); // Debug
        // Reset the last known point for this user, so the next line doesn't connect
        remoteUsersLastPointRef.current.set(enderUserId, null);
        // console.log(`Reset last point for ${enderUserId} to null`); // Debug
      });

      // --- Listener for Fill Area (Saves state after applying remote fill) ---
      socketIo.on("fill-area", (data: FillAreaDataWithUser) => {
        const canvas = canvasElementRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        floodFill(ctx, data.x, data.y, data.color);
        // Save state AFTER remote fill
        saveCanvasState();
      });

      // --- Listener for Sync Canvas (Resets history with synced state) ---
      socketIo.on("sync-canvas", (data: SyncCanvasData) => {
        if (isMounted) {
          loadCanvasFromDataUrl(data.dataUrl, true);
        }
      });

      socketIo.on("playerLeft", (leftPlayer: { id: number | string }) => {
        // Use the type emitted by your server
        const leftPlayerId = String(leftPlayer.id); // Ensure string key for map
        if (remoteUsersLastPointRef.current.has(leftPlayerId)) {
          remoteUsersLastPointRef.current.delete(leftPlayerId);
          console.log(
            `Cleared last point state for user ${leftPlayerId} who left.`
          );
        }
      });

      // Handle initial lobby state if needed (e.g., for players already present)
      socketIo.on("lobbyState", (lobbyData: { players: PlayerData[] }) => {
        // console.log("Received initial lobby state:", lobbyData);
        // Update players list if necessary
        setPlayers(lobbyData.players);
        // You could potentially pre-populate the remoteUsersLastPointRef map here
        // if you had info about ongoing drawings, but usually starting fresh is fine.
      });
      // --- Initial empty canvas state ---
      if (
        canvasElementRef.current &&
        historyStack.length === 0 &&
        !isCanvasInitialized
      ) {
        saveCanvasState();
      }
    };
    setupSocket();

    // --- Cleanup ---
    return () => {
      isMounted = false;
      if (socketIo) {
        // Unregister all listeners
        socketIo.off("load-canvas-state");
        socketIo.off("get-canvas-state");
        socketIo.off("clear");
        socketIo.off("fill-area");
        socketIo.off("sync-canvas");
        socketIo.off('gameUpdate');
        // ... unregister other drawing listeners ...
        socketIo.disconnect();
      }
      setSocket(null);
    };
    // Only include dependencies that, if changed, require the effect to re-run (like lobbyId)
    // Callbacks defined with useCallback outside usually don't need to be deps unless their own deps change.
  }, [lobbyId, apiService, currentUserId, loadCanvasFromDataUrl]); // `loadCanvasFromDataUrl` is stable

  // --- Local Clear Function ---
  const socketClearCanvas = useCallback(() => {
    // ... (Implementation: emit clear, clear locally, saveCanvasState) ...
    if (socket) {
      socket.emit("clear");
    }
    const canvas = canvasElementRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    remoteUsersLastPointRef.current.clear();
    saveCanvasState(); // Save the blank state
  }, [socket, saveCanvasState]);

  //Loading screen
  if (loading) {
    return (
      <div className="page-background">
        <Spin size="large" tip="Loading lobby information..." />
      </div>
    );
  }

  //No loading screen
  if (!lobby) {
    return (
      <div className="page-background">
        <div className="login-register-box">
          <h1
            className="players-chat-title"
            style={{ marginTop: -10, marginBottom: 30, fontSize: 50 }}
          >
            Game Not Found
          </h1>
          <h2 className="players-chat-title">Lobby {`#${lobbyId}`}</h2>
          <Button className="green-button" onClick={goBack}>
            Back to home
          </Button>
        </div>
      </div>
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
    <>
      {" "}
      {/* <-- START React Fragment */}
      <div style={fillCursorStyle} />
      <div className="page-background">
        <div className="player-box">
          <h1 className="players-chat-title">
            PLAYERS ({players.length}/{lobby.numOfMaxPlayers})
          </h1>
          <div className="player-list">
            {players.map((player) => (
              <div
                key={player.id}
                className={`player-entry ${
                  player.id.toString() === currentUserId
                    ? "player-entry-own"
                    : ""
                }`}
              >
                <div className="player-info">
                  <img
                    src={
                      player.id.toString() === currentUserId
                        ? localAvatarUrl
                        : "/icons/avatar.png"
                    }
                    alt="Avatar"
                    className="player-avatar"
                  />
                  <span>{player.username || "Unknown Player"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Game Box */}
        <div className="game-box">
        <div className="timer-area" style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 10 }}>
        <div className="timer-container">
          <svg className="timer-circle" viewBox="0 0 100 100">
            <circle className="timer-circle-bg" cx="50" cy="50" r="45" />
            <circle 
              className="timer-circle-progress" 
              cx="50" 
              cy="50" 
              r="45" 
              style={{
                strokeDashoffset: timer !== null ? 
                  283 - (283 * timer / (lobby?.drawTime || 60)) : 283
              }}
            />
          </svg>
          <div className="timer-content">
            <span className="timer-value">{timer !== null ? timer : "--"}</span>
            <span className="timer-label">seconds</span>
          </div>
        </div>
        <div className="round-content">
          <span className="currentRound">Round: {currentRound || 69}</span>
          <span className="allRound">/{numOfRounds || 420}</span>
        </div>
      </div>
          <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
          <h2 className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</h2>
          <button className="leave-game-button" onClick={showLeaveConfirmation}>LEAVE GAME</button>
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
          {/* Word Display Area */}
          <div className="word-display-area">
            <span className="word-to-guess">
              {wordToGuess
                .toLowerCase()
                .split("")
                .map((letter, index) => (
                  <span key={index} className="word-letter">
                    {letter === " " ? "\u00A0" : letter}
                  </span> // Handle spaces
                ))}
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
        {/* Chat Box */}
        <div className="chat-box">
          <h1 className="players-chat-title">CHAT</h1>

          <div className="chat-messages">
            {/*{messages.map((msg, index) => (
          <div key={index} className="chat-message">
            <span style={{ color: getUsernameColor(msg.username) }} className="chat-username">
              {msg.username}:
            </span>
            <span className="chat-text"> {msg.message}</span>
          </div>
        ))}*/}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <Input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message here!"
            />
            <Button className="chat-send-button">
              <span role="img" aria-label="send">
                📨
              </span>
            </Button>
          </div>
        </div>
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
      </div>
    </>
  );
};

export default withAuth(LobbyPage);
