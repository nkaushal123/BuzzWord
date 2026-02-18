import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question, Team } from '../../types';
import { useComms } from '../../services/comms';
import { Users, Lock, Unlock, Check, X, ArrowRight, Copy, LogOut, Wifi, WifiOff, Star, DollarSign, Link, Shield, Trash2, UserPlus, ToggleLeft, ToggleRight, Eye } from 'lucide-react';

interface HostGameViewProps {
  board: GameBoard;
  lobbyCode: string;
  onExit: () => void;
}

// Sub-component to handle score animation
const ScoreDisplay: React.FC<{ score: number; className?: string }> = ({ score, className }) => {
  const [animClass, setAnimClass] = useState('');
  const prevScore = useRef(score);

  useEffect(() => {
    if (score > prevScore.current) {
      setAnimClass('text-green-400 scale-125 brightness-150');
    } else if (score < prevScore.current) {
      setAnimClass('text-red-500 scale-125 brightness-150');
    }
    
    const timer = setTimeout(() => {
      setAnimClass('');
      prevScore.current = score;
    }, 600);

    return () => clearTimeout(timer);
  }, [score]);

  return (
    <span className={`transition-all duration-500 transform inline-block ${animClass} ${className}`}>
      ${score}
    </span>
  );
};

export const HostGameView: React.FC<HostGameViewProps> = ({ board, lobbyCode, onExit }) => {
  // Game State
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isTeamsMode, setIsTeamsMode] = useState(false);
  
  const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{catId: string, q: Question} | null>(null);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [buzzLocked, setBuzzLocked] = useState(true);
  
  // Lockout lists for incorrect guesses
  const [blockedPlayerIds, setBlockedPlayerIds] = useState<string[]>([]);
  const [blockedTeamIds, setBlockedTeamIds] = useState<string[]>([]);

  const [showAnswer, setShowAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Daily Double State
  const [dailyDoubleMode, setDailyDoubleMode] = useState(false);
  const [ddQuestionRevealed, setDdQuestionRevealed] = useState(false); // New state to control question visibility
  const [dailyDoublePlayerId, setDailyDoublePlayerId] = useState<string | null>(null); // For teams mode, this is still the specific player who answers
  const [wager, setWager] = useState<number>(0);
  
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.LOBBY);

  // Use Comms with HOST role
  const { sendMessage, isConnected } = useComms(lobbyCode, 'HOST', (msg: CommsMessage) => {
    if (msg.type === 'PLAYER_JOIN') {
      setPlayers(prev => {
        if (prev.find(p => p.id === msg.payload.id)) return prev;
        return [...prev, { id: msg.payload.id, name: msg.payload.name, score: 0 }];
      });
    }

    if (msg.type === 'CREATE_TEAM') {
        setTeams(prev => {
            if (prev.find(t => t.name.toLowerCase() === msg.payload.name.toLowerCase())) return prev;
            return [...prev, { 
                id: Math.random().toString(36).substr(2, 9), 
                name: msg.payload.name, 
                score: 0, 
                members: [msg.payload.playerId] 
            }];
        });
    }

    if (msg.type === 'JOIN_TEAM') {
        setTeams(prev => prev.map(t => {
            if (t.id === msg.payload.teamId) {
                // Add player if not already in team
                if (!t.members.includes(msg.payload.playerId)) {
                    return { ...t, members: [...t.members, msg.payload.playerId] };
                }
            } else {
                // Remove player from other teams to ensure unique membership
                if (t.members.includes(msg.payload.playerId)) {
                    return { ...t, members: t.members.filter(m => m !== msg.payload.playerId) };
                }
            }
            return t;
        }));
    }

    if (msg.type === 'BUZZ') {
      if (currentQuestion && !buzzLocked && !buzzedPlayerId && !dailyDoubleMode) {
        // Check Lockouts
        if (isTeamsMode) {
            const playerTeam = teams.find(t => t.members.includes(msg.payload.playerId));
            if (playerTeam && blockedTeamIds.includes(playerTeam.id)) return; // Team is blocked
        } else {
            if (blockedPlayerIds.includes(msg.payload.playerId)) return; // Player is blocked
        }

        setBuzzedPlayerId(msg.payload.playerId);
        setBuzzLocked(true);
        
        // Immediate Sync
        sendMessage({
           type: 'HOST_SYNC',
           payload: {
             lobbyCode,
             phase: GamePhase.QUESTION,
             currentQuestionId: currentQuestion.q.id,
             currentCategoryId: currentQuestion.catId,
             answeredQuestions,
             buzzedPlayerId: msg.payload.playerId,
             buzzLocked: true,
             players,
             board: null,
             isTeamsMode,
             teams,
             blockedPlayerIds,
             blockedTeamIds
           }
        });
      }
    }
  });

  // Helper to broadcast state to all players
  const broadcastState = useCallback(() => {
    const state: GameState = {
      lobbyCode,
      phase: currentQuestion ? (showAnswer ? GamePhase.ANSWER : GamePhase.QUESTION) : (gamePhase === GamePhase.LOBBY ? GamePhase.LOBBY : GamePhase.BOARD),
      currentQuestionId: currentQuestion?.q.id || null,
      currentCategoryId: currentQuestion?.catId || null,
      answeredQuestions,
      buzzedPlayerId,
      buzzLocked,
      players,
      board: null,
      isTeamsMode,
      teams,
      blockedPlayerIds,
      blockedTeamIds
    };
    sendMessage({ type: 'HOST_SYNC', payload: state });
  }, [players, teams, answeredQuestions, currentQuestion, buzzedPlayerId, buzzLocked, showAnswer, gamePhase, lobbyCode, sendMessage, isTeamsMode, blockedPlayerIds, blockedTeamIds]);

  // Keep state synced
  useEffect(() => {
    if(isConnected) {
        broadcastState();
    }
  }, [broadcastState, isConnected]);

  // Actions
  const startGame = () => {
    setGamePhase(GamePhase.BOARD);
  };

  const deleteTeam = (teamId: string) => {
      setTeams(prev => prev.filter(t => t.id !== teamId));
  };

  const openQuestion = (catId: string, q: Question) => {
    if (answeredQuestions.includes(q.id)) return;
    
    setCurrentQuestion({ catId, q });
    setShowAnswer(false);
    setBuzzedPlayerId(null);
    setBuzzLocked(true);
    setBlockedPlayerIds([]); // Reset lockouts for new question
    setBlockedTeamIds([]);
    
    // Check for Daily Double
    if (q.isDailyDouble) {
      setDailyDoubleMode(true);
      setWager(q.points);
      setDailyDoublePlayerId(null);
      setDdQuestionRevealed(false); // Ensure hidden initially
    } else {
      setDailyDoubleMode(false);
      setWager(0);
    }
  };

  const unlockBuzzers = () => {
    setBuzzLocked(false);
  };

  const handleRevealDD = () => {
      setDdQuestionRevealed(true);
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;
    
    const points = dailyDoubleMode ? wager : currentQuestion.q.points;
    const playerIdToScore = dailyDoubleMode ? dailyDoublePlayerId : buzzedPlayerId;

    if (!playerIdToScore) return;

    if (isTeamsMode) {
        // Find team
        const team = teams.find(t => t.members.includes(playerIdToScore));
        if (team) {
            setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: t.score + points } : t));
        }
    } else {
        setPlayers(prev => prev.map(p => p.id === playerIdToScore ? { ...p, score: p.score + points } : p));
    }

    setDailyDoubleMode(false);
    revealAnswer();
  };

  const handleIncorrect = () => {
    if (!currentQuestion) return;

    const points = dailyDoubleMode ? wager : currentQuestion.q.points;
    const playerIdToScore = dailyDoubleMode ? dailyDoublePlayerId : buzzedPlayerId;

    if (!playerIdToScore) return;

    if (isTeamsMode) {
        const team = teams.find(t => t.members.includes(playerIdToScore));
        if (team) {
            // Deduct Points
            setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: t.score - points } : t));
            
            // Add Team to Blocked List (unless Daily Double which forces end of turn anyway usually, but logic holds)
            setBlockedTeamIds(prev => [...prev, team.id]);
        }
    } else {
        // Deduct Points
        setPlayers(prev => prev.map(p => p.id === playerIdToScore ? { ...p, score: p.score - points } : p));
        
        // Add Player to Blocked List
        setBlockedPlayerIds(prev => [...prev, playerIdToScore]);
    }

    if (dailyDoubleMode) {
        setDailyDoubleMode(false);
        revealAnswer();
    } else {
        // Incorrect guess in normal mode: reset buzzer and re-open for others
        setBuzzedPlayerId(null);
        setBuzzLocked(false);
    }
  };

  const revealAnswer = () => {
    setShowAnswer(true);
    setBuzzLocked(true);
  };

  const closeQuestion = () => {
    if (currentQuestion) {
      setAnsweredQuestions(prev => [...prev, currentQuestion.q.id]);
    }
    setCurrentQuestion(null);
    setBuzzedPlayerId(null);
    setBuzzLocked(true);
    setShowAnswer(false);
    setDailyDoubleMode(false);
    setDdQuestionRevealed(false);
    setWager(0);
    setDailyDoublePlayerId(null);
  };

  const copyToClipboard = () => {
    const url = `${window.location.origin}?code=${lobbyCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- LOBBY VIEW ---
  if (gamePhase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
         <div className="absolute top-8 right-8 flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${isConnected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
                {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span className="text-xs font-bold">{isConnected ? 'ONLINE' : 'CONNECTING...'}</span>
            </div>
            <button onClick={onExit} className="text-gray-500 hover:text-white flex items-center gap-2">
              <LogOut size={20} /> Exit Lobby
            </button>
         </div>

         <div className="max-w-6xl w-full bg-blue-900/20 border border-blue-800 rounded-2xl p-12 text-center">
            <div className="flex justify-center items-center mb-8">
                <h1 className="text-3xl text-blue-300 font-light mr-4">
                    Join at <span className="text-white font-bold">{window.location.hostname}</span> with code:
                </h1>
            </div>
            
            <button 
              onClick={copyToClipboard}
              className="group relative bg-white hover:bg-gray-200 transition-colors text-black text-9xl font-display tracking-widest p-8 rounded-xl mb-12 inline-block shadow-[0_0_50px_rgba(255,255,255,0.3)] cursor-pointer"
            >
              {lobbyCode}
              <div className="absolute top-4 right-4 text-gray-400 group-hover:text-black flex items-center gap-1 bg-gray-100 rounded-full px-2 py-1 text-xs">
                {copied ? <Check size={16} className="text-green-600" /> : <Link size={16} />}
                <span className="font-sans font-bold">{copied ? 'COPIED LINK' : 'COPY LINK'}</span>
              </div>
            </button>

            {/* Mode Toggle */}
            <div className="flex justify-center mb-8">
                <div className="bg-gray-800 p-1 rounded-lg flex items-center">
                    <button 
                        onClick={() => setIsTeamsMode(false)}
                        className={`px-6 py-2 rounded-md font-bold transition-all ${!isTeamsMode ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Standard Mode
                    </button>
                    <button 
                        onClick={() => setIsTeamsMode(true)}
                        className={`px-6 py-2 rounded-md font-bold transition-all ${isTeamsMode ? 'bg-jeopardy-gold text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                    >
                        Teams Mode
                    </button>
                </div>
            </div>

            {isTeamsMode ? (
                // TEAMS MODE LOBBY
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12 min-h-[200px] text-left">
                    {teams.map(team => (
                        <div key={team.id} className="bg-gray-800 border border-gray-600 rounded-xl overflow-hidden shadow-lg">
                            <div className="bg-jeopardy-gold text-black p-3 font-bold flex justify-between items-center">
                                <span className="truncate">{team.name}</span>
                                <button onClick={() => deleteTeam(team.id)} className="text-black/50 hover:text-red-600">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <div className="p-3">
                                {team.members.map(pid => {
                                    const p = players.find(pl => pl.id === pid);
                                    return (
                                        <div key={pid} className="text-sm text-gray-300 py-1 flex items-center">
                                            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                                            {p?.name || 'Unknown'}
                                        </div>
                                    )
                                })}
                                {team.members.length === 0 && <span className="text-gray-600 italic text-sm">Empty</span>}
                            </div>
                        </div>
                    ))}
                    <div className="col-span-full">
                        <h3 className="text-gray-400 text-sm uppercase mb-4 text-center">Unassigned Players</h3>
                        <div className="flex flex-wrap justify-center gap-4">
                            {players.filter(p => !teams.some(t => t.members.includes(p.id))).map(p => (
                                <div key={p.id} className="bg-gray-800 px-4 py-2 rounded-full border border-gray-700 text-gray-400">
                                    {p.name}
                                </div>
                            ))}
                            {players.length === 0 && <span className="text-gray-600 italic">Waiting for connection...</span>}
                        </div>
                    </div>
                </div>
            ) : (
                // STANDARD MODE LOBBY
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 min-h-[100px]">
                    {players.map(p => (
                        <div key={p.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-center space-x-2 animate-fade-in border border-gray-700">
                            <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_5px_lime]"></div>
                            <span className="font-bold">{p.name}</span>
                        </div>
                    ))}
                    {players.length === 0 && (
                        <div className="col-span-4 text-gray-500 italic">Waiting for players to connect...</div>
                    )}
                </div>
            )}

            <button 
              onClick={startGame}
              disabled={!isConnected}
              className="bg-jeopardy-gold hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-blue-900 text-2xl font-bold py-6 px-16 rounded-full shadow-xl transition-all hover:scale-105"
            >
              Start Game
            </button>
         </div>
      </div>
    );
  }

  // --- GAME BOARD VIEW ---
  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* LEFT: Game Control & Leaderboard */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col z-20 shadow-xl shrink-0">
        <div className="p-4 border-b border-gray-800 bg-blue-900/20 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center text-jeopardy-gold">
            {isTeamsMode ? <Shield className="mr-2" /> : <Users className="mr-2" />}
            {isTeamsMode ? 'TEAMS' : 'PLAYERS'}
          </h2>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <button 
                onClick={copyToClipboard}
                className="text-xs font-mono bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded text-gray-400 flex items-center gap-1 transition-colors"
                title="Copy Invite Link"
            >
                {lobbyCode}
                {copied ? <Check size={12} /> : <Link size={12} />}
            </button>
          </div>
        </div>
        
        {/* Leaderboard List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {(isTeamsMode ? teams : players).length === 0 && <div className="text-gray-500 text-center italic mt-10">Empty</div>}
          
          {(isTeamsMode ? teams : players).sort((a,b) => b.score - a.score).map(entity => {
            // Determine active state logic
            let isActive = false;
            let isBlocked = false;

            if (isTeamsMode) {
                // Entity is Team
                const team = entity as Team;
                // Active if buzzed player is a member
                if (buzzedPlayerId && team.members.includes(buzzedPlayerId)) isActive = true;
                if (dailyDoublePlayerId && team.members.includes(dailyDoublePlayerId)) isActive = true;
                if (blockedTeamIds.includes(team.id)) isBlocked = true;
            } else {
                // Entity is Player
                const p = entity as Player;
                if (buzzedPlayerId === p.id) isActive = true;
                if (dailyDoublePlayerId === p.id) isActive = true;
                if (blockedPlayerIds.includes(p.id)) isBlocked = true;
            }
            
            return (
                <div 
                key={entity.id} 
                className={`p-4 rounded-xl border-2 flex justify-between items-center transition-all duration-300 relative overflow-hidden ${
                    isActive
                    ? 'bg-jeopardy-gold border-white shadow-[0_0_20px_rgba(255,204,0,0.8)] scale-105 z-10' 
                    : isBlocked 
                        ? 'bg-gray-800 border-red-900 opacity-60' 
                        : 'bg-gray-800 border-gray-700'
                }`}
                >
                <div className="flex flex-col min-w-0">
                    <span className={`font-bold truncate max-w-[120px] text-lg ${isActive ? 'text-black' : 'text-white'}`}>
                        {entity.name}
                    </span>
                    {isTeamsMode && (
                        <span className={`text-xs truncate ${isActive ? 'text-black/60' : 'text-gray-500'}`}>
                            {(entity as Team).members.length} members
                        </span>
                    )}
                </div>
                
                <div className={`font-mono text-xl font-black px-3 py-1 rounded transition-all ${isActive ? 'bg-black' : ''}`}>
                    <ScoreDisplay 
                        score={entity.score} 
                        className={isActive ? 'text-jeopardy-gold' : (entity.score < 0 ? 'text-red-400' : 'text-green-400')}
                    />
                </div>
                
                {/* Visual indicators */}
                {isActive && <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none"></div>}
                {isBlocked && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
                        <Lock className="text-red-500 opacity-50" size={32} />
                    </div>
                )}
                </div>
            );
          })}
        </div>

        {/* Current Question Controls */}
        {currentQuestion && (
          <div className="p-4 bg-blue-950 border-t border-blue-800 shadow-[0_-5px_20px_rgba(0,0,0,0.5)] z-30">
            
            {dailyDoubleMode ? (
                // --- Daily Double Controls ---
                <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
                    <div className="bg-yellow-900/30 p-3 rounded border border-jeopardy-gold/50">
                        <h3 className="text-jeopardy-gold font-bold uppercase text-sm mb-2 flex items-center gap-2">
                            <Star size={16} fill="currentColor" /> Daily Double Wager
                        </h3>
                        
                        {/* Player Selector */}
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 block mb-1">Who is wagering?</label>
                            <select 
                                className="w-full bg-black border border-gray-600 rounded p-2 text-white outline-none focus:border-jeopardy-gold"
                                value={dailyDoublePlayerId || ''}
                                onChange={(e) => setDailyDoublePlayerId(e.target.value)}
                            >
                                <option value="">Select Player...</option>
                                {players.map(p => {
                                    if (isTeamsMode) {
                                        const t = teams.find(team => team.members.includes(p.id));
                                        return <option key={p.id} value={p.id}>{p.name} ({t?.name || 'No Team'})</option>;
                                    }
                                    return <option key={p.id} value={p.id}>{p.name} (${p.score})</option>;
                                })}
                            </select>
                        </div>

                        {/* Wager Input */}
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 block mb-1">Wager Amount</label>
                            <div className="relative">
                                <DollarSign size={16} className="absolute left-2 top-2.5 text-gray-400" />
                                <input 
                                    type="number" 
                                    className="w-full bg-black border border-gray-600 rounded p-2 pl-8 text-white font-mono text-lg outline-none focus:border-jeopardy-gold"
                                    value={wager}
                                    onChange={(e) => setWager(parseInt(e.target.value) || 0)}
                                    onFocus={(e) => e.target.select()}
                                />
                            </div>
                        </div>
                    </div>
                    
                    {!ddQuestionRevealed ? (
                        <button 
                            onClick={handleRevealDD}
                            disabled={!dailyDoublePlayerId}
                            className="w-full py-4 bg-jeopardy-gold text-black hover:bg-yellow-300 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold flex items-center justify-center shadow-lg uppercase tracking-widest transition-all"
                        >
                            <Eye className="mr-2" size={20} /> Reveal Question
                        </button>
                    ) : (
                        <div className="flex justify-between gap-2 animate-in fade-in slide-in-from-bottom-2">
                            <button 
                                onClick={handleCorrect}
                                disabled={!dailyDoublePlayerId}
                                className="flex-1 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold flex items-center justify-center shadow-lg"
                            >
                                <Check className="mr-1" size={18} /> Correct
                            </button>
                            <button 
                                onClick={handleIncorrect}
                                disabled={!dailyDoublePlayerId}
                                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 rounded font-bold flex items-center justify-center shadow-lg"
                            >
                                <X className="mr-1" size={18} /> Wrong
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                // --- Standard Controls ---
                <div className="space-y-3">
                    {!buzzedPlayerId && !showAnswer && (
                        <div className="flex gap-2">
                            <button 
                                onClick={unlockBuzzers}
                                disabled={!buzzLocked}
                                className={`flex-1 py-4 rounded font-bold flex items-center justify-center shadow-lg transition-all ${!buzzLocked ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                            >
                                {!buzzLocked ? <Unlock className="mr-2"/> : <Lock className="mr-2"/>}
                                {!buzzLocked ? 'OPEN' : 'UNLOCK'}
                            </button>
                            
                            <button 
                                onClick={revealAnswer}
                                className="w-1/3 py-4 bg-yellow-600 hover:bg-yellow-500 rounded font-bold shadow-lg"
                            >
                                REVEAL
                            </button>
                        </div>
                    )}

                    {buzzedPlayerId && (
                    <div className="space-y-2 animate-in slide-in-from-bottom duration-200">
                        <div className="text-center bg-gray-900 p-2 rounded border border-gray-700 mb-2">
                            <span className="text-gray-400 text-xs uppercase">Buzzed In:</span>
                            <div className="text-xl font-bold text-white truncate">
                                {players.find(p => p.id === buzzedPlayerId)?.name || 'Unknown Player'}
                            </div>
                            {isTeamsMode && (
                                <div className="text-sm text-jeopardy-gold">
                                    {teams.find(t => t.members.includes(buzzedPlayerId!))?.name || 'No Team'}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button 
                            onClick={handleCorrect}
                            className="flex-1 py-4 bg-green-600 hover:bg-green-500 rounded font-bold flex items-center justify-center shadow-lg border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all"
                            >
                            <Check className="mr-1" size={24} /> CORRECT
                            </button>
                            <button 
                            onClick={handleIncorrect}
                            className="flex-1 py-4 bg-red-600 hover:bg-red-500 rounded font-bold flex items-center justify-center shadow-lg border-b-4 border-red-800 active:border-b-0 active:translate-y-1 transition-all"
                            >
                            <X className="mr-1" size={24} /> WRONG
                            </button>
                        </div>
                    </div>
                    )}
                    
                    {showAnswer && (
                    <button 
                        onClick={closeQuestion}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 rounded font-bold flex items-center justify-center shadow-lg border-b-4 border-blue-800 active:border-b-0 active:translate-y-1 transition-all"
                    >
                        Back to Board <ArrowRight className="ml-2"/>
                    </button>
                    )}
                </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-gray-800">
          <button onClick={onExit} className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors flex items-center justify-center gap-2">
             <LogOut size={16} /> End Game
          </button>
        </div>
      </div>

      {/* RIGHT: Game Board */}
      <div className="flex-1 flex flex-col bg-blue-950 relative overflow-hidden">
        {/* Same Question/Board UI as before, omitted for brevity since unchanged logic-wise */}
        {currentQuestion && (
          <div className="absolute inset-0 z-50 bg-jeopardy-blue/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            {dailyDoubleMode ? (
                // Daily Double Splash Screen / Clue
                <div className="flex flex-col items-center justify-center w-full max-w-4xl">
                    <h1 className="text-5xl md:text-8xl font-display text-jeopardy-gold uppercase tracking-widest drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)] animate-pulse mb-8">
                        Daily Double
                    </h1>
                    
                    {/* Wager info overlay */}
                    <div className="bg-black/50 p-6 rounded-xl border border-jeopardy-gold min-w-[300px]">
                         {!dailyDoublePlayerId ? (
                             <p className="text-xl text-white animate-pulse">Waiting for host to select player...</p>
                         ) : (
                             <div className="text-center">
                                 <p className="text-gray-300 text-sm uppercase tracking-widest">Wagering</p>
                                 <p className="text-5xl font-display text-white mt-2">${wager}</p>
                                 <p className="text-jeopardy-gold text-xl mt-2 font-bold">
                                     {players.find(p => p.id === dailyDoublePlayerId)?.name}
                                 </p>
                             </div>
                         )}
                    </div>

                    {ddQuestionRevealed && (
                        <div className="mt-12 w-full animate-in zoom-in-95 duration-500">
                            <p className="text-3xl md:text-5xl font-display uppercase text-white leading-tight shadow-black drop-shadow-md break-words">
                                {currentQuestion.q.question}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                // Standard Question View
                <div className="w-full max-w-[90%] flex flex-col items-center">
                    <div className="mb-8 text-jeopardy-gold font-display text-4xl uppercase tracking-widest drop-shadow-md">
                        {board.categories.find(c => c.id === currentQuestion.catId)?.title} - ${currentQuestion.q.points}
                    </div>
                    
                    <div className="bg-blue-900 w-full p-10 md:p-16 rounded-3xl border-4 border-black shadow-2xl flex flex-col items-center justify-center relative min-h-[400px]">
                        <div className="flex flex-col items-center justify-center gap-8 w-full">
                            {currentQuestion.q.image && !showAnswer && (
                                <img 
                                    src={currentQuestion.q.image} 
                                    alt="Question Clue" 
                                    className="max-h-[30vh] object-contain rounded-lg border-2 border-white/20 shadow-lg"
                                />
                            )}
                            
                            <p className="text-3xl md:text-5xl font-display uppercase text-white leading-tight shadow-black drop-shadow-md w-full text-center break-words whitespace-pre-wrap">
                                {showAnswer ? currentQuestion.q.answer : currentQuestion.q.question}
                            </p>
                        </div>
                        
                        {showAnswer && (
                        <div className="mt-8 px-6 py-2 bg-green-600 rounded-full text-sm font-bold tracking-widest uppercase animate-bounce shrink-0 shadow-lg">
                            Answer Revealed
                        </div>
                        )}
                    </div>
                </div>
            )}
          </div>
        )}

        {/* The Grid */}
        <div className="flex-1 p-4 overflow-auto">
           <div 
             className="grid gap-2 h-full min-w-max" 
             style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(180px, 1fr))` }}
           >
                {board.categories.map(category => (
                    <div key={category.id} className="flex flex-col gap-2 h-full">
                    <div className="bg-blue-900 border-b-4 border-black flex items-center justify-center p-2 h-24 text-center shadow-lg">
                        <h3 className="font-display text-lg md:text-xl uppercase text-white leading-tight break-words drop-shadow-md">
                        {category.title}
                        </h3>
                    </div>
                    {category.questions.map(q => {
                        const isAnswered = answeredQuestions.includes(q.id);
                        return (
                        <button
                            key={q.id}
                            disabled={isAnswered || !!currentQuestion}
                            onClick={() => openQuestion(category.id, q)}
                            className={`flex-1 flex items-center justify-center text-3xl md:text-5xl font-display transition-all duration-300
                            ${isAnswered 
                                ? 'bg-blue-900/20 text-blue-900/20 cursor-default' 
                                : 'bg-jeopardy-blue text-jeopardy-gold hover:bg-blue-700 hover:text-white cursor-pointer shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]'
                            }
                            `}
                        >
                            {isAnswered ? '' : `$${q.points}`}
                        </button>
                        );
                    })}
                    </div>
                ))}
           </div>
        </div>
      </div>
    </div>
  );
};
