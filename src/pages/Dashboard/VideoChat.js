import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Peer from "simple-peer";
import io from "socket.io-client";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaSync,
  FaDesktop,
  FaRegPaperPlane,
  FaPhone,
  FaPhoneSlash,
  FaUsers,
  FaCommentDots,
  FaSignOutAlt,
} from "react-icons/fa";
import api from "../../api";
import { getSocketUrl } from "../../config/socketConfig";
import { ensureStringId } from "../../utils/objectId";
import "./VideoChat.css";

const extractSessionId = (sessionLike) => {
  if (!sessionLike) return "";

  if (typeof sessionLike !== "object") {
    return ensureStringId(sessionLike) || "";
  }

  const candidates = [
    sessionLike.sessionId,
    sessionLike._id,
    sessionLike.id,
    sessionLike.session?._id,
    sessionLike.session?.sessionId,
    sessionLike.activeSession?._id,
    sessionLike.activeSession?.sessionId,
  ];

  if (sessionLike.$oid || sessionLike.buffer || sessionLike._bsontype || sessionLike.str) {
    candidates.push(sessionLike);
  }

  for (const candidate of candidates) {
    const normalized = ensureStringId(candidate);
    if (normalized) return normalized;
  }

  return "";
};

const normalizeParticipant = (participant) => {
  if (!participant) return participant;

  const userId = participant.userId;
  const normalizedUserId =
    typeof userId === "object"
      ? ensureStringId(userId?._id || userId?.User_id || userId?.id)
      : ensureStringId(userId);

  return {
    ...participant,
    _id: ensureStringId(participant._id) || participant._id,
    joinedAt:
      participant.joinedAt ||
      participant.Participant_joinedAt ||
      participant.createdAt ||
      null,
    userId:
      typeof userId === "object"
        ? {
            ...userId,
            _id: normalizedUserId || userId?._id,
            name: userId?.name || userId?.User_name,
            email: userId?.email || userId?.User_email,
          }
        : {
            _id: normalizedUserId,
            name: participant.name || "Participant",
          },
  };
};

const normalizeUser = (user = {}) => {
  const normalizedId =
    ensureStringId(user._id) ||
    ensureStringId(user.User_id) ||
    ensureStringId(user.id) ||
    "";

  return {
    ...user,
    _id: normalizedId,
    User_id: normalizedId || user.User_id,
    name: user.name || user.User_name,
  };
};

const VideoChat = ({ groupId, onLeave }) => {
  const currentUser = useSelector((state) => state.user.currentUser);
  const navigate = useNavigate();
  const [parsedUser, setParsedUser] = useState({});
  const [inCall, setInCall] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const [peers, setPeers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState("");
  const socketRef = useRef();
  const userVideo = useRef();
  const peersRef = useRef([]);
  const normalizedGroupId = ensureStringId(groupId) || "";
  const currentUserId =
    ensureStringId(parsedUser._id) || ensureStringId(parsedUser.User_id) || "";
  const currentUserName =
    parsedUser.name || parsedUser.User_name || "A participant";

  // Load user information from localStorage or Redux
  useEffect(() => {
    if (currentUser) {
      setParsedUser(normalizeUser(currentUser));
    } else {
      const storedUser = JSON.parse(localStorage.getItem("user") || "{}");
      if (storedUser && (storedUser._id || storedUser.User_id)) {
        setParsedUser(normalizeUser(storedUser));
      }
    }
  }, [currentUser]);

  // Fetch participants when session starts or changes
  const fetchParticipants = useCallback(async () => {
    const activeSessionId = extractSessionId(sessionId);
    if (!activeSessionId) return;

    try {
      const response = await api.get(
        `/videosession/participants/${encodeURIComponent(activeSessionId)}`
      );
      if (response.data.success) {
        const newParticipants = (response.data.participants || []).map(
          normalizeParticipant
        );
        console.log("Fetched participants:", newParticipants.length, "participants");
        setParticipants(newParticipants);
        
        // Update participant count in UI
        console.log(`Updated participant list: ${newParticipants.length} total participants`);
      } else {
        console.error("Failed to fetch participants:", response.data.message);
      }
    } catch (error) {
      console.error("Error fetching participants:", error);
    }
  }, [sessionId]);

  // Initialize socket connection
  const initializeSocket = useCallback(
    (sessionIdentifier) => {
      const activeSessionId = extractSessionId(sessionIdentifier);
      if (!activeSessionId || !currentUserId) {
        setError("Missing video session or user information. Please try again.");
        return;
      }

      // Prevent multiple socket connections
      if (socketRef.current && socketRef.current.connected) {
        console.log("Socket already connected, skipping initialization");
        return;
      }

      // Disconnect existing socket if any and clean up
      if (socketRef.current) {
        console.log("Cleaning up existing socket connection");
        try {
          socketRef.current.off(); // Remove all event listeners
          if (socketRef.current.connected) {
            socketRef.current.disconnect();
          }
        } catch (error) {
          console.error("Error cleaning up socket:", error);
        }
        socketRef.current = null;
      }

      // Clean up existing peers
      peersRef.current.forEach(({ peer }) => {
        if (peer && !peer.destroyed) {
          peer.destroy();
        }
      });
      peersRef.current = [];
      setPeers([]);

      // Get auth token for socket authentication
      const token = localStorage.getItem("token");
      console.log(
        "Initializing socket with token:",
        token ? "Token found" : "No token"
      );

      socketRef.current = io.connect(getSocketUrl("video"), {
        auth: {
          token: token,
        },
        transports: ["websocket", "polling"], // Allow fallback to polling
        timeout: 20000, // 20 second timeout
        forceNew: true, // Force new connection
      });

      // Handle connection errors
      socketRef.current.on("connect_error", (error) => {
        console.error("Socket connection error:", error);
        setError("Failed to connect to video chat server");
      });

      // Handle successful connection
      socketRef.current.on("connect", () => {
        console.log("Video chat socket connected successfully");
        setError(""); // Clear any previous connection errors
      });

      // Handle disconnection
      socketRef.current.on("disconnect", (reason) => {
        console.log("Video chat socket disconnected:", reason);
        if (reason === "io server disconnect") {
          // Server disconnected, try to reconnect
          socketRef.current.connect();
        }
      });

      navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((mediaStream) => {
          setStream(mediaStream);
          if (userVideo.current) {
            userVideo.current.srcObject = mediaStream;
          }

          // Always use joinCall for consistency
          socketRef.current.emit(
            "joinCall",
            {
              sessionId: activeSessionId,
              userId: currentUserId,
              userName: currentUserName,
            },
            (response) => {
              if (response.success) {
                console.log("Successfully joined call:", response);
              } else {
                console.error("Failed to join call:", response.error);
                setError(response.error || "Failed to join video call");
              }
            }
          );

          socketRef.current.on("allUsers", (users) => {
            console.log(
              "All users received:",
              users,
              "Current socket ID:",
              socketRef.current.id
            );

            // Filter out our own socket ID to avoid self-connection
            const otherUsers = users.filter(
              (userId) => userId !== socketRef.current.id
            );
            console.log("Other users (excluding self):", otherUsers);

            // Clear existing peers first
            peersRef.current.forEach(({ peer }) => {
              if (peer && !peer.destroyed) {
                try {
                  peer.destroy();
                } catch (error) {
                  console.error("Error destroying existing peer:", error);
                }
              }
            });
            peersRef.current = [];
            setPeers([]);

            // Only create peers for OTHER users (not ourselves)
            if (otherUsers.length > 0) {
              console.log(`Creating ${otherUsers.length} peer connections...`);
              const newPeers = [];
              
              otherUsers.forEach((userId) => {
                try {
                  const peer = createPeer(
                    userId,
                    socketRef.current.id,
                    mediaStream
                  );
                  if (peer) {
                    peersRef.current.push({ peerID: userId, peer });
                    newPeers.push(peer);
                    console.log(`Created peer connection for user: ${userId}`);
                  }
                } catch (error) {
                  console.error(`Error creating peer for user ${userId}:`, error);
                }
              });
              
              setPeers(newPeers);
              console.log("Successfully created", newPeers.length, "peer connections");
            } else {
              setPeers([]);
              console.log("No other users, no peer connections needed");
            }
          });

          socketRef.current.on("userJoined", ({ signal, callerID }) => {
            console.log("User joined:", callerID, "with signal:", !!signal);
            if (callerID && mediaStream) {
              // Check if peer already exists
              const existingPeer = peersRef.current.find(
                (p) => p.peerID === callerID
              );
              if (existingPeer) {
                console.log("Peer already exists for:", callerID, "- destroying and recreating");
                // Destroy existing peer and create new one
                if (existingPeer.peer && !existingPeer.peer.destroyed) {
                  existingPeer.peer.destroy();
                }
                // Remove from arrays
                peersRef.current = peersRef.current.filter(p => p.peerID !== callerID);
                setPeers(prev => prev.filter(p => p !== existingPeer.peer));
              }

              // Create new peer connection
              const peer = addPeer(signal, callerID, mediaStream);
              if (peer) {
                peersRef.current.push({ peerID: callerID, peer });
                setPeers((prev) => [...prev, peer]);
                console.log("Successfully added peer for user:", callerID);
              } else {
                console.error("Failed to create peer for user:", callerID);
              }
            }
          });

          socketRef.current.on("receivingReturnedSignal", ({ id, signal }) => {
            const item = peersRef.current.find((p) => p.peerID === id);
            if (item && item.peer && !item.peer.destroyed && signal) {
              try {
                item.peer.signal(signal);
              } catch (error) {
                console.error("Error signaling returned signal:", error);
              }
            }
          });

          socketRef.current.on("userLeft", ({ userId, socketId }) => {
            console.log("User left:", { userId, socketId });
            
            // Remove the peer connection for the user who left
            const peerIndex = peersRef.current.findIndex(p => p.peerID === socketId);
            if (peerIndex > -1) {
              const { peer } = peersRef.current[peerIndex];
              if (peer && !peer.destroyed) {
                try {
                  peer.destroy();
                } catch (error) {
                  console.error("Error destroying peer:", error);
                }
              }
              peersRef.current.splice(peerIndex, 1);
              setPeers(prev => prev.filter((_, index) => index !== peerIndex));
              console.log(`Removed peer connection for user ${userId}`);
            }
          });

          socketRef.current.on("updateParticipants", (updatedParticipants) => {
            setParticipants((updatedParticipants || []).map(normalizeParticipant));
          });

          socketRef.current.on("participantJoined", (participantData) => {
            console.log("Participant joined:", participantData);
            fetchParticipants(); // Refresh participant list
            
            // Force a refresh of peer connections to ensure new participant videos are shown
            setTimeout(() => {
              fetchParticipants();
            }, 1000);
          });

          socketRef.current.on("participantLeft", (participantData) => {
            console.log("Participant left:", participantData);
            
            // Remove the peer connection for the user who left
            const peerIndex = peersRef.current.findIndex(p => p.peerID === participantData.socketId);
            if (peerIndex > -1) {
              const { peer } = peersRef.current[peerIndex];
              if (peer && !peer.destroyed) {
                peer.destroy();
              }
              peersRef.current.splice(peerIndex, 1);
              setPeers(prev => prev.filter((_, index) => index !== peerIndex));
            }
            
            fetchParticipants(); // Refresh participant list
          });

          socketRef.current.on("participantCountUpdated", (data) => {
            console.log("Participant count updated:", data);
            fetchParticipants(); // Refresh participant list when count changes
          });

          socketRef.current.on("refreshPeerConnections", (data) => {
            console.log("Refreshing peer connections:", data);
            
            // Clean up existing peer connections
            peersRef.current.forEach(({ peer }) => {
              if (peer && !peer.destroyed) {
                try {
                  peer.destroy();
                } catch (error) {
                  console.error("Error destroying peer during refresh:", error);
                }
              }
            });
            peersRef.current = [];
            setPeers([]);

            // Re-establish peer connections with all users except ourselves
            const otherUsers = data.allUsers.filter(socketId => socketId !== socketRef.current.id);
            console.log("Re-establishing connections with:", otherUsers.length, "users");

            if (otherUsers.length > 0 && mediaStream) {
              const newPeers = [];
              
              otherUsers.forEach((socketId) => {
                try {
                  const peer = createPeer(socketId, socketRef.current.id, mediaStream);
                  if (peer) {
                    peersRef.current.push({ peerID: socketId, peer });
                    newPeers.push(peer);
                    console.log(`Re-created peer connection for socket: ${socketId}`);
                  }
                } catch (error) {
                  console.error(`Error re-creating peer for socket ${socketId}:`, error);
                }
              });
              
              setPeers(newPeers);
              console.log("Successfully re-established", newPeers.length, "peer connections");
            }
          });

          socketRef.current.on("receiveMessage", (msg) => {
            setMessages((prev) => [...prev, msg]);
          });
        })
        .catch((err) => {
          console.error("Error accessing media devices:", err);
          setError(
            "Failed to access camera/microphone. Please check permissions."
          );
        });
    },
    [currentUserId, currentUserName, fetchParticipants]
  );

  // Start a new call
  const startCall = async () => {
    if (!currentUserId) {
      setError("User not authenticated. Please refresh and try again.");
      return;
    }
    if (!normalizedGroupId) {
      setError("No group selected for this video session.");
      return;
    }

    try {
      const { data } = await api.post("/videosession/start", {
        groupId: normalizedGroupId,
        hostUserId: currentUserId,
      });
      const activeSessionId = extractSessionId(data);
      if (!activeSessionId) {
        setError("Could not read the video session id from the server response.");
        return;
      }
      setInCall(true);
      setSessionId(activeSessionId);
      setParticipants([]);
      // Don't call initializeSocket here - let the useEffect handle it
    } catch (error) {
      if (error.response?.status === 409) {
        setError("There is already an ongoing session for this group.");
      } else {
        console.error("Failed to start video session:", error);
        setError("Failed to start video session. Please try again.");
      }
    }
  };

  // Join an existing call
  const joinCall = useCallback(async () => {
    if (!normalizedGroupId) return;

    try {
      const { data } = await api.get(
        `/videosession/get-session?groupId=${encodeURIComponent(normalizedGroupId)}`
      );
      const activeSessionId = extractSessionId(data);
      if (activeSessionId) {
        setInCall(true);
        setSessionId(activeSessionId);
        setParticipants([]);
        // Don't call initializeSocket here - let the useEffect handle it
      } else {
        console.error("No active session found for this group.");
      }
    } catch (error) {
      console.error("Failed to join video session:", error);
    }
  }, [normalizedGroupId]);

  // Socket reconnection and cleanup
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleDisconnect = (reason) => {
      console.log("Socket disconnected:", reason);
      if (socketRef.current) {
        // Attempt to reconnect with exponential backoff
        let attempts = 0;
        const maxAttempts = 5;
        const baseDelay = 1000; // 1 second

        const tryReconnect = () => {
          attempts++;
          if (attempts > maxAttempts) {
            console.error("Max reconnection attempts reached");
            return;
          }

          const delay = Math.min(baseDelay * Math.pow(2, attempts), 30000); // Cap at 30s
          console.log(`Attempting to reconnect in ${delay}ms...`);

          setTimeout(() => {
            if (socketRef.current && !socketRef.current.connected) {
              socketRef.current.connect();
            }
          }, delay);
        };

        if (reason === "io server disconnect") {
          // Immediate reconnect for server-side disconnects
          socketRef.current.connect();
        } else {
          // Delayed reconnect for other disconnects
          tryReconnect();
        }
      }
    };

    socket.on("disconnect", handleDisconnect);

    return () => {
      socket.off("disconnect", handleDisconnect);
    };
  }, []);

  // Check if current user is the host and manage peer connections
  useEffect(() => {
    if (participants.length > 0 && currentUserId) {
      const currentParticipant = participants.find(
        (p) => ensureStringId(p.userId?._id) === currentUserId
      );
      if (currentParticipant) {
        setIsHost(currentParticipant.isHost || false);
      }

      // If there's only 1 participant (yourself), clear any peer connections
      if (participants.length === 1) {
        console.log("Only 1 participant detected, clearing peer connections");
        peersRef.current.forEach(({ peer }) => {
          if (peer && !peer.destroyed) {
            try {
              peer.destroy();
            } catch (error) {
              console.error("Error destroying peer:", error);
            }
          }
        });
        peersRef.current = [];
        setPeers([]);
      }
    }
  }, [participants, currentUserId]);

  const endCall = async () => {
    try {
      const activeSessionId = extractSessionId(sessionId);
      if (!activeSessionId) return;

      // Only hosts can end the entire session
      if (!isHost) {
        setError("Only the host can end the session for everyone.");
        return;
      }

      // Notify the server to end the session
      await api.post("/videosession/end", { sessionId: activeSessionId });

      // Reset states
      setInCall(false);
      setSessionId(null);
      setParticipants([]);
      setMessages([]);

      // Notify other users in the room
      if (socketRef.current) {
        socketRef.current.emit("endCall", { roomId: activeSessionId });
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Clean up all peer connections
      cleanupPeers();

      // Stop the media stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    } catch (error) {
      console.error("Failed to end video session:", error);
      setError("Failed to end video session. Please try again.");
    }
  };

  // Leave session function for non-host participants
  const leaveSession = async () => {
    try {
      const activeSessionId = extractSessionId(sessionId);
      if (!activeSessionId) return;

      // Clean up peers first to ensure clean disconnection
      cleanupPeers();

      // Notify server and other participants
      try {
        await api.post("/videosession/leave", { 
          sessionId: activeSessionId,
          userId: currentUserId 
        });
      } catch (error) {
        console.error("Error notifying server about leave:", error);
        // Continue with cleanup even if server notification fails
      }

      // Notify other users via socket
      if (socketRef.current) {
        try {
          socketRef.current.emit("leaveCall", { 
            sessionId: activeSessionId,
            userId: currentUserId,
            userName: currentUserName
          });
          socketRef.current.disconnect();
        } catch (error) {
          console.error("Error during socket cleanup:", error);
        } finally {
          socketRef.current = null;
        }
      }

      // Stop all media tracks
      if (stream) {
        try {
          stream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              console.error("Error stopping track:", e);
            }
          });
        } catch (error) {
          console.error("Error stopping stream:", error);
        } finally {
          setStream(null);
        }
      }

      // Reset all states and return to group chat
      const resetAndReturn = () => {
        setInCall(false);
        setSessionId(null);
        setParticipants([]);
        setMessages([]);
        setMessage("");
        setIsHost(false);
        setPeers([]);
        setAudioEnabled(true);
        setVideoEnabled(true);
        setScreenSharing(false);
        setShowParticipants(true);
        setShowChat(true);
        setError("");
        
        // Use the onLeave callback to return to group chat
        if (onLeave) {
          onLeave();
        } else {
          // Fallback to dashboard using proper React navigation
          navigate('/dashboard');
        }
      };

      // Small delay to ensure cleanup completes before returning
      setTimeout(resetAndReturn, 100);
    } catch (error) {
      console.error("Failed to leave video session:", error);
      setError("Failed to leave session. Please try again.");
    }
  };

  // Fetch active session on mount
  useEffect(() => {
    if (!normalizedGroupId || inCall) return;

    const checkActiveSession = async () => {
      try {
        const { data } = await api.get(
          `/videosession/get-session?groupId=${encodeURIComponent(normalizedGroupId)}`
        );
        const activeSessionId = extractSessionId(data);
        if (activeSessionId && !inCall) {
          setInCall(true);
          setSessionId(activeSessionId);
          // Don't call joinCall() here as it will be handled by sessionId useEffect
        }
      } catch (error) {
        console.error("Error checking active session:", error);
      }
    };
    checkActiveSession();
  }, [normalizedGroupId, inCall]);

  // Join session when `sessionId` changes
  useEffect(() => {
    const activeSessionId = extractSessionId(sessionId);
    if (activeSessionId && activeSessionId !== sessionId) {
      setSessionId(activeSessionId);
      return;
    }

    if (activeSessionId && currentUserId && !socketRef.current?.connected) {
      console.log("Joining session:", activeSessionId, "for user:", currentUserName);
      api
        .post("/videosession/join-session", { sessionId: activeSessionId })
        .then(() => {
          initializeSocket(activeSessionId);
        })
        .catch((err) => {
          console.error("Failed to join session:", err);
          setError(err.response?.data?.message || "Failed to join session.");
        });
    }
  }, [sessionId, currentUserId, currentUserName, initializeSocket]);

  // Clean up all peer connections
  const cleanupPeers = useCallback(() => {
    console.log("Cleaning up all peer connections");
    peersRef.current.forEach(({ peer, peerID }) => {
      if (peer) {
        try {
          // Send a goodbye message to the peer before destroying
          if (peer.send) {
            try {
              peer.send(JSON.stringify({ type: 'goodbye' }));
            } catch (e) {
              console.log("Could not send goodbye message to peer", e);
            }
          }
          
          // Close data channels
          if (peer._channel) {
            peer._channel.close();
          }
          
          // Destroy the peer connection
          if (typeof peer.destroy === 'function' && !peer.destroyed) {
            peer.destroy();
          }
          
          // Remove from peer connections
          if (socketRef.current && peerID) {
            socketRef.current.emit('peerDisconnected', { peerID });
          }
        } catch (error) {
          console.error("Error cleaning up peer:", error);
        }
      }
    });
    peersRef.current = [];
    setPeers([]);
  }, []);

  // Set up socket and peer cleanup when session changes
  useEffect(() => {
    const activeSessionId = extractSessionId(sessionId);
    if (activeSessionId) {
      fetchParticipants();
      // Set up interval to refresh participants every 10 seconds
      const participantInterval = setInterval(fetchParticipants, 10000);
      
      // Handle beforeunload to ensure cleanup when user closes tab
      const handleBeforeUnload = () => {
        if (socketRef.current) {
          socketRef.current.emit('userDisconnected', { 
            sessionId: activeSessionId,
            userId: currentUserId 
          });
        }
      };
      
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        clearInterval(participantInterval);
        window.removeEventListener('beforeunload', handleBeforeUnload);
        cleanupPeers();
        
        // Clean up socket if still connected
        if (socketRef.current) {
          try {
            if (socketRef.current.connected) {
              socketRef.current.disconnect();
            }
            socketRef.current = null;
          } catch (error) {
            console.error("Error during socket cleanup:", error);
          }
        }
      };
    }
  }, [sessionId, fetchParticipants, cleanupPeers, currentUserId]);

  // Peer management
  const createPeer = (userToSignal, callerID, stream) => {
    console.log(`Creating peer connection: ${callerID} -> ${userToSignal}`);
    
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
    });

    peer.on("signal", (signal) => {
      console.log(`Sending signal from ${callerID} to ${userToSignal}`);
      if (socketRef.current && !peer.destroyed) {
        socketRef.current.emit("sendingSignal", {
          userToSignal,
          callerID,
          signal,
        });
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log(`Received remote stream from peer ${userToSignal}`);
    });

    peer.on("connect", () => {
      console.log(`Peer connection established with ${userToSignal}`);
    });

    peer.on("error", (error) => {
      console.error(`Peer connection error (initiator) with ${userToSignal}:`, error);
    });

    peer.on("close", () => {
      console.log(`Peer connection closed (initiator) with ${userToSignal}`);
    });

    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream) => {
    console.log(`Adding peer connection from ${callerID}, has signal:`, !!incomingSignal);
    
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
        ],
      },
    });

    peer.on("signal", (signal) => {
      console.log(`Returning signal to ${callerID}`);
      if (socketRef.current && !peer.destroyed) {
        socketRef.current.emit("returningSignal", { signal, callerID });
      }
    });

    peer.on("stream", (remoteStream) => {
      console.log(`Received remote stream from ${callerID}`);
    });

    peer.on("connect", () => {
      console.log(`Peer connection established with ${callerID}`);
    });

    peer.on("error", (error) => {
      console.error(`Peer connection error with ${callerID}:`, error);
    });

    peer.on("close", () => {
      console.log(`Peer connection closed with ${callerID}`);
    });

    // Only signal if we have a valid incoming signal and peer is not destroyed
    if (incomingSignal && peer && !peer.destroyed) {
      try {
        // Add a small delay to ensure peer is ready
        setTimeout(() => {
          if (!peer.destroyed) {
            console.log(`Signaling peer with incoming signal from ${callerID}`);
            peer.signal(incomingSignal);
          }
        }, 100);
      } catch (error) {
        console.error(`Error signaling peer from ${callerID}:`, error);
      }
    } else {
      console.warn(`Cannot signal peer from ${callerID}: missing signal or peer destroyed`);
    }

    return peer;
  };

  // Toggle audio, video, and screen sharing
  const toggleAudio = () => {
    stream.getAudioTracks()[0].enabled = !audioEnabled;
    setAudioEnabled(!audioEnabled);
  };

  const toggleVideo = () => {
    stream.getVideoTracks()[0].enabled = !videoEnabled;
    setVideoEnabled(!videoEnabled);
  };

  const toggleScreenSharing = async () => {
    try {
      let newStream;

      if (screenSharing) {
        // Stop screen sharing, return to camera
        newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } else {
        // Start screen sharing
        newStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        // Handle when user stops screen sharing
        newStream.getVideoTracks()[0].onended = () => {
          toggleScreenSharing(); // This will revert to camera
        };
      }

      // Stop all tracks in the current stream
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      // Update the stream
      setStream(newStream);

      // Update the local video element
      if (userVideo.current) {
        userVideo.current.srcObject = newStream;
      }

      // Update all peer connections
      peersRef.current.forEach(({ peer }) => {
        if (peer && !peer.destroyed) {
          const videoTrack = newStream.getVideoTracks()[0];
          const sender = peer
            .getSenders()
            .find((s) => s.track && s.track.kind === "video");
          if (sender && videoTrack) {
            sender.replaceTrack(videoTrack);
          }
        }
      });

      setScreenSharing(!screenSharing);
    } catch (err) {
      console.error("Screen sharing failed:", err);
      // If screen sharing fails, try to revert to camera
      if (!screenSharing) {
        try {
          const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          setStream(cameraStream);
          if (userVideo.current) {
            userVideo.current.srcObject = cameraStream;
          }
        } catch (error) {
          console.error("Failed to revert to camera:", error);
        }
      }
    }
  };

  // useEffect to Fetch Messages
  useEffect(() => {
    const activeSessionId = extractSessionId(sessionId);
    if (activeSessionId) {
      const fetchMessages = async () => {
        try {
          const response = await api.get(
            `/videosession/messages/${encodeURIComponent(activeSessionId)}`
          );
          if (response.data.success) {
            // Set the chat messages to the state if successful
            setMessages(response.data.chatMessages);
          } else {
            console.error("Failed to load messages:", response.data.message);
          }
        } catch (error) {
          // Catch any errors from the API request
          console.error("Error fetching messages:", error);
        }
      };

      fetchMessages();
    }
  }, [sessionId]); // Run effect when sessionId changes

  // sendMessage Function
  const sendMessage = async () => {
    if (!message.trim()) return; // Prevent sending empty messages

    const activeSessionId = extractSessionId(sessionId);
    if (!activeSessionId) {
      setError("Cannot send a message without a valid session.");
      return;
    }

    const newMessage = {
      sessionId: activeSessionId, // Matches the backend sessionId parameter
      message: message.trim(), // Message content
    };

    try {
      // Send the message to the backend
      const response = await api.post("/videosession/send-message", newMessage);

      if (response.data.success) {
        // Update the local state to display the message immediately
        const messageToAdd = {
          _id: response.data.chatMessage._id,
          userId: {
            _id: currentUserId,
            name: currentUserName,
          },
          message: message.trim(),
          timestamp: new Date(),
        };

        setMessages((prevMessages) => [...prevMessages, messageToAdd]);

        // Emit the message to other users in the room via Socket.IO
        if (socketRef.current) {
          socketRef.current.emit("sendMessage", {
            sessionId: activeSessionId,
            userId: currentUserId,
            userName: currentUserName,
            message: message.trim(),
            timestamp: new Date(),
          });
        }

        setMessage(""); // Clear the input field
      } else {
        console.error("Failed to send message:", response.data.message);
        setError("Failed to send message. Please try again.");
      }
    } catch (error) {
      console.error(
        "Failed to send message:",
        error.response?.data || error.message
      );
      setError("Failed to send message. Please try again.");
    }
  };

  return (
    <div className="video-chat-container">
      {/* Main Content Area */}
      <div
        className={`video-main-content ${
          showParticipants && showChat && inCall
            ? "both-open"
            : showParticipants && inCall
            ? "participants-open"
            : showChat && inCall
            ? "chat-open"
            : ""
        }`}
      >
        {/* Error Display */}
        {error && (
          <div className="error-banner">
            <p>{error}</p>
            <button onClick={() => setError("")} title="Dismiss Error">
              Dismiss
            </button>
          </div>
        )}

        {inCall && (
          <div className="video-area">
            {/* Your own video - always shown */}
            <div className="video-container">
              <video
                muted
                ref={userVideo}
                autoPlay
                playsInline
                className="user-video"
              />
              <div className="video-label">You ({currentUserName || 'You'})</div>
            </div>

            {/* Other participants' videos */}
            {peers
              .filter(peer => peer && !peer.destroyed)
              .map((peer, index) => {
                // Find the corresponding participant for this peer
                const peerRef = peersRef.current.find(p => p.peer === peer);
                const participantName = peerRef ? 
                  participants.find(p => p.socketId === peerRef.peerID)?.userId?.name || 
                  participants.find(p => p.userId?._id === peerRef.userId)?.userId?.name ||
                  'Participant' : 'Participant';
                
                return (
                  <div key={`peer-${peerRef?.peerID || index}`} className="video-container">
                    <Video peer={peer} />
                    <div className="video-label">{participantName}</div>
                  </div>
                );
              })}

            {/* Show placeholder videos for participants without peer connections */}
            {participants
              .filter(p => ensureStringId(p.userId?._id) !== currentUserId) // Exclude current user
              .filter(p => !peersRef.current.some(peer => 
                peer.peerID === p.socketId || 
                ensureStringId(peer.userId) === ensureStringId(p.userId?._id)
              ))
              .map((participant, index) => (
                <div key={`placeholder-${participant._id || index}`} className="video-container">
                  <div className="video-placeholder">
                    <div className="participant-avatar-large">
                      {participant.userId?.name?.charAt(0).toUpperCase() || 'P'}
                    </div>
                    <p>Connecting to {participant.userId?.name || 'Participant'}...</p>
                  </div>
                  <div className="video-label">{participant.userId?.name || 'Participant'}</div>
                </div>
              ))}

            {/* Show message when no other participants */}
            {peers.length === 0 && participants.length <= 1 && (
              <div className="no-participants-message">
                <p>Waiting for others to join...</p>
                <p>Share this session link with others to invite them</p>
              </div>
            )}
          </div>
        )}

        <div className="controls">
          {inCall ? (
            <>
              {isHost ? (
                <button
                  onClick={endCall}
                  title="End Call (Host)"
                  className="danger"
                >
                  <FaPhoneSlash />
                </button>
              ) : (
                <button
                  onClick={leaveSession}
                  title="Leave Session"
                  className="warning"
                >
                  <FaSignOutAlt />
                </button>
              )}

              <button
                onClick={toggleAudio}
                title={audioEnabled ? "Mute Audio" : "Unmute Audio"}
              >
                {audioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
              </button>
              <button
                onClick={toggleVideo}
                title={videoEnabled ? "Disable Video" : "Enable Video"}
              >
                {videoEnabled ? <FaVideo /> : <FaVideoSlash />}
              </button>
              <button
                onClick={toggleScreenSharing}
                title={screenSharing ? "Stop Screen Share" : "Share Screen"}
              >
                <FaDesktop />
              </button>
              <button
                onClick={() => navigator.mediaDevices.enumerateDevices()}
                title="Switch Camera"
              >
                <FaSync />
              </button>
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                title={
                  showParticipants ? "Hide Participants" : "Show Participants"
                }
              >
                <FaUsers />
              </button>
              <button
                onClick={() => setShowChat(!showChat)}
                title={showChat ? "Hide Chat" : "Show Chat"}
              >
                <FaCommentDots />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={startCall}
                disabled={inCall}
                title={inCall ? "Session already active" : "Start Call"}
              >
                <FaPhone />
              </button>
              <button onClick={joinCall} title="Join Call">
                <FaPhone />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sidebars */}
      {showParticipants && inCall && (
        <UserList
          participants={participants}
          onClose={() => setShowParticipants(false)}
        />
      )}
      {showChat && inCall && (
        <ChatBox
          messages={messages}
          message={message}
          setMessage={setMessage}
          sendMessage={sendMessage}
          currentUserId={currentUserId}
          onClose={() => setShowChat(false)}
        />
      )}
    </div>
  );
};

const Video = ({ peer }) => {
  const ref = useRef();
  
  useEffect(() => {
    if (!peer) {
      console.warn("Video component received null peer");
      return;
    }
    
    const handleStream = (stream) => {
      console.log("Video component received stream:", stream.id);
      if (ref.current) {
        ref.current.srcObject = stream;
        // Ensure video plays
        ref.current.play().catch(e => {
          console.error("Error playing video:", e);
        });
      }
    };
    
    // Check if peer already has a stream
    if (peer.streams && peer.streams.length > 0) {
      console.log("Peer already has stream, setting immediately");
      handleStream(peer.streams[0]);
    }
    
    peer.on("stream", handleStream);
    
    // Clean up
    return () => {
      if (peer.off) {
        peer.off("stream", handleStream);
      } else if (peer.removeListener) {
        peer.removeListener("stream", handleStream);
      }
    };
  }, [peer]);
  
  // Handle ref cleanup to avoid stale ref in cleanup
  useEffect(() => {
    const videoRef = ref.current;
    return () => {
      if (videoRef) {
        videoRef.srcObject = null;
      }
    };
  }, []);
  
  // Add error handling for the video element
  const handleVideoError = (e) => {
    console.error("Video element error:", e);
  };
  
  const handleLoadedMetadata = () => {
    console.log("Video metadata loaded successfully");
  };
  
  return (
    <video 
      playsInline 
      autoPlay 
      muted={false} // Don't mute other participants' videos
      ref={ref} 
      onError={handleVideoError}
      onLoadedMetadata={handleLoadedMetadata}
      className="participant-video"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
};

const ChatBox = ({
  messages,
  message,
  setMessage,
  sendMessage,
  currentUserId,
  onClose,
}) => (
  <div className="video-chat-area">
    <div className="chat-header">
      <h4>
        <FaCommentDots /> Chat
      </h4>
      <button
        className="video-sidebar-close-btn"
        onClick={onClose}
        title="Close Chat"
      >
        ×
      </button>
    </div>
    <div className="video-chat-messages">
      {messages.map((msg, index) => {
        const isMyMessage =
          ensureStringId(msg.userId?._id) === currentUserId ||
          msg.userId?.name === "You";
        return (
          <div
            key={msg._id || index}
            className={`video-message ${
              isMyMessage ? "video-my-message" : "video-other-message"
            }`}
          >
            <span className="video-message-sender">
              {isMyMessage ? "You" : msg.userId?.name || "Unknown"}
            </span>
            <p className="video-message-text">{msg.message || ""}</p>
          </div>
        );
      })}
    </div>
    <div className="video-chat-input">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type a message..."
        aria-label="Type a message"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        }}
      />
      <button
        className="video-send-button"
        onClick={sendMessage}
        title="Send Message"
        disabled={!message.trim()}
      >
        <FaRegPaperPlane />
      </button>
    </div>
  </div>
);

const UserList = ({ participants, onClose }) => {
  const getParticipantInitial = (name) => {
    return name ? name.charAt(0).toUpperCase() : "?";
  };

  const formatJoinTime = (joinedAt) => {
    if (!joinedAt) return "Just now";
    const date = new Date(joinedAt);
    if (Number.isNaN(date.getTime())) return "Just now";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Filter active participants only
  const activeParticipants = participants?.filter(p => 
    p.status === 'active' || p.isOnline !== false
  ) || [];

  return (
    <div className="video-user-list">
      <div className="video-sidebar-header">
        <h4>
          <FaUsers /> Participants ({activeParticipants.length})
        </h4>
        <button
          className="video-sidebar-close-btn"
          onClick={onClose}
          title="Close Participants"
        >
          ×
        </button>
      </div>

      {activeParticipants.length > 0 ? (
        <ul>
          {activeParticipants.map((participant, index) => (
            <li
              key={participant._id || `participant-${index}`}
              className="video-participant-item"
            >
              <div className="video-participant-avatar">
                {getParticipantInitial(participant.userId?.name)}
              </div>
              <div className="video-participant-info">
                <div className="video-participant-name">
                  {participant.userId?.name || "Unknown User"}
                  {participant.isHost && (
                    <span className="video-host-badge">HOST</span>
                  )}
                </div>
                <div className="video-participant-details">
                  <span className="video-join-time">
                    Joined: {formatJoinTime(participant.joinedAt)}
                  </span>
                  <span
                    className={`video-status-indicator ${
                      participant.isOnline !== false ? "online" : "offline"
                    }`}
                  >
                    {participant.isOnline !== false ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="video-no-participants">
          <p>Waiting for others to join...</p>
          <p>Share this session link with others to invite them</p>
        </div>
      )}
    </div>
  );
};

export default VideoChat;
