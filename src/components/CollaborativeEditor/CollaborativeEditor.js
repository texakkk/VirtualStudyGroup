import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, message, Spin, Button } from 'antd';
import { SaveOutlined, ShareAltOutlined, HistoryOutlined } from '@ant-design/icons';
import io from 'socket.io-client';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import UserPresenceIndicator from './UserPresenceIndicator';
import DocumentSharingControls from './DocumentSharingControls';
import './CollaborativeEditor.css';

const CollaborativeEditor = ({ documentId, onClose }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [activeUsers, setActiveUsers] = useState([]);
  const [permissions, setPermissions] = useState({ read: false, write: false });
  const [showSharing, setShowSharing] = useState(false);
  const [version, setVersion] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  
  const quillRef = useRef(null);
  const isRemoteChange = useRef(false);
  const pendingOperations = useRef([]);

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ]
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      message.error('Authentication required');
      return;
    }

    const newSocket = io(
      `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/document-collaboration`,
      { auth: { token } }
    );

    newSocket.on('connect', () => {
      console.log('Document collaboration socket connected');
      setConnected(true);
      newSocket.emit('joinDocument', { documentId });
    });

    newSocket.on('documentJoined', (data) => {
      setContent(data.content || '');
      setActiveUsers(data.activeUsers || []);
      setPermissions({ 
        read: true, 
        write: data.hasWritePermission 
      });
      setVersion(data.version || 1);
      setLoading(false);
    });

    newSocket.on('userJoined', (data) => {
      setActiveUsers(prev => {
        const exists = prev.find(u => u.userId === data.userId);
        if (exists) return prev;
        return [...prev, data];
      });
      message.info(`${data.userName} joined the document`);
    });

    newSocket.on('userLeft', (data) => {
      setActiveUsers(prev => prev.filter(u => u.userId !== data.userId));
      message.info(`${data.userName} left the document`);
    });

    newSocket.on('documentOperationApplied', (data) => {
      applyRemoteOperation(data);
    });

    newSocket.on('cursorUpdated', (data) => {
      setActiveUsers(prev => prev.map(user =>
        user.userId === data.userId
          ? { ...user, cursor: data.cursor, selection: data.selection }
          : user
      ));
    });

    newSocket.on('operationAcknowledged', (data) => {
      setVersion(data.version);
      // Remove acknowledged operation from pending
      pendingOperations.current = pendingOperations.current.filter(
        op => op.changeId !== data.changeId
      );
    });

    newSocket.on('error', (data) => {
      message.error(data.message || 'An error occurred');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      message.warning('Disconnected from document');
    });

    setSocket(newSocket);

    return () => {
      if (newSocket) {
        newSocket.emit('leaveDocument', documentId);
        newSocket.disconnect();
      }
    };
  }, [documentId]);

  const applyRemoteOperation = useCallback((data) => {
    if (!quillRef.current) return;

    const editor = quillRef.current.getEditor();
    isRemoteChange.current = true;

    try {
      switch (data.operation) {
        case 'insert':
          editor.insertText(data.position, data.content, 'silent');
          break;
        case 'delete':
          editor.deleteText(data.position, data.length, 'silent');
          break;
        case 'format':
          editor.formatText(data.position, data.length, data.attributes, 'silent');
          break;
      }
      setVersion(data.version);
    } catch (error) {
      console.error('Error applying remote operation:', error);
    } finally {
      isRemoteChange.current = false;
    }
  }, []);

  const handleTextChange = useCallback((value, delta, source, editor) => {
    if (source === 'user' && !isRemoteChange.current && socket && permissions.write) {
      setContent(value);

      // Process delta changes
      delta.ops?.forEach(op => {
        if (op.retain) return; // Skip retain operations

        const changeId = `${Date.now()}-${Math.random()}`;
        let operation;

        if (op.insert) {
          operation = {
            operation: 'insert',
            position: editor.getSelection()?.index || 0,
            content: typeof op.insert === 'string' ? op.insert : '',
            attributes: op.attributes || {},
            changeId,
            version
          };
        } else if (op.delete) {
          operation = {
            operation: 'delete',
            position: editor.getSelection()?.index || 0,
            length: op.delete,
            changeId,
            version
          };
        }

        if (operation) {
          pendingOperations.current.push(operation);
          socket.emit('documentOperation', {
            documentId,
            ...operation
          });
        }
      });
    }
  }, [socket, documentId, permissions, version]);

  const handleSelectionChange = useCallback((range, source, editor) => {
    if (source === 'user' && socket && range) {
      socket.emit('cursorUpdate', {
        documentId,
        cursor: range.index,
        selection: { start: range.index, end: range.index + range.length }
      });
    }
  }, [socket, documentId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save is handled automatically by the backend
      message.success('Document saved successfully');
    } catch (error) {
      message.error('Failed to save document');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="collaborative-editor-loading">
        <Spin size="large" tip="Loading document..." />
      </div>
    );
  }

  return (
    <div className="collaborative-editor">
      <Card
        title="Collaborative Document"
        extra={
          <div className="editor-header-actions">
            <UserPresenceIndicator activeUsers={activeUsers} />
            
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => setShowSharing(true)}
            >
              Share
            </Button>

            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={isSaving}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="editor-container">
          <div className="editor-status">
            <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
              {connected ? '● Connected' : '○ Disconnected'}
            </span>
            <span className="version-info">Version: {version}</span>
            {!permissions.write && (
              <span className="read-only-badge">Read Only</span>
            )}
          </div>

          <ReactQuill
            ref={quillRef}
            value={content}
            onChange={handleTextChange}
            onChangeSelection={handleSelectionChange}
            modules={modules}
            theme="snow"
            readOnly={!permissions.write}
            placeholder="Start typing..."
          />

          {activeUsers.length > 0 && (
            <div className="active-cursors">
              {activeUsers.map(user => (
                <div
                  key={user.userId}
                  className="user-cursor-indicator"
                  style={{
                    top: `${user.cursor || 0}px`,
                    left: '0px'
                  }}
                >
                  <span className="cursor-label">{user.userName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {showSharing && (
        <DocumentSharingControls
          documentId={documentId}
          visible={showSharing}
          onClose={() => setShowSharing(false)}
        />
      )}
    </div>
  );
};

export default CollaborativeEditor;
