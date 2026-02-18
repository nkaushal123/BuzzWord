import { useEffect, useRef, useState } from 'react';
import { Peer, DataConnection } from 'peerjs';
import { CommsMessage } from '../types';

// Prefix to ensure our peer IDs don't collide with other PeerJS users easily
const APP_PREFIX = 'buzzword-trivia-v1-';

export const useComms = (
  lobbyCode: string, 
  role: 'HOST' | 'PLAYER',
  onMessage: (msg: CommsMessage) => void
) => {
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<DataConnection[]>([]); // For Host: list of players
  const hostConnRef = useRef<DataConnection | null>(null); // For Player: connection to host
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!lobbyCode) return;

    const peerId = role === 'HOST' 
      ? `${APP_PREFIX}${lobbyCode.toUpperCase()}` 
      : undefined; // Players get auto-generated ID

    // Initialize Peer
    const peer = new Peer(peerId, {
      debug: 1
    });
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('My Peer ID is: ' + id);
      setIsConnected(true);

      if (role === 'PLAYER') {
        // Connect to Host
        const hostId = `${APP_PREFIX}${lobbyCode.toUpperCase()}`;
        const conn = peer.connect(hostId, { reliable: true });
        
        conn.on('open', () => {
          console.log("Connected to Host");
          hostConnRef.current = conn;
        });

        conn.on('data', (data: any) => {
          onMessage(data as CommsMessage);
        });

        conn.on('close', () => {
            console.log("Connection to host closed");
            hostConnRef.current = null;
        });

        conn.on('error', (err) => {
            console.error("Connection error:", err);
        });
      }
    });

    peer.on('connection', (conn) => {
      // Logic for HOST receiving connections
      if (role === 'HOST') {
        console.log("Player connecting...", conn.peer);
        
        conn.on('open', () => {
          connectionsRef.current.push(conn);
        });

        conn.on('data', (data: any) => {
          onMessage(data as CommsMessage);
        });

        conn.on('close', () => {
          connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
        });
      }
    });

    peer.on('error', (err) => {
      console.error("PeerJS Error:", err);
      // Handle ID taken error for host (rare if code is random enough)
      if (err.type === 'unavailable-id' && role === 'HOST') {
         alert("Lobby ID collision. Please restart to generate a new code.");
      }
    });

    return () => {
      // Cleanup
      if (role === 'PLAYER' && hostConnRef.current) {
        hostConnRef.current.close();
      }
      if (role === 'HOST') {
        connectionsRef.current.forEach(c => c.close());
        connectionsRef.current = [];
      }
      peer.destroy();
      peerRef.current = null;
      setIsConnected(false);
    };
  }, [lobbyCode, role]); // Removed onMessage from dep array to avoid reconnect loops

  const sendMessage = (msg: CommsMessage) => {
    if (role === 'HOST') {
      // Broadcast to all
      connectionsRef.current.forEach(conn => {
        if (conn.open) conn.send(msg);
      });
    } else {
      // Send to Host
      if (hostConnRef.current && hostConnRef.current.open) {
        hostConnRef.current.send(msg);
      } else {
          console.warn("Cannot send, not connected to host");
      }
    }
  };

  return { sendMessage, isConnected };
};
