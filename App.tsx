import React, { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Dashboard } from './components/Host/Dashboard';
import { BoardEditor } from './components/Editor/BoardEditor';
import { HostGameView } from './components/Host/HostGameView';
import { PlayerScreen } from './components/Player/PlayerScreen';
import { AuthScreen } from './components/Auth/AuthScreen';
import { StatsScreen } from './components/Stats/StatsScreen';
import { Help } from './components/Help';
import { DeviceSync } from './components/Sync/DeviceSync';
import { DatabaseConfig } from './components/Config/DatabaseConfig';
import { GameBoard, User } from './types';
import { AuthService } from './services/auth';
import { DatabaseService } from './services/db';

type View = 'WELCOME' | 'AUTH' | 'STATS' | 'DASHBOARD' | 'EDITOR' | 'HOST_GAME' | 'PLAYER' | 'HELP' | 'SYNC' | 'DB_CONFIG';

function App() {
  const [view, setView] = useState<View>('WELCOME');
  const [board, setBoard] = useState<GameBoard | null>(null);
  const [lobbyCode, setLobbyCode] = useState<string>('');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Check for deep link codes and existing session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    const savedUser = AuthService.getCurrentUser();
    
    if (savedUser) setCurrentUser(savedUser);

    // Initial Database Check
    if (!DatabaseService.isConnected()) {
        // If not connected, force DB Config unless they are just joining a lobby (Players might not need DB if game state is purely P2P, but for stats they do)
        // However, the user requested "store all logins and stats... basically a big database".
        // So we should encourage DB connection.
        // We won't block 'PLAYER' view entirely if they have a code, but for HOSTing/STATS, we need DB.
        if (!codeParam) {
            setView('DB_CONFIG');
        }
    }

    if (codeParam) {
      setLobbyCode(codeParam.toUpperCase());
      // If they have a code, go straight to Auth (or Player if logged in)
      if (savedUser) {
        setView('PLAYER');
      } else {
        setView('AUTH');
      }
    }
  }, []);

  const handleRoleSelect = (role: 'HOST' | 'PLAYER' | 'EDITOR' | 'HELP' | 'DB_CONFIG') => {
    if (!DatabaseService.isConnected() && (role === 'HOST' || role === 'EDITOR')) {
        alert("You must connect to a database to Host or Create games.");
        setView('DB_CONFIG');
        return;
    }

    if (role === 'HOST') {
      setView('DASHBOARD');
    } else if (role === 'EDITOR') {
      setView('DASHBOARD'); 
    } else if (role === 'HELP') {
      setView('HELP');
    } else if (role === 'DB_CONFIG') {
      setView('DB_CONFIG');
    } else {
      // For Players, check auth first
      if (currentUser) {
        setView('PLAYER');
      } else {
        setView('AUTH');
      }
    }
  };

  const handleEditBoard = (boardToEdit: GameBoard) => {
    setBoard(boardToEdit);
    setView('EDITOR');
  };

  const handleHostGame = (boardToHost: GameBoard) => {
    setBoard(boardToHost);
    const code = Math.random().toString(36).substr(2, 4).toUpperCase();
    setLobbyCode(code);
    setView('HOST_GAME');
  };

  const handleEditorSave = () => {
    setView('DASHBOARD');
    setBoard(null);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {view === 'WELCOME' && (
        <>
            <Welcome onSelectRole={handleRoleSelect} />
            {/* Corner Stats Button */}
            <div className="absolute top-4 right-4 flex gap-4">
                {currentUser ? (
                    <button 
                        onClick={() => setView('STATS')}
                        className="text-jeopardy-gold font-bold hover:text-white transition-colors"
                    >
                        {currentUser.username}
                    </button>
                ) : (
                    <button 
                        onClick={() => setView('AUTH')}
                        className="text-blue-300 hover:text-white transition-colors"
                    >
                        Sign In
                    </button>
                )}
            </div>
        </>
      )}
      
      {view === 'AUTH' && (
          <AuthScreen 
            onSuccess={(user) => {
                setCurrentUser(user);
                // If they had a lobby code, send them there, else Welcome
                if (lobbyCode) {
                    setView('PLAYER');
                } else {
                    setView('WELCOME');
                }
            }}
            onGuest={() => {
                if (lobbyCode) {
                    setView('PLAYER');
                } else {
                    setView('WELCOME');
                }
            }}
            onSync={() => setView('SYNC')} 
            onBack={() => setView('WELCOME')}
          />
      )}

      {view === 'STATS' && (
          <StatsScreen 
            onBack={() => setView('WELCOME')} 
            onSync={() => setView('SYNC')}
          />
      )}
      
      {view === 'SYNC' && (
          <DeviceSync 
            onBack={() => setView('STATS')} 
            onSuccess={() => {
                // Reload user from storage as it changed
                const updatedUser = AuthService.getCurrentUser();
                setCurrentUser(updatedUser);
                setView('WELCOME');
            }}
          />
      )}

      {view === 'DB_CONFIG' && (
        <DatabaseConfig onBack={() => setView('WELCOME')} />
      )}
      
      {view === 'HELP' && <Help onBack={() => setView('WELCOME')} />}

      {view === 'DASHBOARD' && (
        <Dashboard 
          onPlay={handleHostGame}
          onEdit={handleEditBoard}
          onBack={() => setView('WELCOME')}
        />
      )}

      {view === 'EDITOR' && board && (
        <BoardEditor 
          initialBoard={board}
          onSave={handleEditorSave}
          onCancel={() => setView('DASHBOARD')}
        />
      )}

      {view === 'HOST_GAME' && board && (
        <HostGameView 
          board={board} 
          lobbyCode={lobbyCode}
          onExit={() => setView('DASHBOARD')}
        />
      )}

      {view === 'PLAYER' && (
        <PlayerScreen 
            initialCode={lobbyCode} 
            user={currentUser}
            onBack={() => {
                setLobbyCode(''); 
                setView('WELCOME');
            }}
            onViewStats={() => setView('STATS')}
        />
      )}
    </div>
  );
}

export default App;