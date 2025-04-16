type DrawLineProps = Draw & {
    color: string
    brushSize: number
}

export const drawLine = ({prevPoint, currentPoint, ctx, color, brushSize}: DrawLineProps) => {
  if (!currentPoint) return;
  
  const lineColor = color;
  const size = brushSize;
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = lineColor;

  const drawPixel = (centerX: number, centerY: number) => {
    const radius = Math.floor(size / 2); // immer ganzzahlig
    const radiusSq = radius * radius;
  
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y <= radiusSq) {
          ctx.fillRect(
            Math.floor(centerX + x),
            Math.floor(centerY + y),
            1,
            1
          );
        }
      }
    }
  };

  const p0 = prevPoint ?? currentPoint;
  const p1 = currentPoint;

  const dx = Math.abs(p1.x - p0.x);
  const dy = Math.abs(p1.y - p0.y);
  const sx = p0.x < p1.x ? 1 : -1;
  const sy = p0.y < p1.y ? 1 : -1;
  let err = dx - dy;

  let x = Math.floor(p0.x);
  let y = Math.floor(p0.y);
  const endX = Math.floor(p1.x);
  const endY = Math.floor(p1.y);

  while (true) {
    drawPixel(x, y); // nicht mehr x - size / 2!


    if (x === endX && y === endY) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}