import React, { useState, useEffect } from 'react';
import { Welcome } from './components/Welcome';
import { Dashboard } from './components/Host/Dashboard';
import { BoardEditor } from './components/Editor/BoardEditor';
import { HostGameView } from './components/Host/HostGameView';
import { PlayerScreen } from './components/Player/PlayerScreen';
import { Help } from './components/Help';
import { GameBoard } from './types';

type View = 'WELCOME' | 'DASHBOARD' | 'EDITOR' | 'HOST_GAME' | 'PLAYER' | 'HELP';

function App() {
  const [view, setView] = useState<View>('WELCOME');
  const [board, setBoard] = useState<GameBoard | null>(null);
  const [lobbyCode, setLobbyCode] = useState<string>('');

  // Check for deep link codes (e.g. ?code=ABCD)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam) {
      setLobbyCode(codeParam.toUpperCase());
      setView('PLAYER');
    }
  }, []);

  const handleRoleSelect = (role: 'HOST' | 'PLAYER' | 'EDITOR' | 'HELP') => {
    if (role === 'HOST') {
      setView('DASHBOARD');
    } else if (role === 'EDITOR') {
      setView('DASHBOARD'); // Editor is accessed via dashboard usually
    } else if (role === 'HELP') {
      setView('HELP');
    } else {
      setView('PLAYER');
    }
  };

  const handleEditBoard = (boardToEdit: GameBoard) => {
    setBoard(boardToEdit);
    setView('EDITOR');
  };

  const handleHostGame = (boardToHost: GameBoard) => {
    setBoard(boardToHost);
    // Generate a simple 4 letter code
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
      {view === 'WELCOME' && <Welcome onSelectRole={handleRoleSelect} />}
      
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
            onBack={() => {
                setLobbyCode(''); // Clear code if backing out
                setView('WELCOME');
            }} 
        />
      )}
    </div>
  );
}

export default App;