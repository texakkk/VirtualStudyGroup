import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, message, Spin, Modal } from 'antd';
import io from 'socket.io-client';
import WhiteboardCanvas from './WhiteboardCanvas';
import WhiteboardToolbar from './WhiteboardToolbar';
import WhiteboardPermissions from './WhiteboardPermissions';
import './WhiteboardManager.css';

const WhiteboardManager = ({ whiteboardId, groupId, onClose }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [whiteboard, setWhiteboard] = useState(null);
  const [elements, setElements] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [currentTool, setCurrentTool] = useState('select');
  const [toolSettings, setToolSettings] = useState({
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2
  });
  const [permissions, setPermissions] = useState({ read: false, write: false, admin: false });
  const [showPermissions, setShowPermissions] = useState(false);
  
  const currentElementRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      message.error('Authentication required');
      return;
    }

    const newSocket = io(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/whiteboard`, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Whiteboard socket connected');
      setConnected(true);
      newSocket.emit('join-whiteboard', { whiteboardId, token });
    });

    newSocket.on('whiteboard-state', (data) => {
      setWhiteboard(data);
      setElements(data.elements || []);
      setActiveUsers(data.activeUsers || []);
      setPermissions(data.permissions || {});
      setLoading(false);
    });

    newSocket.on('user-joined', (data) => {
      setActiveUsers(data.activeUsers || []);
      message.info(`${data.userName} joined the whiteboard`);
    });

    newSocket.on('user-left', (data) => {
      setActiveUsers(prev => prev.filter(u => u.userId !== data.userId));
      message.info(`${data.userName} left the whiteboard`);
    });

    newSocket.on('draw-start', (data) => {
      // Handle remote draw start
    });

    newSocket.on('draw-update', (data) => {
      // Handle remote draw update
    });

    newSocket.on('draw-end', (data) => {
      setElements(prev => [...prev, {
        elementId: data.elementId,
        ...data.elementData,
        userId: data.userId,
        userName: data.userName
      }]);
    });

    newSocket.on('element-update', (data) => {
      setElements(prev => prev.map(el =>
        el.elementId === data.elementId ? { ...el, data: { ...el.data, ...data.updates } } : el
      ));
    });

    newSocket.on('element-delete', (data) => {
      setElements(prev => prev.map(el =>
        el.elementId === data.elementId ? { ...el, isDeleted: true } : el
      ));
    });

    newSocket.on('cursor-move', (data) => {
      setActiveUsers(prev => prev.map(user =>
        user.userId === data.userId ? { ...user, cursor: data.cursor } : user
      ));
    });

    newSocket.on('join-error', (data) => {
      message.error(data.error || 'Failed to join whiteboard');
      setLoading(false);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      message.warning('Disconnected from whiteboard');
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.emit('leave-whiteboard', { whiteboardId });
        newSocket.disconnect();
      }
    };
  }, [whiteboardId]);

  const handleDrawStart = useCallback(({ x, y, tool, settings }) => {
    if (!permissions.write || !socket) return;

    const elementId = `${Date.now()}-${Math.random()}`;
    let elementData;

    switch (tool) {
      case 'pen':
        elementData = {
          type: 'freehand',
          data: {
            points: [{ x, y }],
            ...settings
          }
        };
        break;
      case 'rectangle':
        elementData = {
          type: 'rectangle',
          data: {
            x, y,
            width: 0,
            height: 0,
            ...settings
          }
        };
        break;
      case 'circle':
        elementData = {
          type: 'circle',
          data: {
            x, y,
            radius: 0,
            ...settings
          }
        };
        break;
      default:
        return;
    }

    currentElementRef.current = { elementId, ...elementData };
    socket.emit('draw-start', { whiteboardId, elementData });
  }, [socket, permissions, whiteboardId]);

  const handleDrawUpdate = useCallback(({ x, y, startPos }) => {
    if (!currentElementRef.current || !socket) return;

    const element = currentElementRef.current;
    
    switch (element.type) {
      case 'freehand':
        element.data.points.push({ x, y });
        break;
      case 'rectangle':
        element.data.width = x - startPos.x;
        element.data.height = y - startPos.y;
        break;
      case 'circle':
        const dx = x - startPos.x;
        const dy = y - startPos.y;
        element.data.radius = Math.sqrt(dx * dx + dy * dy);
        break;
    }

    socket.emit('draw-update', {
      whiteboardId,
      elementId: element.elementId,
      elementData: element
    });
  }, [socket, whiteboardId]);

  const handleDrawEnd = useCallback(({ x, y, startPos }) => {
    if (!currentElementRef.current || !socket) return;

    const element = currentElementRef.current;
    
    socket.emit('draw-end', {
      whiteboardId,
      elementId: element.elementId,
      elementData: element
    });

    setElements(prev => [...prev, element]);
    currentElementRef.current = null;
  }, [socket, whiteboardId]);

  const handleCursorMove = useCallback(({ x, y }) => {
    if (!socket) return;
    socket.emit('cursor-move', { whiteboardId, cursor: { x, y } });
  }, [socket, whiteboardId]);

  const handleToolChange = (tool) => {
    setCurrentTool(tool);
    if (socket) {
      socket.emit('tool-select', {
        whiteboardId,
        selectedTool: tool,
        toolSettings
      });
    }
  };

  const handleToolSettingsChange = (newSettings) => {
    setToolSettings(prev => ({ ...prev, ...newSettings }));
  };

  const handleUndo = () => {
    // Implement undo logic
  };

  const handleRedo = () => {
    // Implement redo logic
  };

  const handleClear = () => {
    Modal.confirm({
      title: 'Clear Whiteboard',
      content: 'Are you sure you want to clear all elements?',
      onOk: () => {
        // Implement clear logic
      }
    });
  };

  const handleSave = () => {
    message.success('Whiteboard saved successfully');
  };

  if (loading) {
    return (
      <div className="whiteboard-loading">
        <Spin size="large" tip="Loading whiteboard..." />
      </div>
    );
  }

  return (
    <div className="whiteboard-manager">
      <Card
        title={`Whiteboard: ${whiteboard?.Whiteboard_name || 'Untitled'}`}
        extra={
          <div className="whiteboard-header-actions">
            <span className="active-users-count">
              {activeUsers.length} user{activeUsers.length !== 1 ? 's' : ''} active
            </span>
            {permissions.admin && (
              <button onClick={() => setShowPermissions(true)}>
                Permissions
              </button>
            )}
          </div>
        }
      >
        <WhiteboardToolbar
          currentTool={currentTool}
          toolSettings={toolSettings}
          onToolChange={handleToolChange}
          onToolSettingsChange={handleToolSettingsChange}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onSave={handleSave}
          canUndo={false}
          canRedo={false}
          permissions={permissions}
        />

        <WhiteboardCanvas
          elements={elements}
          activeUsers={activeUsers}
          currentTool={currentTool}
          toolSettings={toolSettings}
          onDrawStart={handleDrawStart}
          onDrawUpdate={handleDrawUpdate}
          onDrawEnd={handleDrawEnd}
          onCursorMove={handleCursorMove}
          canvasSettings={whiteboard?.Whiteboard_settings}
          permissions={permissions}
        />
      </Card>

      {showPermissions && (
        <WhiteboardPermissions
          whiteboardId={whiteboardId}
          visible={showPermissions}
          onClose={() => setShowPermissions(false)}
        />
      )}
    </div>
  );
};

export default WhiteboardManager;
