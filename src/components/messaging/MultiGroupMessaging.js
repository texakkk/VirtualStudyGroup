import React, { useState, useEffect, useRef } from "react";
import {
  FaPaperPlane,
  FaSmile,
  FaPaperclip,
  FaTimes,
  FaUsers,
  FaCheck,
} from "react-icons/fa";
import EmojiPicker from "emoji-picker-react";
import api from "../../api";
import "./MultiGroupMessaging.css";

const MultiGroupMessaging = ({
  isOpen,
  onClose,
  userGroups = [],
  socket,
  onMessageSent,
}) => {
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showGroupSelector, setShowGroupSelector] = useState(true);

  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  // Filter groups based on search term
  const filteredGroups = userGroups.filter((group) =>
    group.Group_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle group selection
  const toggleGroupSelection = (group) => {
    setSelectedGroups((prev) => {
      const isSelected = prev.some((g) => g._id === group._id);
      if (isSelected) {
        return prev.filter((g) => g._id !== group._id);
      } else {
        return [...prev, group];
      }
    });
  };

  // Handle select all groups
  const selectAllGroups = () => {
    setSelectedGroups([...filteredGroups]);
    // Auto-collapse after selecting all
    if (filteredGroups.length > 0) {
      setTimeout(() => setShowGroupSelector(false), 500);
    }
  };

  // Handle clear all selections
  const clearAllSelections = () => {
    setSelectedGroups([]);
  };

  // Auto-expand selector when no groups are selected
  useEffect(() => {
    if (selectedGroups.length === 0 && isOpen) {
      setShowGroupSelector(true);
    }
  }, [selectedGroups.length, isOpen]);

  // Handle emoji selection
  const handleEmojiClick = (emojiData) => {
    setMessage((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  // Send message to multiple groups
  const sendMultiGroupMessage = async () => {
    if ((!message.trim() && !file) || selectedGroups.length === 0) return;

    setIsSending(true);
    const timestamp = new Date().toISOString();
    const groupIds = selectedGroups.map((group) => group._id);

    try {
      let response;

      if (file) {
        // Handle file upload to multiple groups
        const formData = new FormData();
        formData.append("file", file);
        formData.append("groupIds", JSON.stringify(groupIds));
        formData.append("timestamp", timestamp);
        if (message.trim()) {
          formData.append("content", message.trim());
        }

        response = await api.post("/message/multi-group-upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        // Handle text message to multiple groups
        const messageData = {
          groupIds,
          Message_content: message,
          Message_timestamp: timestamp,
        };

        response = await api.post("/message/multi-group", messageData);
      }

      const { results, errors, totalSent, totalFailed } = response.data;

      console.log("Multi-group response:", {
        results,
        errors,
        totalSent,
        totalFailed,
      });

      // Emit via socket for real-time updates
      if (socket && socket.connected && results.length > 0) {
        console.log("Socket is connected, emitting messages...");
        results.forEach((result) => {
          if (result.success) {
            // Transform the message to match the format expected by Chat component
            const formattedMessage = {
              ...result.message,
              sender: result.message.Message_sender,
              content: result.message.Message_content,
              createdAt: result.message.Message_createdAt,
              messageType: result.message.Message_type || "text",
              // Handle file information
              fileId: result.message.Message_fileId?._id,
              fileUrl: result.message.Message_fileId?.File_url,
              fileType: result.message.Message_fileId?.File_type,
              fileName: result.message.Message_fileId?.File_originalName,
              fileSize: result.message.Message_fileId?.File_size,
              fileSizeFormatted:
                result.message.Message_fileId?.File_sizeFormatted,
              emojiReactions: result.message.Message_emojiReactions || [],
            };

            const socketData = {
              ...formattedMessage,
              Message_groupId: result.groupId, // Use the correct field name expected by Chat component
              Message_type: result.message.Message_type,
              Message_fileId: result.message.Message_fileId,
              isMultiGroup: true,
            };
            console.log("Emitting multi-group message via socket:", socketData);

            // Emit to the specific group room
            socket.emit("sendMessage", socketData);
          }
        });
      } else {
        console.warn("Socket not connected or no results to emit");
        // If socket is not available, we could trigger a manual refresh
        // This is a fallback mechanism
        if (onMessageSent) {
          setTimeout(() => {
            // Trigger a refresh of the current chat if it's one of the target groups
            window.dispatchEvent(
              new CustomEvent("multiGroupMessageSent", {
                detail: { groupIds: groupIds, results },
              })
            );
          }, 1000);
        }
      }

      // Prepare feedback data
      const successfulGroups = results
        .filter((r) => r.success)
        .map((r) => selectedGroups.find((g) => g._id === r.groupId)?.Group_name)
        .filter(Boolean);

      const failedGroups = errors
        .map((e) => selectedGroups.find((g) => g._id === e.groupId)?.Group_name)
        .filter(Boolean);

      // Show success/failure feedback
      if (onMessageSent) {
        onMessageSent(
          `Message sent to ${totalSent} of ${selectedGroups.length} groups`,
          successfulGroups,
          failedGroups
        );
      }

      if (totalFailed === 0) {
        // Clear form if all messages sent successfully
        setMessage("");
        setFile(null);
        setSelectedGroups([]);
        onClose();
      } else {
        // Show which groups failed
        console.warn("Failed to send to some groups:", errors);
      }
    } catch (error) {
      console.error("Error in multi-group messaging:", error);
      alert("Failed to send message to groups. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Close modal when clicking outside and handle keyboard shortcuts
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    const handleKeyDown = (event) => {
      // Toggle group selector with Ctrl/Cmd + G
      if ((event.ctrlKey || event.metaKey) && event.key === "g") {
        event.preventDefault();
        setShowGroupSelector(!showGroupSelector);
      }
      // Close modal with Escape
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, showGroupSelector]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMessage("");
      setFile(null);
      setSelectedGroups([]);
      setSearchTerm("");
      setShowEmojiPicker(false);
      // Keep the last state of showGroupSelector or default to true
      const savedSelectorState = localStorage.getItem(
        "multiGroupSelectorState"
      );
      setShowGroupSelector(
        savedSelectorState ? JSON.parse(savedSelectorState) : true
      );
    }
  }, [isOpen]);

  // Save group selector state to localStorage
  useEffect(() => {
    localStorage.setItem(
      "multiGroupSelectorState",
      JSON.stringify(showGroupSelector)
    );
  }, [showGroupSelector]);

  if (!isOpen) return null;

  return (
    <div className="multi-group-modal-overlay">
      <div className="multi-group-modal" ref={modalRef}>
        <div className="multi-group-header">
          <h3>Send Message to Multiple Groups</h3>
          <button className="close-btn" onClick={onClose}>
            <FaTimes />
          </button>
        </div>

        <div className="multi-group-content">
          {/* Group Selection Section */}
          <div className="group-selection-section">
            <div className="group-selection-header">
              <div className="group-header-left">
                <h4>Select Groups ({selectedGroups.length} selected)</h4>
                <button
                  className="toggle-selector-btn"
                  onClick={() => setShowGroupSelector(!showGroupSelector)}
                  title={`${
                    showGroupSelector ? "Hide" : "Show"
                  } group selector (Ctrl+G)`}
                >
                  {showGroupSelector ? "▼" : "▶"}
                </button>
              </div>
              <div className="group-selection-actions">
                <button
                  className="select-all-btn"
                  onClick={selectAllGroups}
                  disabled={filteredGroups.length === selectedGroups.length}
                >
                  Select All
                </button>
                <button
                  className="clear-all-btn"
                  onClick={clearAllSelections}
                  disabled={selectedGroups.length === 0}
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Selected Groups Display - Always visible */}
            {selectedGroups.length > 0 && (
              <div className="selected-groups">
                <div className="selected-groups-label">Selected:</div>
                <div className="selected-groups-list">
                  {selectedGroups.map((group) => (
                    <div key={group._id} className="selected-group-tag">
                      <span>{group.Group_name}</span>
                      <button
                        onClick={() => toggleGroupSelection(group)}
                        className="remove-group-btn"
                      >
                        <FaTimes size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compact summary when collapsed */}
            {!showGroupSelector && selectedGroups.length === 0 && (
              <div className="group-selector-collapsed">
                <p>Click the arrow or press Ctrl+G to select groups</p>
              </div>
            )}

            {/* Collapsible Group Selector */}
            {showGroupSelector && (
              <>
                {/* Search Groups */}
                <div className="group-search">
                  <input
                    type="text"
                    placeholder="Search groups..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="group-search-input"
                  />
                </div>

                {/* Groups List */}
                <div className="groups-list">
                  {filteredGroups.length === 0 ? (
                    <div className="no-groups">
                      {searchTerm ? "No groups found" : "No groups available"}
                    </div>
                  ) : (
                    filteredGroups.map((group) => {
                      const isSelected = selectedGroups.some(
                        (g) => g._id === group._id
                      );
                      return (
                        <div
                          key={group._id}
                          className={`group-item ${
                            isSelected ? "selected" : ""
                          }`}
                          onClick={() => toggleGroupSelection(group)}
                        >
                          <div className="group-checkbox">
                            {isSelected && <FaCheck />}
                          </div>
                          <div className="group-info">
                            <div className="group-name">{group.Group_name}</div>
                            <div className="group-meta">
                              <FaUsers size={12} />
                              <span>{group.memberCount || 0} members</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>

          {/* Message Composition Section */}
          <div className="message-composition-section">
            <h4>Compose Message</h4>

            {/* File Preview */}
            {file && (
              <div className="file-preview">
                <div className="file-preview-info">
                  <span>
                    {file.type.startsWith("image/")
                      ? "🖼️"
                      : file.type.startsWith("video/")
                      ? "🎥"
                      : file.type.startsWith("audio/")
                      ? "🎵"
                      : "📎"}
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

            {/* Message Input */}
            <div className="message-input-container">
              <div className="message-input-actions">
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
                rows="4"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your message..."
                className="message-textarea"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="multi-group-footer">
          <div className="send-summary">
            {selectedGroups.length > 0 && (
              <span>
                Ready to send to {selectedGroups.length} group
                {selectedGroups.length > 1 ? "s" : ""}
              </span>
            )}
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
              onClick={sendMultiGroupMessage}
              disabled={
                (!message.trim() && !file) ||
                selectedGroups.length === 0 ||
                isSending
              }
            >
              {isSending ? (
                <>
                  <div className="spinner"></div>
                  Sending...
                </>
              ) : (
                <>
                  <FaPaperPlane />
                  Send to {selectedGroups.length} Group
                  {selectedGroups.length !== 1 ? "s" : ""}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiGroupMessaging;
