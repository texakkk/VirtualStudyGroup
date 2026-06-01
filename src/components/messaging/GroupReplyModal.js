import React, { useState, useRef, useEffect } from "react";
import {
  FaPaperPlane,
  FaSmile,
  FaPaperclip,
  FaTimes,
  FaReply,
} from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import api from "../../api";
import "./GroupReplyModal.css";

const GroupReplyModal = ({ 
  isOpen, 
  onClose, 
  originalMessage,
  groupInfo,
  socket,
  onReplySent 
}) => {
  const [replyMessage, setReplyMessage] = useState("");
  const [file, setFile] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  const fileInputRef = useRef(null);
  const modalRef = useRef(null);
  const textareaRef = useRef(null);

  // Handle emoji selection
  const handleEmojiClick = (emojiData) => {
    setReplyMessage(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  // Send reply
  const sendReply = async () => {
    if ((!replyMessage.trim() && !file) || !originalMessage || !groupInfo) return;

    setIsSending(true);
    const timestamp = new Date().toISOString();

    try {
      let savedMessage;

      if (file) {
        // Handle file upload with reply
        const formData = new FormData();
        formData.append("file", file);
        formData.append("groupId", groupInfo._id);
        formData.append("timestamp", timestamp);
        formData.append("replyTo", originalMessage._id);
        if (replyMessage.trim()) {
          formData.append("content", replyMessage.trim());
        }

        const uploadResponse = await api.post("/message/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        savedMessage = uploadResponse.data;
      } else {
        // Handle text reply
        const messageData = {
          Message_groupId: groupInfo._id,
          Message_content: replyMessage,
          Message_timestamp: timestamp,
          Message_replyTo: originalMessage._id,
        };

        const response = await api.post("/message", messageData);
        savedMessage = response.data;
      }

      // Emit via socket for real-time updates
      if (socket) {
        const socketData = {
          groupId: groupInfo._id,
          ...savedMessage,
          isReply: true,
          replyToId: originalMessage._id,
        };
        socket.emit("sendMessage", socketData);
      }

      // Callback to parent component
      if (onReplySent) {
        onReplySent(savedMessage, groupInfo);
      }

      // Clear form and close modal
      setReplyMessage("");
      setFile(null);
      onClose();

    } catch (error) {
      console.error("Error sending reply:", error);
      alert("Failed to send reply. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Close modal when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setReplyMessage("");
      setFile(null);
      setShowEmojiPicker(false);
    }
  }, [isOpen]);

  if (!isOpen || !originalMessage || !groupInfo) return null;

  // Get original message preview
  const getMessagePreview = () => {
    if (originalMessage.Message_fileId || originalMessage.fileUrl) {
      const fileName = originalMessage.Message_fileId?.File_originalName || 
                     originalMessage.fileName || 
                     "File attachment";
      return `📎 ${fileName}`;
    }
    
    const content = originalMessage.Message_content || originalMessage.content || "";
    return content.length > 100 ? `${content.substring(0, 100)}...` : content;
  };

  const getSenderName = () => {
    return originalMessage.Message_sender?.User_name || 
           originalMessage.sender?.name || 
           "Unknown User";
  };

  return (
    <div className="group-reply-modal-overlay">
      <div className="group-reply-modal" ref={modalRef}>
        <div className="group-reply-header">
          <div className="reply-header-info">
            <FaReply className="reply-icon" />
            <div>
              <h3>Reply in {groupInfo.Group_name}</h3>
              <p>Replying to {getSenderName()}</p>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="group-reply-content">
          {/* Original Message Preview */}
          <div className="original-message-preview">
            <div className="original-message-header">
              <span className="original-sender">{getSenderName()}</span>
              <span className="original-time">
                {new Date(originalMessage.Message_createdAt || originalMessage.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="original-message-content">
              {getMessagePreview()}
            </div>
          </div>

          {/* File Preview */}
          {file && (
            <div className="file-preview">
              <div className="file-preview-info">
                <span>
                  {file.type.startsWith("image/") ? "🖼️" :
                   file.type.startsWith("video/") ? "🎥" :
                   file.type.startsWith("audio/") ? "🎵" : "📎"}
                </span>
                <span>{file.name}</span>
                <span className="file-size">
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </div>
              <button
                className="file-preview-remove"
                onClick={() => setFile(null)}
              >
                <FaTimes />
              </button>
            </div>
          )}

          {/* Reply Input */}
          <div className="reply-input-container">
            <div className="reply-input-actions">
              <button
                className="emoji-button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                type="button"
              >
                <FaSmile />
              </button>

              <button
                className="file-upload-button"
                onClick={handleChooseFile}
                type="button"
              >
                <FaPaperclip />
              </button>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </div>

            {showEmojiPicker && (
              <div className="emoji-picker-container">
                <EmojiPicker
                  onEmojiClick={handleEmojiClick}
                  width={300}
                  height={350}
                />
              </div>
            )}

            <textarea
              ref={textareaRef}
              rows="4"
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              placeholder={`Reply to ${getSenderName()} in ${groupInfo.Group_name}...`}
              className="reply-textarea"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="group-reply-footer">
          <div className="reply-info">
            <span>Replying in {groupInfo.Group_name}</span>
          </div>
          <div className="footer-actions">
            <button 
              className="cancel-btn" 
              onClick={onClose}
              disabled={isSending}
            >
              Cancel
            </button>
            <button
              className="send-btn"
              onClick={sendReply}
              disabled={(!replyMessage.trim() && !file) || isSending}
            >
              {isSending ? (
                <>
                  <div className="spinner"></div>
                  Sending...
                </>
              ) : (
                <>
                  <FaPaperPlane />
                  Send Reply
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GroupReplyModal;