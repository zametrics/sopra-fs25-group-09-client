"use client";

import React, { FC, useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, Spin, message, Input, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';
import { useDraw } from '@/hooks/useDraw';
import { drawLine } from '@/utils/drawLine';



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

interface ChatMessage {
  username: string;
  message: string;
  timestamp: string;
}

type Point = { x: number; y: number };
interface DrawBatchData { points: Point[] };
interface DrawBatchEmitData extends DrawBatchData { // Type for received data
    color: string;
    brushSize: number;
}

interface DrawLineProps {
  prevPoint: Point | null;
  currentPoint: Point;
  color: string;
  brushSize: number;
}

interface RGB { r: number; g: number; b: number; }

const colorPalette = [
  '#FFFFFF', '#C0C0C0', '#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#A0522D', // Row 1
  '#000000', '#808080', '#8B0000', '#D2691E', '#008000', '#00008B', '#4B0082', '#800080', '#8B4513', '#4D2600'  // Row 2 (adjusted some for contrast/variety)
];

// --- Define Brush Sizes ---
const brushSizes = {
  size1: 4, // Smallest
  size2: 8, // Small-Medium (Default)
  size3: 12, // Medium-Large
  size4: 24, // Largest
};

type Tool = 'brush' | 'fill'; // Add more tools later if needed

const MAX_HISTORY_SIZE = 20; // Limit undo steps to prevent memory issues

const LobbyPage: FC = ({}) => {
  const [activeTool, setActiveTool] = useState<Tool>('brush'); // Default to brush
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
  //const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLeaveModalVisible, setIsLeaveModalVisible] = useState<boolean>(false);
  const [color,setColor] = useState<string>('#000000')
  const [isColorPickerVisible, setIsColorPickerVisible] = useState<boolean>(false);
  const colorPickerRef = useRef<HTMLDivElement>(null); // Ref for click outside detection
  const colorButtonRef = useRef<HTMLButtonElement>(null); // Ref for the trigger button
  const [historyStack, setHistoryStack] = useState<ImageData[]>([]); // --- State for Undo History ---
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null); // Ref to access the canvas element directly for ImageData
  const wordToGuess = "daniel"; //PLACEHOLDER WORD
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
  const localAvatarUrl = typeof window !== "undefined" ? localStorage.getItem("avatarUrl") || "/icons/avatar.png" : "/icons/avatar.png";
  const [cursorStyle, setCursorStyle] = useState<string>('crosshair');
  const [customCursorPos, setCustomCursorPos] = useState({ x: 0, y: 0 });
  const [isCustomCursorVisible, setIsCustomCursorVisible] = useState(false);
  const [useCustomElementCursor, setUseCustomElementCursor] = useState(false); // Flag to control which cursor system to use
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Get mouse position relative to the page
    setCustomCursorPos({ x: e.pageX, y: e.pageY });

    // If the custom element should be active but isn't visible yet, make it visible
    if (useCustomElementCursor && !isCustomCursorVisible) {
         setIsCustomCursorVisible(true);
    }
  };


  // 1. Callback for IMMEDIATE LOCAL drawing
  const handleLocalDraw = useCallback(({ ctx, currentPoint, prevPoint }: Draw) => {
    // Use current color and brushSize state for local drawing
    drawLine({ prevPoint, currentPoint, ctx, color, brushSize });
  }, [color, brushSize]); // Dependencies: re-create if color or size changes

    // --- Callback for THROTTLED BATCH EMISSION ---
  const handleDrawEmitBatch = useCallback((batchData: DrawBatchData) => {
      // console.log(`Emitting batch of ${batchData.points.length} points`); // Debug
      if (socket && activeTool === 'brush' && batchData.points.length > 0) {
          socket.emit('draw-line-batch', { // Use a distinct event name for batches
              points: batchData.points,
              color,    // Add current color
              brushSize // Add current brush size
          });
      }
  }, [socket, color, brushSize, activeTool]);


  const handleCanvasMouseEnter = () => {
    // Show custom cursor only if the fill tool is active
    if (useCustomElementCursor) {
      setIsCustomCursorVisible(true);
    }
  };
    // --- Setup useDraw Hook with Batching ---
    const THROTTLE_MILLISECONDS = 10;
    const { canvasRef: hookCanvasRef, onMouseDown, clear } = useDraw(
        handleLocalDraw,
        handleDrawEmitBatch, // Pass the batch emit handler
        THROTTLE_MILLISECONDS
    );


  const handleCanvasMouseLeave = () => {
    // Always hide custom cursor when leaving the canvas
    setIsCustomCursorVisible(false);
  };

  const combinedCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasElementRef.current = node; // For direct access (undo/history)
    hookCanvasRef(node);            // For useDraw hook
    // Ensure canvas dimensions are set after node exists (could also be done in useDraw's ref callback)
    if (node) {
        node.width = 650; // Or dynamic size
        node.height = 500;
    }
  }, [hookCanvasRef]); // Dependency on hookCanvasRef

  // --- Save Canvas State Function ---
  const saveCanvasState = useCallback(() => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
  const currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  
  
  setHistoryStack(prev => {
    // Avoid saving identical consecutive states (e.g., multiple clicks without drawing)
    if (prev.length > 0 && prev[prev.length - 1].data.byteLength === currentImageData.data.byteLength) {
         // Basic check; a more robust check would compare data arrays, but that's slow.
         // This simple check prevents saving after non-drawing actions like tool switches.
        // You might need a more sophisticated check if needed.
        // For now, let's assume any action that *might* change the canvas saves state.
    }

    const newHistory = [...prev, currentImageData];
    if (newHistory.length > MAX_HISTORY_SIZE) {
        return newHistory.slice(newHistory.length - MAX_HISTORY_SIZE);
    }
    return newHistory;
});
}, []);


const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
  saveCanvasState(); // Save state before action

  if (activeTool === 'brush') {
    onMouseDown(e); // Use the hook's mousedown handler
  } else if (activeTool === 'fill') {
    handleFillMouseDown(e); // Keep existing fill logic
  }
};


// --- NEW: Fill Tool MouseDown Handler ---
const handleFillMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
  const canvas = canvasElementRef.current;
  if (!canvas) return;
  // Get context with willReadFrequently hint for potential performance boost
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(e.clientX - rect.left);
  const y = Math.floor(e.clientY - rect.top);

  // Execute the flood fill
  floodFill(ctx, x, y, color);
};

useEffect(() => {
  const canvas = canvasElementRef.current;
  if (!canvas) return;

  let newCursorStyle = 'crosshair'; // Default if no tool active or custom element used
  let useCustomElement = false; // Reset flag

  if (activeTool === 'fill') {
    // --- Enable Custom DOM Element Cursor for Fill ---
    newCursorStyle = 'none'; // Hide the default cursor
    useCustomElement = true; // Signal to use the custom element
    console.log("Cursor Effect: Enabling custom DOM element cursor for Fill.");

  } else if (activeTool === 'brush') {
    // --- Use SVG Data URL for Brush (Assuming this works) ---
    // ... (Keep the existing brush SVG generation logic) ...
    const size = Math.max(brushSize, 2);
    const radius = size / 2;
    const strokeWidth = 1;
    const svgSize = size + strokeWidth * 2;
    const center = svgSize / 2;
    const originalRgb = hexToRgb(color);
    let finalFillColor = 'rgba(0,0,0,0.5)';
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
       newCursorStyle = 'crosshair'; // Or 'default'
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
            apiService.get<PlayerData>(`/users/${id}`).catch(() => ({ id, username: 'Unknown Player' } as PlayerData))
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
//
 // const showLeaveConfirmation = () => {
 //     setIsLeaveModalVisible(true);
 //   };
 // 
 //   const handleLeaveLobby = async () => {
 //     if (!currentUserId || !lobbyId) {
 //       router.push('/home');
 //       return;
 //     }
 // 
 //     try {
 //       setLoading(true);
 //       
 //       // Remove player from lobby in database
 //       // Adding an empty object as the second parameter to satisfy the put method signature
 //       await apiService.put(`/lobbies/${lobbyId}/leave?playerId=${currentUserId}`, {});
 //       
 //       // Notify other players via socket
 //       if (socket) {
 //         socket.emit('leaveLobby', { 
 //           lobbyId, 
 //           userId: currentUserId 
 //         });
 //       }
 //       
 //       message.success('You have left the lobby');
 //       router.push('/home');
 //     } catch (error) {
 //       console.error('Error leaving lobby:', error);
 //       message.error('Failed to leave lobby properly, redirecting anyway');
 //       router.push('/home');
 //     } finally {
 //       setLoading(false);
 //       setIsLeaveModalVisible(false);
 //     }
 //   };
 //   
 //   const handleCancelLeave = () => {
 //     setIsLeaveModalVisible(false);
 //   };
//
 // const sendMessage = () => {
 //   if (chatInput.trim() && socket) {
 //     const username = players.find((p) => p.id === lobby?.lobbyOwner)?.username || 'You';
 //     socket.emit('chatMessage', { lobbyId, message: chatInput, username });
 //     setChatInput('');
 //   }
 // };
  
  const colorPool: string[] = [
    '#e6194b', // kräftiges Rot
    '#3cb44b', // kräftiges Grün
    '#4363d8', // kräftiges Blau
    '#f58231', // kräftiges Orange
    '#911eb4', // dunkles Violett
    '#42d4f4', // kräftiges Türkis
    '#f032e6', // sattes Pink
    '#1a1aff', // Royal Blue
    '#008080', // Teal
  ];
  
    // --- Color Picker Toggle Handler ---
    const toggleColorPicker = () => {
      setIsColorPickerVisible(prev => !prev);
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
      setActiveTool('brush'); // Select brush tool when a size is clicked
      setBrushSize(newSize);
    };

   // --- Undo Handler ---
   const handleUndo = () => {
    if (historyStack.length === 0) {
      console.log("History empty, cannot undo.");
      return; // Nothing to undo
    }

    const canvas = canvasElementRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

       ctx.imageSmoothingEnabled = false;


    // 1. Get the last saved state (the state *before* the action we want to undo)
    const prevState = historyStack[historyStack.length - 1]; // Don't pop yet

    // 2. Restore this previous state onto the canvas
    ctx.putImageData(prevState, 0, 0);

    // 3. Remove the restored state from the stack (effectively removing the undone action's *result*)
    setHistoryStack(prev => prev.slice(0, -1)); // Create new array without the last element
  };

  
  // --- Helper: Hex to RGBA ---
  const hexToRgba = (hex: string): [number, number, number, number] | null => {
    if (!hex || hex.charAt(0) !== '#') return null;
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
          parseInt(result[1], 16), // R
          parseInt(result[2], 16), // G
          parseInt(result[3], 16), // B
          255,                     // A (alpha is always 255 for fill)
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
    const getPixel = (x: number, y: number): [number, number, number, number] => {
        if (x < 0 || y < 0 || x >= width || y >= height) {
            return [-1, -1, -1, -1]; // Out of bounds marker
        }
        const offset = (y * width + x) * 4;
        return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
    };

    // Helper to compare colors (RGBA arrays)
    const colorsMatch = (c1: number[], c2: number[]): boolean => {
        return c1[0] === c2[0] && c1[1] === c2[1] && c1[2] === c2[2] && c1[3] === c2[3];
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
            data[offset] = fillColorRgba[0];     // R
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

  const usernameColorsRef = useRef<{ [key: string]: string }>({});
  
  function getUsernameColor(username: string): string {
  const usernameColors = usernameColorsRef.current;

  if (!username || typeof username !== 'string') return 'black';

  if (usernameColors[username]) {
    return usernameColors[username];
  }

  const availableColors = colorPool.filter(
    (color) => !Object.values(usernameColors).includes(color)
  );

  const newColor =
    availableColors.length > 0
      ? availableColors[Math.floor(Math.random() * availableColors.length)]
      : '#' + Math.floor(Math.random() * 16777215).toString(16);

  usernameColors[username] = newColor;
  return newColor;
}

//test http://localhost:3001/
//https://socket-server-826256454260.europe-west1.run.app/

////socket implementation drawing system
//const socketIo = io('http://localhost:3001', {
//  path: '/api/socket',
//});
//
//function createLine({prevPoint, currentPoint, ctx}: Draw) {
////      socketIo.emit('draw-line', ({prevPoint, currentPoint, ctx}))
//      drawLine({prevPoint, currentPoint, ctx, color, brushSize})
//}

// --- Clear function that also clears history ---



useEffect(() => {
  const socketIo = io('http://localhost:3001', {
    path: '/api/socket',
  });

  setSocket(socketIo);

  // Warten, bis wir unseren Username haben und uns in der Lobby anmelden
  const fetchCurrentUsername = async () => {
    try {
      const userData = await apiService.get<PlayerData>(`/users/${currentUserId}`);
      return userData.username;
    } catch (error) {
      console.error('Error fetching username:', error);
      return 'Guest';
    }
  };

  const joinLobby = async () => {
    const username = await fetchCurrentUsername();
    socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username });
    console.log('Emitted joinLobby:', { lobbyId, userId: currentUserId, username });
  };

  joinLobby();

    // --- Listener for INCOMING draw batches ---
    socketIo.on('draw-line-batch', (data: DrawBatchEmitData) => {
      const canvas = canvasElementRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      console.log("received drawing information from websocket server")
      // console.log(`Received batch of ${data.points.length} points`); // Debug

      // Iterate through the received points and draw segments
      let prevPointInBatch: Point | null = null;
      for (const currentPoint of data.points) {
           // The first point in the batch might connect to the *last* point
           // of the *previous* batch from this user, but we don't track that state here.
           // So, the first point is drawn as a dot (prevPoint=null),
           // and subsequent points connect to the previous one *within the batch*.
           drawLine({
               prevPoint: prevPointInBatch, // Use the previous point *from this batch*
               currentPoint: currentPoint,
               ctx,
               color: data.color,       // Use color from received data
               brushSize: data.brushSize // Use size from received data
           });
           prevPointInBatch = currentPoint; // Update for the next segment in the batch
      }
  });

    // --- Listener for INCOMING clear events ---
    socketIo.on('clear', () => {
      console.log("received clear instruction from websocket server");
      clear(); // Call the clear function from the hook
      setHistoryStack([]); // Also clear local undo history
    });

    return () => {
      console.log("Disconnecting socket");
      socketIo.disconnect();
      setSocket(null);
    };
}, [clear, apiService, currentUserId, lobbyId]);


function createLine({ prevPoint, currentPoint, ctx }: Draw) {
  if (socket) {
    socket.emit('draw-line', { prevPoint, currentPoint, color, brushSize });
  }
  drawLine({ prevPoint, currentPoint, ctx, color, brushSize });
}

const socketClearCanvas = () => {
  if (socket) {
    console.log("Emitting clear");
    socket.emit('clear'); // Notify others
  }
  clear(); // Clear local canvas via useDraw hook
  setHistoryStack([]); // Clear local undo history
  saveCanvasState(); // Optional: Save the blank state as the new history base
};

  //Loading screen
  if (loading) {
    return (
      <div className='page-background'>
        <Spin size="large" tip="Loading lobby information..." />
      </div>
    );
  } 
  
  //No loading screen
  if (!lobby) {
    return (
      <div className='page-background'>
        <div className='login-register-box'>
          <h1 className='players-chat-title' style={{marginTop: -10, marginBottom: 30, fontSize: 50}}>Game Not Found</h1>
          <h2 className='players-chat-title'>Lobby {`#${lobbyId}`}</h2>
          <Button className= "green-button" onClick={goBack}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  const fillCursorStyle: React.CSSProperties = {
    position: 'absolute',
    // Adjust width/height to match your image dimensions
    width: '24px',
    height: '24px',
    backgroundImage: 'url(/icons/fill-tool-cursor.svg)', // Your image path
    backgroundSize: 'contain', // Or 'cover' or specific dimensions
    backgroundRepeat: 'no-repeat',
    // IMPORTANT: Offset based on your desired hotspot (adjust these)
    // Moves the image so the hotspot aligns with the actual mouse position (customCursorPos)
    transform: 'translate(-5px, -20px)', // Example: move left 5px, up 20px
    pointerEvents: 'none', // Crucial: prevents the div from blocking canvas events
    zIndex: 9999, // Ensure it's above other elements
    display: useCustomElementCursor && isCustomCursorVisible ? 'block' : 'none', // Toggle visibility
    left: `${customCursorPos.x}px`,
    top: `${customCursorPos.y}px`,
};

  return (
    <> {/* <-- START React Fragment */}
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
        className={`player-entry ${player.id.toString() === currentUserId ? 'player-entry-own' : ''}`}
      >
        <div className="player-info">
        <img
          src={player.id.toString() === currentUserId ? localAvatarUrl : '/icons/avatar.png'}
          alt="Avatar"
          className="player-avatar"
        />
          <span>{player.username || 'Unknown Player'}</span>
        </div>
      </div>
    ))}
  </div>
</div>
      
      {/* Game Box */}
      <div className="game-box">
        <h1 className="drawzone-logo-2-8rem">DRAWZONE</h1>
        <h2 className="drawzone-subtitle-1-1rem">ART BATTLE ROYALE</h2>

        <button className="leave-game-button">LEAVE GAME</button> {/* Added a class */}

        {/* Word Display Area */}
        <div className="word-display-area">
          <span className="word-to-guess">
            {wordToGuess.toLowerCase().split('').map((letter, index) => (
              <span key={index} className="word-letter">{letter === ' ' ? '\u00A0' : letter}</span> // Handle spaces
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
         // width/height attributes are now preferably set in combinedCanvasRef or useDraw
       ></canvas>


        {/* Drawing Tools */}
        <div className='drawing-tools-arrangement'>
           {/* --- Left Tool Group --- */}
          <div className="drawing-tools">
            {/* Color Picker Button */}
            <div style={{ position: 'relative' }}> {/* Wrapper for positioning popup */}
              <button
                ref={colorButtonRef} // Add ref to the button
                className="tool-button color-picker-btn"
                aria-label="Choose Color"
                onClick={toggleColorPicker} // Attach toggle handler
              >
                {/* Display current color */}
                
                <img src="/icons/color-wheel.svg" alt="Color Picker" className="tool-icon-image" /> 
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
            </div> {/* End relative wrapper */}


            {/* --- UPDATED Brush Size Buttons --- */}
            <button
              className={`tool-button brush-size brush-size-1 ${activeTool === 'brush' && brushSize === brushSizes.size1 ? 'active-tool' : ''}`}
              aria-label="Brush Size 1"
              onClick={() => handleBrushSizeChange(brushSizes.size1)}
            >
               <div className="brush-dot" style={{ backgroundColor: color }}></div>
            </button>
             <button
              className={`tool-button brush-size brush-size-2 ${activeTool === 'brush' && brushSize === brushSizes.size2 ? 'active-tool' : ''}`}
              aria-label="Brush Size 2"
              onClick={() => handleBrushSizeChange(brushSizes.size2)}
            >
               <div className="brush-dot" style={{ backgroundColor: color }}></div>
            </button>
             <button
              className={`tool-button brush-size brush-size-3 ${activeTool === 'brush' && brushSize === brushSizes.size3 ? 'active-tool' : ''}`}
              aria-label="Brush Size 3"
              onClick={() => handleBrushSizeChange(brushSizes.size3)}
            >
               <div className="brush-dot" style={{ backgroundColor: color }}></div>
            </button>
             <button
               className={`tool-button brush-size brush-size-4 ${activeTool === 'brush' && brushSize === brushSizes.size4 ? 'active-tool' : ''}`}
               aria-label="Brush Size 4"
               onClick={() => handleBrushSizeChange(brushSizes.size4)}
            >
               <div className="brush-dot" style={{ backgroundColor: color }}></div>
            </button>

            {/* --- UPDATED Fill Tool Button --- */}
            <button
              className={`tool-button tool-icon ${activeTool === 'fill' ? 'active-tool' : ''}`} // Add active class conditionally
              aria-label="Fill Tool"
              onClick={() => handleToolChange('fill')} // Set tool to 'fill' on click
            >
              <img src="/icons/fill-tool-black.svg" alt="Fill" className="tool-icon-image"/>
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
               <img src="/icons/undo-tool-black.svg" alt="Undo" className="tool-icon-image"/>
            </button>

             {/* Clear Tool (Trash Can) */}
             <button
         className="tool-button tool-icon"
         aria-label="Clear Canvas"
         onClick={socketClearCanvas} // <<< Use the emitting clear function
       >
          <img src="/icons/trash-tool-black.svg" alt="Clear" className="tool-icon-image"/>
       </button>
          </div>
        </div> {/* End drawing-tools-arrangement */}
      </div> {/* End game-box */}





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
        <Button className="chat-send-button" >
          <span role="img" aria-label="send">📨</span>
        </Button>
      </div>
    </div>

    {/* Leave Confirmation Modal */}
    <Modal
        title={<div className="leave-modal-title">Leave Lobby</div>}
        open={isLeaveModalVisible}
        okText="Yes, Leave"
        cancelText="Cancel"
        centered
        closeIcon={<div className="leave-modal-close">✕</div>}
        className="leave-modal-container"
        okButtonProps={{ 
          className: "leave-modal-confirm-button",
          style: { background: '#ff3b30', borderColor: '#e02d22', color: 'white' }
        }}
        cancelButtonProps={{ 
          className: "leave-modal-cancel-button",
          style: { backgroundColor: '#f5f5f5', borderColor: '#d9d9d9', color: '#333' }
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
