import { useEffect, useRef, useCallback, useState } from 'react';

export const useDraw = (
  onDraw: ({ ctx, currentPoint, prevPoint }: Draw) => void
) => {
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [mouseDown, setMouseDown] = useState(false);
  const prevPoint = useRef<Point | null>(null);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    canvasElementRef.current = node;
    if (node) {
      node.width = 650;
      node.height = 500;
    }
  }, []);

  const computePointInCanvas = useCallback((e: MouseEvent | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasElementRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    return { x, y };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;

    setMouseDown(true);

    const currentPoint = computePointInCanvas(e);
    const ctx = canvas.getContext('2d');
    if (!ctx || !currentPoint) return;

    ctx.imageSmoothingEnabled = false;
    onDraw({ ctx, currentPoint, prevPoint: currentPoint });
    prevPoint.current = currentPoint;
  }, [computePointInCanvas, onDraw]);

  const clear = useCallback(() => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    const canvas = canvasElementRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return;

      const currentPoint = computePointInCanvas(e);
      const ctx = canvas.getContext('2d');
      if (!ctx || !currentPoint) return;

      ctx.imageSmoothingEnabled = false;
      onDraw({ ctx, currentPoint, prevPoint: prevPoint.current });
      prevPoint.current = currentPoint;
    };

    const handleMouseUp = () => {
      setMouseDown(false);
      prevPoint.current = null;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [computePointInCanvas, onDraw, mouseDown]);

  return { canvasRef, onMouseDown: handleMouseDown, clear };
};
