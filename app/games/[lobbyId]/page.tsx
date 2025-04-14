"use client";

import React, { FC, useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Button, Spin, message, Input, Modal } from 'antd';
import { useRouter } from 'next/navigation';
import withAuth from '@/hooks/withAuth';
import io, { Socket } from 'socket.io-client';
import { useDraw } from '@/hooks/useDraw';



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

const colorPalette = [
  '#FFFFFF', '#C0C0C0', '#FF0000', '#FFA500', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#A0522D', // Row 1
  '#000000', '#808080', '#8B0000', '#D2691E', '#008000', '#00008B', '#4B0082', '#800080', '#8B4513', '#4D2600'  // Row 2 (adjusted some for contrast/variety)
];

// --- Define Brush Sizes ---
const brushSizes = {
  size1: 2, // Smallest
  size2: 6, // Small-Medium (Default)
  size3: 12, // Medium-Large
  size4: 20, // Largest
};

type Tool = 'brush' | 'fill'; // Add more tools later if needed

const MAX_HISTORY_SIZE = 20; // Limit undo steps to prevent memory issues

const LobbyPage: FC = ({}) => {
  const [activeTool, setActiveTool] = useState<Tool>('brush'); // Default to brush
  const [brushSize, setBrushSize] = useState<number>(brushSizes.size2); // Default size
  const { canvasRef: hookCanvasRef, onMouseDown, clear: clearCanvas } = useDraw(drawLine);
  const params = useParams();
  const lobbyId = params.lobbyId as string;
  const apiService = useApi();
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
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
  // --- Combine refs: One for direct access, one for the hook ---
  const combinedCanvasRef = useCallback((node: HTMLCanvasElement | null) => {
    // Set the ref for direct access
    canvasElementRef.current = node;
    // Call the ref callback from the useDraw hook
    hookCanvasRef(node);
  }, [hookCanvasRef]);
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


  // --- Combined MouseDown Handler ---
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 1. Save state regardless of tool (simplest approach for undo)
    saveCanvasState();

    // 2. Execute tool-specific logic
    if (activeTool === 'brush') {
      onMouseDown(e); // Use the mouse down handler from useDraw
    } else if (activeTool === 'fill') { // NO extra brace after this parenthesis
      handleFillMouseDown(e); // Call the new fill handler
    }
    // Removed the extra closing brace that would correspond to the removed opening one
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

  //test http://localhost:3001/
  useEffect(() => {
    const socketIo = io('https://socket-server-826256454260.europe-west1.run.app/', {
      path: '/api/socket',
    });
    setSocket(socketIo);
  
// Get current user's username from players state or fetch it
const currentUsername = players.find((p) => p.id === Number(currentUserId))?.username ||"unknwon";

// Join lobby with userId and username
socketIo.emit('joinLobby', { lobbyId, userId: currentUserId, username: currentUsername });

// Listen for chat messages
socketIo.on('chatMessage', (message: ChatMessage) => {
  setMessages((prev) => [...prev, message]);
});

// Listen for player joining
socketIo.on('playerJoined', (newPlayer: PlayerData) => {
  setPlayers((prev) => {
    const existingPlayer = prev.find((p) => p.id === newPlayer.id);
    if (existingPlayer) {
      // Update existing player if username changes (e.g., on reconnect)
      return prev.map((p) => (p.id === newPlayer.id ? { ...p, username: newPlayer.username } : p));
    }
    return [...prev, newPlayer];
  });
});

  // Listen for player leaving
  socketIo.on('playerLeft', (leftPlayer: PlayerData) => {
    setPlayers((prev) => prev.filter((p) => p.id !== leftPlayer.id));
  });

  return () => {
    socketIo.disconnect();
  };
}, [lobbyId, currentUserId]);

  // Scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

   // --- NEW useEffect for Click Outside Color Picker ---
   useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isColorPickerVisible &&
        colorPickerRef.current &&
        !colorPickerRef.current.contains(event.target as Node) &&
        colorButtonRef.current && // Check if the button ref exists
        !colorButtonRef.current.contains(event.target as Node) // Check if the click was on the button itself
      ) {
        setIsColorPickerVisible(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isColorPickerVisible]); // Re-run when visibility changes
  
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

  const sendMessage = () => {
    if (chatInput.trim() && socket) {
      const username = players.find((p) => p.id === lobby?.lobbyOwner)?.username || 'You';
      socket.emit('chatMessage', { lobbyId, message: chatInput, username });
      setChatInput('');
    }
  };
  
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

    // 1. Get the last saved state (the state *before* the action we want to undo)
    const prevState = historyStack[historyStack.length - 1]; // Don't pop yet

    // 2. Restore this previous state onto the canvas
    ctx.putImageData(prevState, 0, 0);

    // 3. Remove the restored state from the stack (effectively removing the undone action's *result*)
    setHistoryStack(prev => prev.slice(0, -1)); // Create new array without the last element
  };

  // --- Clear function that also clears history ---
  const handleClearCanvas = () => {
    clearCanvas(); // Call the clear function from the hook
    setHistoryStack([]); // Clear the undo history
  }

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

  function drawLine({prevPoint, currentPoint, ctx}: Draw) {
    const {x:currX, y: currY} = currentPoint
    //color of line
    const lineColor = color
    const lineWidth = brushSize
    const startPoint = prevPoint ?? currentPoint
    ctx.beginPath()
    ctx.lineWidth = lineWidth
    ctx.strokeStyle = lineColor
    ctx.fillStyle = lineColor; // Use same color for fill
    ctx.lineCap = 'round'; // Make line ends round
    ctx.lineJoin = 'round'; // Make line corners round


    ctx.moveTo(startPoint.x, startPoint.y)
    ctx.lineTo(currX, currY)
    // Smooth the line slightly using quadratic curve
    // Calculate midpoint for control point
    const midPointX = (startPoint.x + currX) / 2;
    const midPointY = (startPoint.y + currY) / 2;
    // Using quadraticCurveTo for smoother lines
    ctx.quadraticCurveTo(startPoint.x, startPoint.y, midPointX, midPointY);
    ctx.lineTo(currX, currY); // Ensure the line reaches the current point

    ctx.stroke()

    ctx.fillStyle = lineColor
    ctx.beginPath()
    ctx.arc(startPoint.x, startPoint.y, 2, 0, 2* Math.PI)

    //Optional: Draw a small circle at the end point for a rounded cap effect
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(currX, currY, lineWidth / 2, 0, 2 * Math.PI);
    ctx.fill();
  }

  

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

  return (
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

        <button onClick={showLeaveConfirmation} className="leave-game-button">LEAVE GAME</button> {/* Added a class */}

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
          // Use the combined MouseDown handler
          onMouseDown={handleCanvasMouseDown}
          className={`drawing-canvas ${activeTool === 'fill' ? 'fill-cursor' : ''}`} // Add fill cursor class
          width={650}
          height={500}
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
                onClick={handleClearCanvas}
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
        {messages.map((msg, index) => (
          <div key={index} className="chat-message">
            <span style={{ color: getUsernameColor(msg.username) }} className="chat-username">
              {msg.username}:
            </span>
            <span className="chat-text"> {msg.message}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <Input
          className="chat-input"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onPressEnter={sendMessage}
          placeholder="Type your message here!"
        />
        <Button className="chat-send-button" onClick={sendMessage}>
          <span role="img" aria-label="send">📨</span>
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
  );
};

export default withAuth(LobbyPage);
