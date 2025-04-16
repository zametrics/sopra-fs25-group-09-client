// hooks/useDraw.ts
import { useEffect, useRef, useCallback } from 'react';

// Assuming Point and Draw types are defined elsewhere or inline
type Point = { x: number; y: number };
type Draw = { ctx: CanvasRenderingContext2D; currentPoint: Point; prevPoint: Point | null };
interface DrawBatchData { points: Point[] }

// --- Simple Throttle Utility ---
// (Leading edge: fires immediately, then waits for cooldown)
function throttle<T extends (...args: any[]) => void>(func: T, limit: number): T {
  let inThrottle: boolean;
  let lastResult: any; // To potentially store last result if needed, though void here

  return function(this: any, ...args: Parameters<T>): void {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args); // Execute the function
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit); // Start cooldown
    }
    // For drawing, we usually don't need to buffer the *last* call during throttle,
    // as the mouseup event will handle the final point.
  } as T;
}

// --- Define the type for emitted data ---
export interface DrawEmitData {
  prevPoint: Point | null;
  currentPoint: Point;
  // Color and brushSize will be added by the component before emitting
}

export const useDraw = (
    onDrawLocal: ({ ctx, currentPoint, prevPoint }: Draw) => void, // For immediate local rendering
    onDrawEmitBatch: (data: DrawBatchData) => void, // For throttled BATCH emission
    throttleInterval: number = 100 // e.g., 100ms = 10 emits/sec
) => {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);
  const prevPointRef = useRef<Point | null>(null);
  const pointBufferRef = useRef<Point[]>([]); // Ref to store points between emits

  // --- Throttled Emitter ---
  const throttledEmitBatch = useCallback(
    throttle(() => {
      if (pointBufferRef.current.length > 0) {
        // console.log(`Throttled Emit: Sending ${pointBufferRef.current.length} points`); // Debug
        onDrawEmitBatch({ points: [...pointBufferRef.current] }); // Send a copy of the buffer
        pointBufferRef.current = []; // Clear the buffer AFTER sending
      }
    }, throttleInterval),
    [onDrawEmitBatch, throttleInterval]
  );

  // Ref function to get the canvas element
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    if (node) {
       // Ensure canvas has dimensions - crucial for getBoundingClientRect accuracy
       // These might be better set via props or CSS, but ensure they exist
       node.width = node.clientWidth || 650;
       node.height = node.clientHeight || 500;
       const ctx = node.getContext('2d');
        if (ctx) {
            // Optional defaults:
            // ctx.lineCap = 'round';
            // ctx.lineJoin = 'round';
            // ctx.imageSmoothingEnabled = false;
        }
    }
    canvasElementRef.current = node;
  }, []);

  // Helper to compute point coordinates relative to canvas
  const computePointInCanvas = useCallback((clientX: number, clientY: number): Point | null => {
    const canvas = canvasElementRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    // Calculate scale factors if CSS scaling is applied
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Calculate canvas coordinates, applying scaling and rounding
    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);

    return { x, y };
  }, []); // No dependencies needed here

  // --- Mouse Down Handler ---
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    isDrawingRef.current = true;
    const canvas = canvasElementRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const currentPoint = computePointInCanvas(e.clientX, e.clientY);
    if (!currentPoint) return;

    // 1. Draw locally immediately
    onDrawLocal({ ctx, currentPoint, prevPoint: null });

    // 2. Prepare for batching
    prevPointRef.current = currentPoint;
    pointBufferRef.current = [currentPoint]; // Start buffer with the first point

    // 3. Trigger emit (will send this first point immediately due to throttle)
    throttledEmitBatch();

  }, [computePointInCanvas, onDrawLocal, throttledEmitBatch]);

  // --- Effect for Mouse Move and Up Listeners ---
  // --- Effect for Mouse Move and Up Listeners ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawingRef.current) return;

      const canvas = canvasElementRef.current;
      const ctx = canvas?.getContext('2d');
      if (!ctx) return;

      const currentPoint = computePointInCanvas(e.clientX, e.clientY);
      // Optimization: Don't process if the mouse hasn't moved to a new pixel
      if (!currentPoint || (prevPointRef.current && currentPoint.x === prevPointRef.current.x && currentPoint.y === prevPointRef.current.y)) {
        return;
      }

      // 1. Draw locally IMMEDIATELY
      onDrawLocal({ ctx, currentPoint, prevPoint: prevPointRef.current });

      // 2. Add point to the current batch buffer
      pointBufferRef.current.push(currentPoint);

      // 3. Trigger the throttled emitter (it will send the buffer when ready)
      throttledEmitBatch();

      // Update previous point for the *next* local segment
      prevPointRef.current = currentPoint;
    };

    const handleMouseUp = (e: MouseEvent) => {
       if (e.button !== 0) return;
       if (!isDrawingRef.current) return; // Only act if we were drawing

       isDrawingRef.current = false; // Stop drawing flag

       // --- Crucial: Emit any remaining points in the buffer ---
       // This captures points drawn between the last throttle fire and mouseup.
       // Call the *original* onDrawEmitBatch directly, bypassing throttle.
       if (pointBufferRef.current.length > 0) {
            // console.log(`MouseUp Emit: Sending ${pointBufferRef.current.length} final points`); // Debug
            onDrawEmitBatch({ points: [...pointBufferRef.current] }); // Send remaining points
       }

       // Reset state
       prevPointRef.current = null;
       pointBufferRef.current = []; // Clear buffer
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Optional: Clear buffer on unmount? Maybe not necessary if mouseup handles it.
      // pointBufferRef.current = [];
    };
  }, [computePointInCanvas, onDrawLocal, onDrawEmitBatch, throttledEmitBatch]);


   // Clear function
   const clear = useCallback(() => {
    const canvas = canvasElementRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Return ref setter, mousedown handler, and clear function
  return { canvasRef, onMouseDown: handleMouseDown, clear };
};