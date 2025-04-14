import { useEffect, useRef, useState, useCallback } from 'react';

export const useDraw = (onDraw: ({ctx, currentPoint, prevPoint}: Draw) => void) => {
    const [mouseDown, setMouseDown] = useState(false);

    // Keep track of the canvas element using state derived from the ref callback
    const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
    const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
        // This callback ref ensures we get the node instance when it's mounted
        setCanvasElement(node);
    }, []); // Empty dependency array, ref callback itself doesn't change

    const prevPoint = useRef<Point | null>(null); // Use Point | null type

    // --- Helper to compute point, moved outside useEffect for reuse ---
    const computePointInCanvas = useCallback((e: MouseEvent | React.MouseEvent<HTMLCanvasElement>): Point | null => {
        // Use the state variable canvasElement
        if (!canvasElement) return null;

        const rect = canvasElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        return { x, y };
    }, [canvasElement]); // Depends on canvasElement state

    // --- MODIFIED: The mousedown handler returned by the hook ---
    // It now takes the event and triggers the initial draw
    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!canvasElement) return; // Guard against null canvas

        setMouseDown(true); // Indicate drawing has started

        const currentPoint = computePointInCanvas(e);
        const ctx = canvasElement.getContext('2d');

        if (!ctx || !currentPoint) return; // Guard against null context or point

        // --- Draw the initial dot immediately on mousedown ---
        // Pass currentPoint as prevPoint. Your drawLine function's logic
        // of drawing a circle at currentPoint will handle this correctly.
        onDraw({ ctx, currentPoint, prevPoint: currentPoint });

        // Set the prevPoint ref *after* drawing the initial dot,
        // so the *next* mousemove (if any) starts from this click point.
        prevPoint.current = currentPoint;

    }, [canvasElement, computePointInCanvas, onDraw]); // Add dependencies

    // Make clear function stable with useCallback
    const clear = useCallback(() => {
        if (!canvasElement) return;
        const ctx = canvasElement.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }, [canvasElement]); // Dependency

    // Effect for handling mouse move and mouse up
    useEffect(() => {
        // Use the state variable canvasElement here
        if (!canvasElement) {
            return; // Exit if canvas element is not yet available
        }

        // Mouse Move Handler
        const handler = (e: MouseEvent) => {
            if (!mouseDown) return; // Only draw if mouse is down

            const currentPoint = computePointInCanvas(e);
            const ctx = canvasElement.getContext('2d');
            if (!ctx || !currentPoint) return;

            // Call the draw function passed from the component
            onDraw({ ctx, currentPoint, prevPoint: prevPoint.current });
            prevPoint.current = currentPoint; // Update previous point for the next segment
        };

        // Mouse Up Handler (listens on window to catch mouseup outside canvas)
        const mouseUpHandler = () => {
            setMouseDown(false); // Stop drawing
            prevPoint.current = null; // Reset previous point state for the next stroke
        };

        // Add event listeners
        canvasElement.addEventListener('mousemove', handler);
        window.addEventListener('mouseup', mouseUpHandler);

        // Cleanup function to remove listeners when component unmounts or dependencies change
        return () => {
            canvasElement.removeEventListener('mousemove', handler);
            window.removeEventListener('mouseup', mouseUpHandler);
        };
        // Dependencies for the effect
    }, [onDraw, mouseDown, canvasElement, computePointInCanvas]); // Include all used variables/functions from outside

    // Return the ref callback, the modified mousedown handler, and the clear function
    return { canvasRef, onMouseDown: handleMouseDown, clear };
};