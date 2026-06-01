import React, { useRef, useEffect, useState } from 'react';
import './WhiteboardCanvas.css';

const WhiteboardCanvas = ({ 
  elements, 
  activeUsers, 
  currentTool, 
  toolSettings,
  onDrawStart,
  onDrawUpdate, 
  onDrawEnd,
  onCursorMove,
  canvasSettings,
  permissions 
}) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    redrawCanvas(ctx);
  }, [elements, canvasSettings]);

  const redrawCanvas = (ctx) => {
    const { width = 1920, height = 1080, backgroundColor = '#ffffff' } = canvasSettings || {};
    
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    elements?.forEach(element => {
      if (element.isDeleted) return;
      drawElement(ctx, element);
    });
  };

  const drawElement = (ctx, element) => {
    const { type, data } = element;
    ctx.save();
    ctx.strokeStyle = data.strokeColor || '#000000';
    ctx.fillStyle = data.fillColor || 'transparent';
    ctx.lineWidth = data.strokeWidth || 2;

    switch (type) {
      case 'freehand':
        if (data.points?.length > 1) {
          ctx.beginPath();
          ctx.moveTo(data.points[0].x, data.points[0].y);
          data.points.forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        break;
      case 'rectangle':
        ctx.strokeRect(data.x, data.y, data.width, data.height);
        if (data.fillColor !== 'transparent') {
          ctx.fillRect(data.x, data.y, data.width, data.height);
        }
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(data.x, data.y, data.radius, 0, 2 * Math.PI);
        ctx.stroke();
        if (data.fillColor !== 'transparent') ctx.fill();
        break;
      case 'text':
        ctx.font = `${data.fontSize || 16}px ${data.fontFamily || 'Arial'}`;
        ctx.fillStyle = data.strokeColor;
        ctx.fillText(data.text || '', data.x, data.y);
        break;
    }
    ctx.restore();
  };

  const handleMouseDown = (e) => {
    if (!permissions?.write) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    
    if (onDrawStart) {
      onDrawStart({ x, y, tool: currentTool, settings: toolSettings });
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (onCursorMove) {
      onCursorMove({ x, y });
    }

    if (isDrawing && startPos && onDrawUpdate) {
      onDrawUpdate({ x, y, startPos });
    }
  };

  const handleMouseUp = (e) => {
    if (!isDrawing) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(false);
    
    if (onDrawEnd) {
      onDrawEnd({ x, y, startPos });
    }
    
    setStartPos(null);
  };

  return (
    <div className="whiteboard-canvas-container">
      <canvas
        ref={canvasRef}
        width={canvasSettings?.width || 1920}
        height={canvasSettings?.height || 1080}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="whiteboard-canvas"
      />
      <div className="active-users-cursors">
        {activeUsers?.map(user => (
          <div
            key={user.userId}
            className="user-cursor"
            style={{
              left: user.cursor?.x || 0,
              top: user.cursor?.y || 0
            }}
          >
            <span className="user-cursor-label">{user.userName}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WhiteboardCanvas;
