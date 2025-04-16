// utils/drawLine.ts (Check/Confirm)

type Point = { x: number; y: number };

type DrawLineParams = {
  ctx: CanvasRenderingContext2D;
  currentPoint: Point;
  prevPoint: Point | null; // Can be null for the first point in a batch or single dot
  color: string;
  brushSize: number;
}

export const drawLine = ({
  prevPoint,
  currentPoint,
  ctx,
  color,
  brushSize,
}: DrawLineParams) => {
  if (!currentPoint) return; // Should not happen if called correctly, but safe check

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = color; // Use fillStyle for pixel-perfect squares/circles

  const radius = Math.max(1, Math.floor(brushSize / 2)); // Ensure radius is at least 1
  const radiusSq = radius * radius; // Pre-calculate squared radius

  // Function to draw a filled circle (approximated by squares) at a point
  const drawPixelatedCircle = (centerX: number, centerY: number) => {
    const radius = Math.max(1, Math.floor(brushSize / 2));
    const radiusSq = radius * radius;
    ctx.fillStyle = color; // Ensure fillStyle is set here
    ctx.imageSmoothingEnabled = false;

    const startX = centerX - radius;
    const startY = centerY - radius;
    const endX = centerX + radius;
    const endY = centerY + radius;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - centerX;
        const dy = y - centerY;
        if (dx * dx + dy * dy <= radiusSq) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  };

  const p0 = prevPoint ?? currentPoint; // Start point for interpolation or the only point
  const p1 = currentPoint;           // End point

  if (prevPoint === null) {
    // Draw a single dot/circle if no previous point
    drawPixelatedCircle(p1.x, p1.y);
  } else {
    // Interpolate between p0 and p1
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(distance / Math.max(1, brushSize * 0.3)); // Adjust density

    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = Math.round(p0.x + dx * t);
      const y = Math.round(p0.y + dy * t);
      drawPixelatedCircle(x, y);
    }

  // Ensure the final exact point is also drawn (interpolation might miss it slightly)
  drawPixelatedCircle(p1.x, p1.y);
  if (!prevPoint) { // If it was just a dot (mousedown without move)
      drawPixelatedCircle(p0.x, p0.y);
  }
  }
};