import React, { useState, useEffect, useRef } from 'react';
import { useComms } from '../../services/comms';
import { AuthService } from '../../services/auth';
import { GameState, GamePhase, CommsMessage, Team, User } from '../../types';
import { Circle, User as UserIcon, Trophy, Lock, Hash, ArrowLeft, Users, Shield, Plus, Award, LogOut } from 'lucide-react';

interface PlayerScreenProps {
  onBack?: () => void;
  onViewStats?: () => void;
  initialCode?: string;
  user?: User | null; // Pass authenticated user
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({ onBack, onViewStats, initialCode, user }) => {
  const [name, setName] = useState(user?.username || '');
  const [lobbyCodeInput, setLobbyCodeInput] = useState(initialCode || '');
  const [activeLobbyCode, setActiveLobbyCode] = useState<string>('');
  const [joined, setJoined] = useState(false);
  const [playerId] = useState(() => Math.random().toString(36).substr(2, 9));
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myScore, setMyScore] = useState(0);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  
  // Game End State
  const [gameEnded, setGameEnded] = useState(false);
  const [amIWinner, setAmIWinner] = useState(false);

  // Local Stats Tracking Session (to accumulate before saving)
  const sessionStats = useRef({
    pointsEarned: 0,
    correct: 0,
    wrong: 0,
  });
  
  // Teams UI
  const [newTeamName, setNewTeamName] = useState('');
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);

  // Initialize comms with PLAYER role
  const { sendMessage, isConnected } = useComms(activeLobbyCode, 'PLAYER', (msg: CommsMessage) => {
    if (msg.type === 'HOST_SYNC') {
      setGameState(msg.payload);
      
      const me = msg.payload.players.find(p => p.id === playerId);
      if (me) setMyScore(me.score); 

      if (msg.payload.isTeamsMode) {
          const team = msg.payload.teams.find(t => t.members.includes(playerId));
          setMyTeam(team || null);
          if (team) setMyScore(team.score); 
      } else {
          setMyTeam(null);
      }
    }

    // STATS TRACKING LOGIC
    if (user && msg.type === 'RESULT_EVENT') {
        if (msg.payload.playerId === playerId) {
            const isTeam = gameState?.isTeamsMode ? 'team' : 'solo';
            
            // Session tracking
            if (msg.payload.correct) {
                sessionStats.current.correct++;
                sessionStats.current.pointsEarned += msg.payload.points;
            } else {
                sessionStats.current.wrong++;
                sessionStats.current.pointsEarned -= msg.payload.points;
            }

            // Persistence
            AuthService.updateStats(
                isTeam,
                {
                    questionsAttempted: 1,
                    questionsCorrect: msg.payload.correct ? 1 : 0,
                    totalScore: msg.payload.correct ? msg.payload.points : -msg.payload.points
                },
                {
                    title: msg.payload.categoryTitle,
                    correct: msg.payload.correct,
                    points: msg.payload.points
                },
                {
                    totalBuzzes: 1,
                    dailyDoublesAttempted: msg.payload.isDailyDouble ? 1 : 0
                }
            );
        }
    }

    if (msg.type === 'GAME_OVER_SUMMARY') {
        setGameEnded(true);
        const isWinner = msg.payload.winners.includes(playerId);
        setAmIWinner(isWinner);

        if (user) {
            const isTeam = gameState?.isTeamsMode ? 'team' : 'solo';
            AuthService.updateStats(
                isTeam,
                {
                    gamesPlayed: 1,
                    gamesWon: isWinner ? 1 : 0,
                    bestGameScore: sessionStats.current.pointsEarned // Logic inside AuthService handles max() check
                }
            );
        }
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

  // Initial Join Request
  useEffect(() => {
    if (joined && isConnected && name) {
        sendMessage({ type: 'PLAYER_JOIN', payload: { id: playerId, name } });
    }
  }, [joined, isConnected, name, playerId, sendMessage]);

  // Self-Healing
  useEffect(() => {
    if (joined && isConnected && gameState && name) {
        const amIRegistered = gameState.players.some(p => p.id === playerId);
        if (!amIRegistered) {
            const timeout = setTimeout(() => {
                sendMessage({ type: 'PLAYER_JOIN', payload: { id: playerId, name } });
            }, 2000); 
            return () => clearTimeout(timeout);
        }
    }
  }, [joined, isConnected, gameState, name, playerId, sendMessage]);

  const handleBuzz = () => {
    if (!gameState) return;
    if (gameState.buzzLocked) return;
    if (gameState.phase !== GamePhase.QUESTION) return;
    if (gameState.buzzedPlayerId) return;

    sendMessage({ type: 'BUZZ', payload: { playerId } });
  };

  const handleCreateTeam = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTeamName.trim()) return;
      sendMessage({ type: 'CREATE_TEAM', payload: { name: newTeamName, playerId } });
      setNewTeamName('');
      setIsCreatingTeam(false);
  };

  const handleJoinTeam = (teamId: string) => {
      sendMessage({ type: 'JOIN_TEAM', payload: { teamId, playerId } });
  };

  // 1. GAME OVER VIEW
  if (gameEnded) {
      return (
          <div className="h-screen bg-gradient-to-b from-blue-900 to-black flex flex-col items-center justify-center p-6 text-center text-white">
              <div className={`p-6 rounded-full bg-black/30 mb-6 border-4 ${amIWinner ? 'border-jeopardy-gold' : 'border-gray-700'}`}>
                  <Trophy size={64} className={`${amIWinner ? 'text-jeopardy-gold animate-bounce' : 'text-gray-500'}`} />
              </div>
              <h1 className="text-4xl font-display mb-2">{amIWinner ? 'VICTORY!' : 'GAME OVER'}</h1>
              <p className="text-blue-200 mb-8">The host has ended the session.</p>
              
              <div className="flex flex-col gap-4 w-full max-w-xs">
                  {user && onViewStats && (
                      <button 
                        onClick={onViewStats}
                        className="bg-jeopardy-gold hover:bg-yellow-300 text-black font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform hover:scale-105"
                      >
                          <Award size={20} /> View My Stats
                      </button>
                  )}
                  <button 
                    onClick={onBack}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2"
                  >
                      <LogOut size={20} /> Main Menu
                  </button>
              </div>
          </div>
      );
  }

  // 2. Render Login
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
              <UserIcon className="text-black w-8 h-8" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-center text-white mb-2">Join a Game</h2>
          <p className="text-blue-200 text-center mb-6">Enter the lobby code on the host screen.</p>
          
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="relative">
                <UserIcon className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
                <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your Name"
                className="w-full bg-black/50 border border-blue-500 rounded-lg pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-jeopardy-gold transition-all"
                autoFocus
                disabled={!!user} // If logged in, name is locked
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

  // 3. Render Connecting
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

  // 4. Render Team Selection (If in Teams Mode and not yet in a team)
  if (gameState.phase === GamePhase.LOBBY && gameState.isTeamsMode && !myTeam) {
      return (
        <div className="h-screen bg-blue-900 text-white p-6 overflow-y-auto">
            <h1 className="text-3xl font-display text-center mb-8">Select a Team</h1>
            
            {!isCreatingTeam ? (
                <div className="max-w-md mx-auto space-y-4">
                    <button 
                        onClick={() => setIsCreatingTeam(true)}
                        className="w-full bg-jeopardy-gold text-blue-900 font-bold py-4 rounded-lg shadow-lg flex items-center justify-center gap-2 hover:bg-yellow-300"
                    >
                        <Plus /> Create New Team
                    </button>
                    
                    <div className="my-6 border-t border-blue-800"></div>
                    
                    <h3 className="text-sm uppercase text-blue-300 font-bold mb-2">Existing Teams</h3>
                    {gameState.teams.length === 0 && <p className="text-center text-blue-400 italic">No teams yet. Create one!</p>}
                    
                    <div className="space-y-3">
                        {gameState.teams.map(team => (
                            <button
                                key={team.id}
                                onClick={() => handleJoinTeam(team.id)}
                                className="w-full bg-blue-800 hover:bg-blue-700 p-4 rounded-lg flex justify-between items-center transition-colors"
                            >
                                <span className="font-bold text-lg">{team.name}</span>
                                <span className="text-sm text-blue-300">{team.members.length} members</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="max-w-md mx-auto bg-blue-800 p-6 rounded-xl">
                    <h3 className="text-xl font-bold mb-4">Create Team</h3>
                    <form onSubmit={handleCreateTeam}>
                        <input 
                            type="text" 
                            value={newTeamName}
                            onChange={e => setNewTeamName(e.target.value)}
                            placeholder="Team Name"
                            className="w-full p-3 rounded bg-black/30 border border-blue-500 text-white mb-4"
                            autoFocus
                        />
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setIsCreatingTeam(false)} className="flex-1 bg-gray-600 py-3 rounded">Cancel</button>
                            <button type="submit" disabled={!newTeamName} className="flex-1 bg-jeopardy-gold text-blue-900 font-bold py-3 rounded">Create</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
      );
  }

  // 5. Render Lobby Waiting (Standard or Post-Team Selection)
  if (gameState.phase === GamePhase.LOBBY) {
      return (
        <div className="h-screen bg-blue-900 text-white flex flex-col items-center justify-center p-6 text-center">
            <div className="w-24 h-24 bg-jeopardy-gold rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(255,204,0,0.5)]">
                {gameState.isTeamsMode ? <Shield className="w-12 h-12 text-black" /> : <Trophy className="w-12 h-12 text-black" />}
            </div>
            <h1 className="text-4xl font-display uppercase mb-2">You're In!</h1>
            <p className="text-xl text-blue-200">Waiting for host to start...</p>
            
            <div className="mt-8 p-4 bg-black/30 rounded-lg min-w-[200px]">
                <span className="text-gray-400 text-sm uppercase">Player Name</span>
                <p className="text-2xl font-bold mb-4">{name}</p>
                
                {gameState.isTeamsMode && myTeam && (
                    <>
                        <div className="h-px bg-gray-600 w-full mb-4"></div>
                        <span className="text-gray-400 text-sm uppercase">Your Team</span>
                        <p className="text-xl font-bold text-jeopardy-gold">{myTeam.name}</p>
                    </>
                )}
            </div>
        </div>
      )
  }

  // Game Logic variables
  const buzzedPlayerId = gameState.buzzedPlayerId;
  const buzzedTeamId = gameState.isTeamsMode && buzzedPlayerId 
      ? gameState.teams.find(t => t.members.includes(buzzedPlayerId))?.id 
      : null;

  const isMyTurn = playerId === buzzedPlayerId;
  const isMyTeamTurn = gameState.isTeamsMode && myTeam && buzzedTeamId === myTeam.id;

  // Determine blocked status
  let isBlocked = false;
  if (gameState.isTeamsMode) {
      if (myTeam && gameState.blockedTeamIds.includes(myTeam.id)) isBlocked = true;
  } else {
      if (gameState.blockedPlayerIds.includes(playerId)) isBlocked = true;
  }

  const isQuestionPhase = gameState.phase === GamePhase.QUESTION;
  const buzzersOpen = !gameState.buzzLocked;

  // Determine Buzzer Color & Text
  let buzzerColorClass = "bg-red-600 border-red-800 shadow-red-900/50"; // Default (Locked/Idle)
  let statusText = "WAIT";

  if (isQuestionPhase) {
    if (isMyTurn) {
        // I buzzed
        buzzerColorClass = "bg-green-500 border-green-700 shadow-green-500/50 animate-pulse";
        statusText = "SPEAK!";
    } else if (isMyTeamTurn) {
        // My teammate buzzed
        buzzerColorClass = "bg-green-600 border-green-800 shadow-green-600/50";
        statusText = "TEAM TURN";
    } else if (isBlocked) {
        // I got it wrong
        buzzerColorClass = "bg-gray-700 border-gray-800 opacity-50 cursor-not-allowed";
        statusText = "LOCKED";
    } else if (buzzedPlayerId) {
        // Someone else buzzed
        buzzerColorClass = "bg-gray-700 border-gray-800 opacity-50";
        statusText = "LOCKED";
    } else if (buzzersOpen) {
        // Open for buzzing
        buzzerColorClass = "bg-jeopardy-gold border-yellow-600 shadow-yellow-500/50 hover:bg-yellow-300 active:scale-95";
        statusText = "BUZZ!";
    }
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg flex justify-between items-center z-10 border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-xs font-bold relative">
            {name.charAt(0).toUpperCase()}
            {user && <div className="absolute -bottom-1 -right-1 bg-green-500 w-3 h-3 rounded-full border border-black" title="Logged In"></div>}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white leading-none">{name}</span>
            {myTeam && <span className="text-xs text-jeopardy-gold leading-none mt-1">{myTeam.name}</span>}
          </div>
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
             <div className="text-center">
                 <p className="text-xl text-blue-300 font-light mb-4">Watch the main screen</p>
                 {user && (
                     <div className="bg-gray-800 p-2 rounded-lg inline-flex items-center gap-2 text-xs text-gray-400">
                         <Award size={12} className="text-jeopardy-gold" />
                         <span>Stats are being tracked</span>
                     </div>
                 )}
             </div>
           </div>
        )}

        {/* The Big Button */}
        <div className="relative w-full max-w-[300px] aspect-square">
            <button
                onClick={handleBuzz}
                disabled={!isQuestionPhase || (statusText === "LOCKED" || statusText === "WAIT") && !isMyTurn && !isMyTeamTurn}
                className={`
                    w-full h-full rounded-full border-b-[12px] transition-all duration-100 flex flex-col items-center justify-center
                    ${buzzerColorClass}
                `}
            >
                {isMyTurn ? (
                    <Trophy className="w-20 h-20 text-white drop-shadow-lg mb-2" />
                ) : isMyTeamTurn ? (
                    <Users className="w-20 h-20 text-white drop-shadow-lg mb-2" />
                ) : statusText === "LOCKED" ? (
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
           {isMyTeamTurn && !isMyTurn && <p className="text-green-400 text-lg font-bold">Your team buzzed! Help them out!</p>}
           
           {isBlocked && <p className="text-red-500 font-bold">Locked out for this question.</p>}
           
           {!isBlocked && buzzedPlayerId && !isMyTurn && !isMyTeamTurn && <p className="text-red-400 font-medium">Locked out...</p>}
           
           {!isBlocked && isQuestionPhase && buzzersOpen && !buzzedPlayerId && <p className="text-jeopardy-gold font-medium">BUZZERS OPEN!</p>}
        </div>
      </div>
    </div>
  );
};