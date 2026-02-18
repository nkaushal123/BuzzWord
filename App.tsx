import React, { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Dashboard } from './components/Host/Dashboard';
import { BoardEditor } from './components/Editor/BoardEditor';
import { HostGameView } from './components/Host/HostGameView';
import { PlayerScreen } from './components/Player/PlayerScreen';
import { AuthScreen } from './components/Auth/AuthScreen';
import { StatsScreen } from './components/Stats/StatsScreen';
import { Help } from './components/Help';
import { GameBoard, User } from './types';
import { AuthService } from './services/auth';

type View = 'WELCOME' | 'AUTH' | 'STATS' | 'DASHBOARD' | 'EDITOR' | 'HOST_GAME' | 'PLAYER' | 'HELP';

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

  const handleRoleSelect = (role: 'HOST' | 'PLAYER' | 'EDITOR' | 'HELP') => {
    if (role === 'HOST') {
      setView('DASHBOARD');
    } else if (role === 'EDITOR') {
      setView('DASHBOARD'); 
    } else if (role === 'HELP') {
      setView('HELP');
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
            onBack={() => setView('WELCOME')}
          />
      )}

      {view === 'STATS' && (
          <StatsScreen onBack={() => setView('WELCOME')} />
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