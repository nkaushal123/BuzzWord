import React, { useState, useEffect } from 'react';
import { GameBoard, GameState, CommsMessage } from '../../types';
import { useComms } from '../../services/comms';
import { soundService } from '../../services/sound';
import QRCode from 'qrcode';
import { SpectatorRenderer } from './SpectatorRenderer';

interface SpectatorViewProps {
  lobbyCode: string;
}

export const SpectatorView: React.FC<SpectatorViewProps> = ({ lobbyCode }) => {
  const [board, setBoard] = useState<GameBoard | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [dataReceived, setDataReceived] = useState({ board: false, state: false });
  
  // Connect as SPECTATOR
  const { sendMessage, isConnected, connectionType } = useComms(lobbyCode, 'SPECTATOR', (msg: CommsMessage) => {
      if (msg.type === 'HOST_SYNC') {
          setGameState(msg.payload);
          setDataReceived(prev => ({ ...prev, state: true }));
      }
      if (msg.type === 'BOARD_SYNC') {
          setBoard(msg.payload);
          setDataReceived(prev => ({ ...prev, board: true }));
      }
      if (msg.type === 'BUZZ') {
          soundService.play('BUZZ');
      }
      if (msg.type === 'RESULT_EVENT') {
          if (msg.payload.correct) soundService.play('CORRECT');
          else soundService.play('WRONG');
      }
      if (msg.type === 'TIME_SYNC') {
          setGameState(prev => prev ? { ...prev, timer: msg.payload.timer, timerMode: msg.payload.timerMode } : null);
      }
  });

  // Request Data
  useEffect(() => {
      if (isConnected) {
          sendMessage({ type: 'SPECTATOR_JOIN', payload: null });
          const interval = setInterval(() => {
             if (!dataReceived.board || !dataReceived.state) {
                 console.log("Retrying data request...");
                 sendMessage({ type: 'SPECTATOR_JOIN', payload: null });
             } else {
                 clearInterval(interval);
             }
          }, 1000);
          return () => clearInterval(interval);
      }
  }, [isConnected, sendMessage, dataReceived]);

  // Generate QR
  useEffect(() => {
    try {
        if (lobbyCode) {
            const url = `${window.location.origin}?code=${lobbyCode}`;
            QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
                .then(setQrCodeDataUrl);
        }
    } catch (e) { console.error(e); }
  }, [lobbyCode]);

  // Determine status message for renderer
  let statusMessage = "Searching for Host...";
  if (isConnected) statusMessage = "Connected. Waiting for Data...";
  if (dataReceived.state && dataReceived.board) statusMessage = "Ready";

  return (
    <SpectatorRenderer 
        gameState={gameState}
        board={board}
        lobbyCode={lobbyCode}
        qrCodeDataUrl={qrCodeDataUrl}
        isConnected={isConnected}
        statusMessage={statusMessage}
    />
  );
};