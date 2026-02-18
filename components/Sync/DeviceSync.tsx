import React, { useState, useEffect } from 'react';
import { useComms } from '../../services/comms';
import { AuthService } from '../../services/auth';
import { getBoards, saveSyncedBoards } from '../../services/storage';
import { User, CommsMessage } from '../../types';
import { Smartphone, UploadCloud, DownloadCloud, ArrowRight, ArrowLeft, Check, X, Loader } from 'lucide-react';

interface DeviceSyncProps {
  onBack: () => void;
  onSuccess: () => void;
}

export const DeviceSync: React.FC<DeviceSyncProps> = ({ onBack, onSuccess }) => {
  const [mode, setMode] = useState<'SEND' | 'RECEIVE' | null>(null);
  const [syncCode, setSyncCode] = useState('');
  const [status, setStatus] = useState('IDLE'); // IDLE, CONNECTING, TRANSFERRING, DONE, ERROR
  
  // SEND MODE (HOST)
  const [generatedCode, setGeneratedCode] = useState('');
  
  // Initialize code on mount if sending
  useEffect(() => {
    if (mode === 'SEND') {
        setGeneratedCode(Math.random().toString(36).substr(2, 4).toUpperCase());
    }
  }, [mode]);

  // Hook for SENDER (HOST)
  const hostComms = useComms(generatedCode, 'HOST', (msg: CommsMessage) => {
      // If we receive a request, we send data
      if (msg.type === 'SYNC_REQUEST') {
          setStatus('TRANSFERRING');
          const currentUser = AuthService.getCurrentUser();
          if (!currentUser) return;
          
          const userBoards = getBoards(currentUser.username);
          
          hostComms.sendMessage({
              type: 'SYNC_DATA',
              payload: {
                  user: currentUser,
                  boards: userBoards
              }
          });
          setStatus('DONE');
      }
  });

  // Hook for RECEIVER (PLAYER)
  const receiverComms = useComms(syncCode, 'PLAYER', (msg: CommsMessage) => {
      if (msg.type === 'SYNC_DATA') {
          setStatus('TRANSFERRING');
          try {
              // 1. Save User Profile (Merge/Overwrite stats)
              // We rely on AuthService.register/login logic but forcefully update local storage
              // Ideally we'd have a specific importUser method, but for now we manually save
              localStorage.setItem('buzzword_current_user', JSON.stringify(msg.payload.user));
              
              // Also update the users list
              const users = JSON.parse(localStorage.getItem('buzzword_users') || '[]');
              const existingIdx = users.findIndex((u: User) => u.username === msg.payload.user.username);
              if (existingIdx >= 0) {
                  users[existingIdx] = msg.payload.user;
              } else {
                  users.push(msg.payload.user);
              }
              localStorage.setItem('buzzword_users', JSON.stringify(users));

              // 2. Save Boards
              saveSyncedBoards(msg.payload.boards);

              setStatus('DONE');
              setTimeout(onSuccess, 1500); // Redirect after success
          } catch (e) {
              console.error(e);
              setStatus('ERROR');
          }
      }
  });

  const handleStartReceive = () => {
      if (syncCode.length !== 4) return;
      setStatus('CONNECTING');
      // Give connection a moment to establish then request sync
      setTimeout(() => {
          receiverComms.sendMessage({ type: 'SYNC_REQUEST', payload: null });
      }, 1500);
  };

  if (!mode) {
      return (
          <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
              <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-2">
                  <X size={20} /> Cancel
              </button>

              <h1 className="text-3xl font-display text-jeopardy-gold mb-2">Sync Devices</h1>
              <p className="text-gray-400 mb-12 text-center max-w-md">
                  Transfer your profile and game boards between devices securely using a peer-to-peer connection.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
                  <button 
                    onClick={() => setMode('SEND')}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl p-8 flex flex-col items-center gap-4 transition-all hover:scale-105"
                  >
                      <div className="w-16 h-16 bg-blue-900 rounded-full flex items-center justify-center text-blue-300">
                          <UploadCloud size={32} />
                      </div>
                      <div className="text-center">
                          <h3 className="text-xl font-bold mb-1">Export Data</h3>
                          <p className="text-sm text-gray-400">Send from this device (Laptop/PC)</p>
                      </div>
                  </button>

                  <button 
                    onClick={() => setMode('RECEIVE')}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl p-8 flex flex-col items-center gap-4 transition-all hover:scale-105"
                  >
                      <div className="w-16 h-16 bg-green-900 rounded-full flex items-center justify-center text-green-300">
                          <DownloadCloud size={32} />
                      </div>
                      <div className="text-center">
                          <h3 className="text-xl font-bold mb-1">Import Data</h3>
                          <p className="text-sm text-gray-400">Receive on this device (Phone/Tablet)</p>
                      </div>
                  </button>
              </div>
          </div>
      );
  }

  return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
          <button onClick={() => setMode(null)} className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-2">
              <ArrowLeft size={20} /> Back
          </button>

          {mode === 'SEND' ? (
              <div className="text-center">
                  <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(37,99,235,0.5)]">
                      <Smartphone className="text-white w-10 h-10 animate-pulse" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Ready to Export</h2>
                  <p className="text-gray-400 mb-8">Enter this code on your other device:</p>
                  
                  <div className="text-6xl font-mono font-bold text-white tracking-widest bg-gray-900 p-6 rounded-xl border border-blue-500 mb-8">
                      {generatedCode}
                  </div>

                  {status === 'TRANSFERRING' && <p className="text-green-400 animate-pulse">Sending data...</p>}
                  {status === 'DONE' && <p className="text-green-500 font-bold flex items-center justify-center gap-2"><Check /> Transfer Complete!</p>}
                  {status === 'IDLE' && <p className="text-sm text-gray-500">Waiting for connection...</p>}
              </div>
          ) : (
              <div className="text-center w-full max-w-md">
                   <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(22,163,74,0.5)]">
                      <DownloadCloud className="text-white w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold mb-4">Import Data</h2>
                  <p className="text-gray-400 mb-8">Enter the code from your source device:</p>

                  <input 
                      type="text" 
                      value={syncCode}
                      onChange={(e) => setSyncCode(e.target.value.toUpperCase())}
                      maxLength={4}
                      className="w-full text-center text-4xl font-mono bg-gray-900 border border-green-500 rounded-xl p-4 text-white outline-none focus:ring-2 focus:ring-green-400 mb-8 uppercase"
                      placeholder="CODE"
                  />

                  {status === 'IDLE' && (
                      <button 
                        onClick={handleStartReceive}
                        disabled={syncCode.length !== 4}
                        className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
                      >
                          Start Sync
                      </button>
                  )}

                  {status === 'CONNECTING' && <p className="text-yellow-400 animate-pulse flex items-center justify-center gap-2"><Loader className="animate-spin" /> Connecting...</p>}
                  {status === 'TRANSFERRING' && <p className="text-blue-400 animate-pulse">Receiving data...</p>}
                  {status === 'DONE' && <p className="text-green-500 font-bold flex items-center justify-center gap-2"><Check /> Sync Complete!</p>}
              </div>
          )}
      </div>
  );
};