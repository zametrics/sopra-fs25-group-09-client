import { useEffect, useRef, useState, useCallback } from 'react';

export const useDraw = (onDraw: ({ctx, currentPoint, prevPoint}: Draw) => void) => {
    const [mouseDown, setMouseDown] = useState(false)

  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    if (node !== null) {
      setCanvasElement(node);
    } else {
      setCanvasElement(null);
    }
  }, []);
  const prevPoint = useRef<null | Point>(null)

  const onMouseDown = () => setMouseDown(true)

  useEffect(() => {
    if (!canvasElement) {
      return;
    }

    const handler = (e: MouseEvent) => {
        if(!mouseDown) return
      const currentPoint = computePointInCanvas(e)
      const ctx = canvasElement.getContext('2d')
      if(!ctx || !currentPoint) return

      onDraw({ctx, currentPoint, prevPoint: prevPoint.current})
      prevPoint.current = currentPoint
    };

    const computePointInCanvas = (e: MouseEvent) => {
        const canvas = canvasElement
        if (!canvas) return

        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        return {x, y}
    }

    const mouseUpHandler = () => {
        setMouseDown(false)
        prevPoint.current = null
    }

    canvasElement.addEventListener('mousemove', handler);
    window.addEventListener('mouseup', mouseUpHandler)

    return () => {
      canvasElement.removeEventListener('mousemove', handler)
      window.removeEventListener('mouseup', mouseUpHandler)
    };
  }, [onDraw]);

  return { canvasRef, onMouseDown };
};
