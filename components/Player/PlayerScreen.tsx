import React, { useState } from 'react';
import { useComms } from '../../services/comms';
import { GameState, GamePhase, CommsMessage } from '../../types';
import { Circle, User, Trophy, Lock, Hash, ArrowLeft } from 'lucide-react';

interface PlayerScreenProps {
  onBack?: () => void;
  initialCode?: string;
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({ onBack, initialCode }) => {
  const [name, setName] = useState('');
  const [lobbyCodeInput, setLobbyCodeInput] = useState(initialCode || '');
  const [activeLobbyCode, setActiveLobbyCode] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const [playerId] = useState(() => Math.random().toString(36).substr(2, 9));
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myScore, setMyScore] = useState(0);

  // Initialize comms with PLAYER role
  const { sendMessage, isConnected } = useComms(activeLobbyCode, 'PLAYER', (msg: CommsMessage) => {
    if (msg.type === 'HOST_SYNC') {
      setGameState(msg.payload);
      const me = msg.payload.players.find(p => p.id === playerId);
      if (me) setMyScore(me.score);
    }
  });

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !lobbyCodeInput.trim()) return;
    
    // Set the active code which triggers the comms hook
    const code = lobbyCodeInput.toUpperCase().trim();
    setActiveLobbyCode(code);
    setJoined(true);
  };

  // When connection opens after clicking Join, send the join message
  // We use a useEffect here to watch for the connection status
  React.useEffect(() => {
    if (joined && isConnected && name) {
        sendMessage({ type: 'PLAYER_JOIN', payload: { id: playerId, name } });
    }
  }, [joined, isConnected, name, playerId]);

  const handleBuzz = () => {
    if (!gameState) return;
    if (gameState.buzzLocked) return;
    if (gameState.phase !== GamePhase.QUESTION) return;
    if (gameState.buzzedPlayerId) return;

    sendMessage({ type: 'BUZZ', payload: { playerId } });
  };

  // Render Login
  if (!joined) {
    return (
      <div className="h-screen bg-gradient-to-b from-blue-900 to-black flex items-center justify-center p-6 relative">
        {onBack && (
            <button onClick={onBack} className="absolute top-4 left-4 text-gray-400 hover:text-white flex items-center gap-2">
                <ArrowLeft size={20} /> Back
            </button>
        )}
        <div className="w-full max-w-md bg-white/10 backdrop-blur-md p-8 rounded-2xl border border-white/20 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="bg-jeopardy-gold p-4 rounded-full shadow-lg">
              <User className="text-black w-8 h-8" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Join a Game</h2>
          <p className="text-blue-200 text-center mb-6">Enter the lobby code on the host screen.</p>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="relative">
                <User className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your Name"
                className="w-full bg-black/50 border border-blue-500 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jeopardy-gold transition-all"
                autoFocus
                />
            </div>
            
            <div className="relative">
                <Hash className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                type="text"
                value={lobbyCodeInput}
                onChange={e => setLobbyCodeInput(e.target.value)}
                placeholder="Lobby Code (e.g. ABCD)"
                maxLength={4}
                className="w-full bg-black/50 border border-blue-500 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jeopardy-gold uppercase tracking-widest transition-all"
                />
            </div>

            <button
              type="submit"
              disabled={!name || !lobbyCodeInput}
              className="w-full bg-jeopardy-blue hover:bg-blue-700 text-white font-bold py-4 rounded-lg text-lg transition-all shadow-lg hover:scale-[1.02]"
            >
              Enter Lobby
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render Waiting for Host
  if (!gameState) {
    return (
      <div className="h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin mb-8">
          <div className="w-12 h-12 border-4 border-jeopardy-gold border-t-transparent rounded-full"></div>
        </div>
        <h2 className="text-2xl font-bold mb-2">Connecting to {activeLobbyCode}...</h2>
        <p className="text-gray-400 mb-4">Establishing connection to host.</p>
        
        {!isConnected && (
            <p className="text-yellow-500 text-sm animate-pulse">Searching for lobby...</p>
        )}
        
        {isConnected && (
            <p className="text-green-500 text-sm">Connected! Waiting for game data...</p>
        )}

        <button onClick={() => setJoined(false)} className="mt-8 text-red-400 hover:text-red-300 underline">Cancel</button>
      </div>
    );
  }

  // Lobby Phase
  if (gameState.phase === GamePhase.LOBBY) {
      return (
        <div className="h-screen bg-blue-900 text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-jeopardy-gold rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(255,204,0,0.5)]">
                <Trophy className="w-12 h-12 text-black" />
            </div>
            <h1 className="text-4xl font-display uppercase mb-2">You're In!</h1>
            <p className="text-xl text-blue-200">Waiting for host to start...</p>
            <div className="mt-8 p-4 bg-black/30 rounded-lg">
                <span className="text-gray-400 text-sm uppercase">Player Name</span>
                <p className="text-2xl font-bold">{name}</p>
            </div>
        </div>
      )
  }

  const isMyTurn = gameState.buzzedPlayerId === playerId;
  const isLocked = gameState.buzzLocked || !!gameState.buzzedPlayerId;
  const isQuestionPhase = gameState.phase === GamePhase.QUESTION;

  // Determine Buzzer Color
  let buzzerColorClass = "bg-red-600 border-red-800 shadow-red-900/50"; // Default (Locked/Idle)
  let statusText = "WAIT";

  if (isQuestionPhase) {
    if (isMyTurn) {
        buzzerColorClass = "bg-green-500 border-green-700 shadow-green-500/50 animate-pulse";
        statusText = "ANSWER!";
    } else if (gameState.buzzedPlayerId) {
        buzzerColorClass = "bg-gray-700 border-gray-800 opacity-50";
        statusText = "LOCKED";
    } else if (!gameState.buzzLocked) {
        buzzerColorClass = "bg-jeopardy-gold border-yellow-600 shadow-yellow-500/50 hover:bg-yellow-300 active:scale-95";
        statusText = "BUZZ!";
    }
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg flex justify-between items-center z-10 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="font-bold text-white">{name}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400 uppercase">Score</span>
          <span className={`font-mono text-xl font-bold ${myScore < 0 ? 'text-red-400' : 'text-green-400'}`}>
            ${myScore}
          </span>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        {/* Current Info Overlay */}
        {gameState.phase === GamePhase.BOARD && (
           <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
             <p className="text-xl text-blue-300 font-light">Watch the main screen</p>
           </div>
        )}

        {/* The Big Button */}
        <div className="relative w-full max-w-[300px] aspect-square">
            <button
                onClick={handleBuzz}
                disabled={!isQuestionPhase || (isLocked && !isMyTurn)}
                className={`
                    w-full h-full rounded-full border-b-[12px] transition-all duration-100 flex flex-col items-center justify-center
                    ${buzzerColorClass}
                `}
            >
                {isMyTurn ? (
                    <Trophy className="w-20 h-20 text-white drop-shadow-lg mb-2" />
                ) : isLocked && isQuestionPhase && !gameState.buzzedPlayerId ? (
                   <Lock className="w-16 h-16 text-gray-400 mb-2" />
                ) : (
                   <Circle className="w-16 h-16 text-white/50 mb-2" />
                )}
                
                <span className="text-3xl font-black text-white tracking-widest uppercase drop-shadow-md">
                    {statusText}
                </span>
            </button>
        </div>

        {/* Context Text */}
        <div className="mt-12 text-center h-16">
           {isMyTurn && <p className="text-green-400 text-lg font-bold animate-bounce">It's your turn! Speak the answer!</p>}
           {gameState.buzzedPlayerId && !isMyTurn && <p className="text-red-400 font-medium">Someone else buzzed in...</p>}
           {isQuestionPhase && !gameState.buzzLocked && !gameState.buzzedPlayerId && <p className="text-jeopardy-gold font-medium">BUZZERS OPEN!</p>}
        </div>
      </div>
    </div>
  );
};