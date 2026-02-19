import { useEffect, useRef, useState, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { CommsMessage } from '../types';

// Prefix to ensure our peer IDs don't collide with other PeerJS users easily
const APP_PREFIX = 'buzzword-trivia-v1-';

export const useComms = (
  lobbyCode: string, 
  role: 'HOST' | 'PLAYER' | 'SPECTATOR',
  onMessage: (msg: CommsMessage) => void
) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // For Host: list of players
  const hostConnRef = useRef<DataConnection | null>(null); // For Player: connection to host
  
  // Local Broadcast Channel for same-browser communication (Host <-> TV View)
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [connectionType, setConnectionType] = useState<'NONE' | 'LOCAL' | 'PEER'>('NONE');

  // 1. Store the latest onMessage handler in a ref to avoid stale closures
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (!lobbyCode) return;

    // --- 1. SETUP BROADCAST CHANNEL (Local Tab Sync) ---
    // This allows the Host and Spectator (TV View) to talk instantly if on the same computer
    try {
        const channelName = `${APP_PREFIX}local-${lobbyCode.toUpperCase()}`;
        const channel = new BroadcastChannel(channelName);
        broadcastChannelRef.current = channel;

        channel.onmessage = (event) => {
            if (event.data && onMessageRef.current) {
                // If we receive data locally, we are definitely connected
                if (!isConnected) {
                    setIsConnected(true);
                    setConnectionType('LOCAL');
                }
                onMessageRef.current(event.data as CommsMessage);
            }
        };

        // If I am a Spectator, announce myself locally immediately
        if (role === 'SPECTATOR') {
            setIsConnected(true); // Assume local works immediately
            setConnectionType('LOCAL');
            // Slight delay to ensure Host channel is bound
            setTimeout(() => {
                channel.postMessage({ type: 'SPECTATOR_JOIN', payload: null });
            }, 500);
        }

    } catch (e) {
        console.warn("BroadcastChannel not supported", e);
    }

    // --- 2. SETUP PEERJS (Remote Device Sync) ---
    // HOST gets deterministic ID, Player/Spectator gets random
    const peerId = role === 'HOST' 
      ? `${APP_PREFIX}${lobbyCode.toUpperCase()}` 
      : undefined; 

    const peer = new Peer(peerId, {
      debug: 1
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      
      if (role === 'HOST') {
        setIsConnected(true);
        // Host is always "connected" to itself
        if (connectionType === 'NONE') setConnectionType('PEER');
      }

      if (role === 'PLAYER' || role === 'SPECTATOR') {
        // Connect to Host via WebRTC
        const hostId = `${APP_PREFIX}${lobbyCode.toUpperCase()}`;
        const conn = peer.connect(hostId, { reliable: true });
        
        conn.on('open', () => {
          console.log("Connected to Host via PeerJS");
          hostConnRef.current = conn;
          setIsConnected(true);
          setConnectionType('PEER');
        });

        conn.on('data', (data: any) => {
          if (onMessageRef.current) {
            onMessageRef.current(data as CommsMessage);
          }
        });

        conn.on('close', () => {
            console.log("Connection to host closed");
            hostConnRef.current = null;
            // Only set disconnected if we aren't using local channel
            if (!broadcastChannelRef.current) setIsConnected(false);
        });
      }
    });

    peer.on('connection', (conn) => {
      if (role === 'HOST') {
        conn.on('open', () => {
          if (!connectionsRef.current.find(c => c.peer === conn.peer)) {
             connectionsRef.current.push(conn);
          }
        });

        conn.on('data', (data: any) => {
          if (onMessageRef.current) {
            onMessageRef.current(data as CommsMessage);
          }
        });

        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
        });
      }
    });

    peer.on('error', (err) => {
      console.error("PeerJS Error:", err);
      if (err.type === 'unavailable-id' && role === 'HOST') {
         alert("Lobby ID collision. Please restart to generate a new code.");
      }
    });

    return () => {
      // Cleanup
      if (broadcastChannelRef.current) {
          broadcastChannelRef.current.close();
      }
      if ((role === 'PLAYER' || role === 'SPECTATOR') && hostConnRef.current) {
        hostConnRef.current.close();
      }
      if (role === 'HOST') {
        connectionsRef.current.forEach(c => c.close());
        connectionsRef.current = [];
      }
      peer.destroy();
      peerRef.current = null;
    };
  }, [lobbyCode, role]); 

  // Multi-transport send function
  const sendMessage = useCallback((msg: CommsMessage) => {
    // 1. Send via BroadcastChannel (Local Tabs)
    if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage(msg);
    }

    // 2. Send via PeerJS (Remote Devices)
    if (role === 'HOST') {
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(msg);
      });
    } else {
      if (hostConnRef.current && hostConnRef.current.open) {
        hostConnRef.current.send(msg);
      }
    }
  }, [role]);

  return { sendMessage, isConnected, connectionType };
};