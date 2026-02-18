import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question, Team } from '../../types';
import { useComms } from '../../services/comms';
import { soundService } from '../../services/sound';
import { Users, Lock, Unlock, Check, X, ArrowRight, LogOut, Wifi, Shield, Eye, Clock, Play, Trophy, Maximize } from 'lucide-react';

interface HostGameViewProps {
  board: GameBoard;
  lobbyCode: string;
  onExit: () => void;
}

const ScoreDisplay: React.FC<{ score: number; className?: string }> = ({ score, className }) => {
    return (
        <span className={className}>
            {score < 0 ? '-' : ''}${Math.abs(score)}
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
  const [phase, setPhase] = useState<GamePhase>(GamePhase.LOBBY);
  
  // Timer State
  const [timer, setTimer] = useState<number | null>(null);
  const [timerMode, setTimerMode] = useState<'BUZZ' | 'ANSWER' | null>(null);
  const timerIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Lockout State
  const [blockedPlayerIds, setBlockedPlayerIds] = useState<string[]>([]);
  const [blockedTeamIds, setBlockedTeamIds] = useState<string[]>([]);
  
  // QR Code
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isQrExpanded, setIsQrExpanded] = useState(false);

  // Generate QR Code on mount
  useEffect(() => {
    const url = `${window.location.origin}?code=${lobbyCode}`;
    QRCode.toDataURL(url, { 
        width: 512, // Increased resolution for larger display
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }).then(setQrCodeDataUrl);
  }, [lobbyCode]);

  // Handle Timer Tick
  useEffect(() => {
      if (timer !== null && timer > 0) {
          timerIntervalRef.current = setTimeout(() => {
              setTimer(prev => (prev !== null && prev > 0) ? prev - 1 : 0);
          }, 1000);
      } else if (timer === 0) {
          soundService.play('TIME_UP');
          setTimer(null); 
      }
      return () => {
          if (timerIntervalRef.current) clearTimeout(timerIntervalRef.current);
      };
  }, [timer]);

  // Sync Timer updates lightly
  useEffect(() => {
      if (timer !== null) {
          sendMessage({
              type: 'TIME_SYNC',
              payload: { timer, timerMode }
          });
      }
  }, [timer, timerMode]);

  const { sendMessage } = useComms(lobbyCode, 'HOST', (msg: CommsMessage) => {
    if (msg.type === 'PLAYER_JOIN') {
      setPlayers(prev => {
        if (prev.find(p => p.id === msg.payload.id)) return prev;
        return [...prev, { ...msg.payload, score: 0 }];
      });
      soundService.play('BUZZ');
    }
    
    if (msg.type === 'BUZZ') {
      if (!buzzLocked && !buzzedPlayerId) {
        // Check blocks
        const isPlayerBlocked = blockedPlayerIds.includes(msg.payload.playerId);
        let isTeamBlocked = false;
        if (isTeamsMode) {
            const team = teams.find(t => t.members.includes(msg.payload.playerId));
            if (team && blockedTeamIds.includes(team.id)) isTeamBlocked = true;
        }

        if (!isPlayerBlocked && !isTeamBlocked) {
            setBuzzedPlayerId(msg.payload.playerId);
            setBuzzLocked(true);
            soundService.play('BUZZ');
            
            // TIMER: Switch to 5 second answer timer
            setTimerMode('ANSWER');
            setTimer(5);
        }
      }
    }

    if (msg.type === 'CREATE_TEAM') {
        setTeams(prev => [
            ...prev, 
            { id: Math.random().toString(36).substr(2, 9), name: msg.payload.name, score: 0, members: [msg.payload.playerId] }
        ]);
    }

    if (msg.type === 'JOIN_TEAM') {
        setTeams(prev => prev.map(team => {
            if (team.members.includes(msg.payload.playerId)) {
                return { ...team, members: team.members.filter(id => id !== msg.payload.playerId) };
            }
            if (team.id === msg.payload.teamId) {
                return { ...team, members: [...team.members, msg.payload.playerId] };
            }
            return team;
        }));
    }
  });

  // Sync State
  useEffect(() => {
    const gameState: GameState = {
      lobbyCode,
      phase,
      currentQuestionId: currentQuestion?.q.id || null,
      currentCategoryId: currentQuestion?.catId || null,
      answeredQuestions,
      buzzedPlayerId,
      buzzLocked,
      players,
      board,
      isTeamsMode,
      teams,
      blockedPlayerIds,
      blockedTeamIds,
      timer,
      timerMode
    };

    sendMessage({ type: 'HOST_SYNC', payload: gameState });
  }, [
      phase, 
      currentQuestion, 
      buzzedPlayerId, 
      buzzLocked, 
      players, 
      answeredQuestions, 
      isTeamsMode, 
      teams, 
      blockedPlayerIds, 
      blockedTeamIds
  ]);

  const startGame = () => {
    setPhase(GamePhase.BOARD);
    soundService.play('BOARD_FILL');
  };

  const handleQuestionSelect = (catId: string, q: Question) => {
    if (answeredQuestions.includes(q.id)) return;
    setCurrentQuestion({ catId, q });
    setPhase(GamePhase.QUESTION);
    setBuzzedPlayerId(null);
    setBuzzLocked(true); 
    setBlockedPlayerIds([]); 
    setBlockedTeamIds([]);
    setTimer(null); 
    setTimerMode(null);
    
    if (q.isDailyDouble) {
        soundService.play('DAILY_DOUBLE');
    }
  };

  const handleUnlockBuzzers = () => {
    setBuzzLocked(false);
    setTimerMode('BUZZ');
    setTimer(10);
  };

  const handleCorrect = () => {
    if (!currentQuestion || !buzzedPlayerId) return;

    soundService.play('CORRECT');
    const points = currentQuestion.q.points;
    const catTitle = board.categories.find(c => c.id === currentQuestion.catId)?.title || "Unknown";

    if (isTeamsMode) {
        const team = teams.find(t => t.members.includes(buzzedPlayerId));
        if (team) {
            setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: t.score + points } : t));
        }
    } else {
        setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score + points } : p));
    }

    sendMessage({ 
        type: 'RESULT_EVENT', 
        payload: { 
            playerId: buzzedPlayerId, 
            correct: true, 
            points, 
            categoryTitle: catTitle,
            isDailyDouble: !!currentQuestion.q.isDailyDouble
        } 
    });

    setAnsweredQuestions(prev => [...prev, currentQuestion.q.id]);
    setPhase(GamePhase.BOARD);
    setCurrentQuestion(null);
    setBuzzedPlayerId(null);
    setTimer(null);
  };

  const handleWrong = () => {
    if (!currentQuestion || !buzzedPlayerId) return;

    soundService.play('WRONG');
    const points = currentQuestion.q.points;
    const catTitle = board.categories.find(c => c.id === currentQuestion.catId)?.title || "Unknown";

    if (isTeamsMode) {
        const team = teams.find(t => t.members.includes(buzzedPlayerId));
        if (team) {
             setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: t.score - points } : t));
             setBlockedTeamIds(prev => [...prev, team.id]);
        }
    } else {
        setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score - points } : p));
        setBlockedPlayerIds(prev => [...prev, buzzedPlayerId]);
    }

    sendMessage({ 
        type: 'RESULT_EVENT', 
        payload: { 
            playerId: buzzedPlayerId, 
            correct: false, 
            points, 
            categoryTitle: catTitle,
            isDailyDouble: !!currentQuestion.q.isDailyDouble
        } 
    });

    setBuzzedPlayerId(null);
    setBuzzLocked(false);
    setTimerMode('BUZZ');
    setTimer(10);
  };

  const handleSkip = () => {
    if (!currentQuestion) return;
    setAnsweredQuestions(prev => [...prev, currentQuestion.q.id]);
    setPhase(GamePhase.BOARD);
    setCurrentQuestion(null);
    setBuzzedPlayerId(null);
    setTimer(null);
  };

  const getBuzzedName = () => {
      if (!buzzedPlayerId) return '';
      const player = players.find(p => p.id === buzzedPlayerId);
      return player ? player.name : 'Unknown';
  };

  const getBuzzedTeamName = () => {
      if (!buzzedPlayerId || !isTeamsMode) return '';
      const team = teams.find(t => t.members.includes(buzzedPlayerId));
      return team ? team.name : '';
  };

  const TimerBar = () => {
      if (timer === null) return null;
      const maxTime = timerMode === 'BUZZ' ? 10 : 5;
      const percentage = (timer / maxTime) * 100;
      let colorClass = 'bg-green-500';
      if (percentage <= 40) colorClass = 'bg-yellow-500';
      if (percentage <= 20) colorClass = 'bg-red-600 animate-pulse';

      return (
          <div className="w-full h-4 bg-gray-800 rounded-full mt-4 overflow-hidden border border-gray-600">
              <div 
                  className={`h-full transition-all duration-1000 ease-linear ${colorClass}`} 
                  style={{ width: `${percentage}%` }}
              ></div>
          </div>
      );
  };

  // --- LAYOUT ---

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans">
      
      {/* LEFT SIDEBAR: PARTICIPANTS & STATS */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col shadow-2xl z-20">
          
          {/* Header */}
          <div className="p-6 border-b border-gray-700 bg-gray-800">
              <div className="flex items-center gap-3 text-jeopardy-gold mb-2">
                  <Wifi className="animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Lobby Code</span>
              </div>
              <div className="text-5xl font-mono font-bold text-white tracking-widest mb-4">
                  {lobbyCode}
              </div>
              <button onClick={onExit} className="flex items-center gap-2 text-gray-400 hover:text-red-400 text-sm transition-colors">
                  <LogOut size={14} /> End Game
              </button>
          </div>

          {/* Players / Teams List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex justify-between items-center mb-2 px-2">
                  <h3 className="text-xs font-bold uppercase text-gray-500">
                      {isTeamsMode ? 'Teams' : 'Players'} ({isTeamsMode ? teams.length : players.length})
                  </h3>
                  {phase === GamePhase.LOBBY && (
                      <button 
                        onClick={() => setIsTeamsMode(!isTeamsMode)}
                        className="text-xs text-blue-400 hover:text-white"
                      >
                          {isTeamsMode ? 'Switch to Solo' : 'Switch to Teams'}
                      </button>
                  )}
              </div>

              {(isTeamsMode ? teams : players)
                  .sort((a, b) => b.score - a.score)
                  .map((p) => {
                      const isBuzzed = buzzedPlayerId && (isTeamsMode ? (p as Team).members.includes(buzzedPlayerId) : p.id === buzzedPlayerId);
                      const isBlocked = isTeamsMode 
                          ? blockedTeamIds.includes(p.id) 
                          : blockedPlayerIds.includes(p.id);

                      return (
                        <div 
                            key={p.id} 
                            className={`
                                relative p-4 rounded-xl border-2 transition-all duration-300
                                ${isBuzzed ? 'bg-jeopardy-gold border-white scale-105 shadow-xl text-black' : 'bg-gray-700/50 border-gray-600 text-white'}
                                ${isBlocked ? 'opacity-50 grayscale' : ''}
                            `}
                        >
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="font-bold text-lg leading-tight mb-1">{p.name}</div>
                                    {isTeamsMode && (
                                        <div className="text-xs opacity-70">
                                            {(p as Team).members.length} members
                                        </div>
                                    )}
                                </div>
                                <div className={`font-mono text-xl font-bold ${isBuzzed ? 'text-black' : (p.score >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                                    <ScoreDisplay score={p.score} />
                                </div>
                            </div>
                            
                            {isBuzzed && (
                                <div className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce shadow-sm">
                                    BUZZ!
                                </div>
                            )}
                        </div>
                      )
              })}
              
              {players.length === 0 && (
                  <div className="text-center p-8 text-gray-600 italic">
                      Waiting for players to join...
                  </div>
              )}
          </div>
          
          {/* QR Code Toggle / Footer */}
          {phase === GamePhase.LOBBY && qrCodeDataUrl && (
              <div 
                className="p-4 bg-white text-center border-t border-gray-700 cursor-pointer hover:bg-gray-100 transition-colors group"
                onClick={() => setIsQrExpanded(true)}
              >
                  <div className="flex items-center justify-center gap-2 text-black text-xs font-bold mb-2 uppercase">
                      <span>Scan to Join</span>
                      <Maximize size={12} className="text-gray-400 group-hover:text-black" />
                  </div>
                  <img src={qrCodeDataUrl} className="w-32 h-32 mx-auto" alt="QR Code" />
              </div>
          )}
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 relative bg-gray-900 flex flex-col">
          
          {/* PHASE: LOBBY */}
          {phase === GamePhase.LOBBY && (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gradient-to-br from-blue-900/20 to-black">
                  <h1 className="text-7xl font-display text-jeopardy-gold mb-6 drop-shadow-lg tracking-wider">
                      {board.title}
                  </h1>
                  <p className="text-2xl text-blue-200 mb-12 max-w-2xl leading-relaxed font-light">
                      Join the game using the code on the left!
                  </p>
                  <button 
                      onClick={startGame}
                      className="group relative px-12 py-6 bg-green-600 hover:bg-green-500 text-white font-bold text-2xl rounded-2xl shadow-2xl hover:scale-105 transition-all flex items-center gap-4"
                  >
                      <div className="p-2 bg-green-700 rounded-full group-hover:bg-green-600 transition-colors">
                        <Play fill="white" size={24} />
                      </div>
                      Start Game
                  </button>
              </div>
          )}

          {/* PHASE: BOARD */}
          {phase === GamePhase.BOARD && (
             <div className="flex-1 p-6 overflow-y-auto">
                 <div className="grid gap-4 h-full" style={{ gridTemplateColumns: `repeat(${board.categories.length}, 1fr)` }}>
                     {board.categories.map(cat => (
                         <div key={cat.id} className="flex flex-col gap-4">
                             {/* Category Header */}
                             <div className="bg-blue-900 text-white font-display text-center py-4 text-xl md:text-2xl uppercase shadow-lg rounded-lg flex items-center justify-center h-28 border-2 border-blue-700">
                                 {cat.title}
                             </div>
                             {/* Questions */}
                             {cat.questions.map(q => {
                                 const isAnswered = answeredQuestions.includes(q.id);
                                 return (
                                     <button
                                        key={q.id}
                                        disabled={isAnswered}
                                        onClick={() => handleQuestionSelect(cat.id, q)}
                                        className={`
                                            flex-1 font-display text-4xl md:text-5xl text-jeopardy-gold rounded-lg shadow-md transition-all duration-200 flex items-center justify-center min-h-[100px] border-2
                                            ${isAnswered 
                                                ? 'bg-blue-900/20 text-transparent cursor-default border-transparent' 
                                                : 'bg-blue-900/40 border-blue-600 hover:bg-blue-800 hover:scale-[1.02] hover:shadow-jeopardy-gold/20 cursor-pointer'
                                            }
                                        `}
                                     >
                                         {!isAnswered && `$${q.points}`}
                                     </button>
                                 )
                             })}
                         </div>
                     ))}
                 </div>
             </div>
          )}

          {/* PHASE: QUESTION / ANSWER (OVERLAY) */}
          {currentQuestion && (
              <div className="absolute inset-0 bg-gray-900/95 backdrop-blur-md z-30 flex flex-col items-center justify-center p-12 animate-in fade-in zoom-in-95 duration-200">
                   <div className="max-w-6xl w-full flex flex-col items-center">
                       {/* Header Info */}
                       <div className="flex items-center gap-4 mb-8 text-blue-300 font-bold uppercase tracking-widest text-xl">
                           <span>{board.categories.find(c => c.id === currentQuestion.catId)?.title}</span>
                           <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                           <span className="text-jeopardy-gold">${currentQuestion.q.points}</span>
                       </div>

                       {/* Main Question Card */}
                       <div className="bg-blue-900 rounded-3xl p-12 shadow-2xl border border-blue-700 w-full text-center mb-8 relative overflow-hidden">
                           {/* BG Decoration */}
                           <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-jeopardy-gold to-blue-500"></div>
                           
                           {currentQuestion.q.image && (
                               <img src={currentQuestion.q.image} className="max-h-[300px] mx-auto mb-8 rounded-lg shadow-lg" />
                           )}
                           
                           <h2 className="text-4xl md:text-6xl font-display uppercase leading-tight text-white drop-shadow-md">
                               {currentQuestion.q.question}
                           </h2>
                       </div>
                       
                       {/* Timer & Buzzer State */}
                       <div className="w-full max-w-3xl mb-8">
                           {timer !== null && (
                               <div className="mb-6">
                                    <div className="flex justify-between text-sm uppercase font-bold text-gray-400 mb-2">
                                        <span>{timerMode === 'BUZZ' ? 'Time to Buzz' : 'Time to Answer'}</span>
                                        <span>{timer}s</span>
                                    </div>
                                    <TimerBar />
                               </div>
                           )}
                           
                           {/* Status Indicator */}
                           <div className="flex justify-center">
                               {buzzedPlayerId ? (
                                   <div className="bg-white text-black px-8 py-4 rounded-full font-bold text-2xl animate-pulse shadow-[0_0_30px_rgba(255,255,255,0.3)] flex items-center gap-3">
                                       <div className="w-4 h-4 bg-red-600 rounded-full animate-ping"></div>
                                       {isTeamsMode ? `${getBuzzedTeamName()} (${getBuzzedName()})` : getBuzzedName()}
                                   </div>
                               ) : (
                                   <div className={`px-8 py-4 rounded-full font-bold text-xl border-2 flex items-center gap-3 ${buzzLocked ? 'border-red-500/50 text-red-400 bg-red-900/10' : 'border-green-500 text-green-400 bg-green-900/10 animate-bounce'}`}>
                                       {buzzLocked ? <Lock size={20} /> : <Unlock size={20} />}
                                       {buzzLocked ? 'BUZZERS LOCKED' : 'BUZZERS OPEN'}
                                   </div>
                               )}
                           </div>
                       </div>

                       {/* Controls */}
                       <div className="grid grid-cols-3 gap-6 w-full max-w-4xl">
                           {/* Left: Reveal / Back */}
                           <div className="flex gap-2">
                               <button onClick={() => setCurrentQuestion(prev => prev ? { ...prev, q: { ...prev.q, question: `Answer: ${prev.q.answer}` }} : null)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold p-4 flex items-center justify-center gap-2 transition-colors">
                                   <Eye size={20} /> Reveal
                               </button>
                               <button onClick={handleSkip} className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold p-4 transition-colors">
                                   <ArrowRight size={20} />
                               </button>
                           </div>

                           {/* Center: Open Buzzers (Space) */}
                           <button 
                               onClick={handleUnlockBuzzers} 
                               disabled={!buzzLocked || !!buzzedPlayerId}
                               className="col-span-1 bg-jeopardy-gold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl text-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                           >
                               <Unlock size={24} /> OPEN
                           </button>

                           {/* Right: Scoring */}
                           <div className="flex gap-2">
                               <button 
                                   onClick={handleCorrect}
                                   disabled={!buzzedPlayerId}
                                   className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
                               >
                                   <Check size={24} /> Correct
                               </button>
                               <button 
                                   onClick={handleWrong}
                                   disabled={!buzzedPlayerId}
                                   className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-colors"
                               >
                                   <X size={24} /> Wrong
                               </button>
                           </div>
                       </div>
                   </div>
              </div>
          )}

      </div>

      {/* EXPANDED QR MODAL */}
      {isQrExpanded && qrCodeDataUrl && (
          <div 
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setIsQrExpanded(false)}
          >
              <div className="bg-white p-8 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200 cursor-default" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">JOIN GAME</h2>
                  <p className="text-gray-500 mb-6 uppercase text-sm font-bold tracking-wider">Scan with camera</p>
                  
                  <img src={qrCodeDataUrl} className="w-[60vh] h-[60vh] max-w-full object-contain mb-8 border-4 border-black rounded-xl" alt="Large QR" />
                  
                  <div className="flex items-center gap-4 bg-gray-100 px-8 py-4 rounded-2xl border-2 border-gray-200">
                      <div className="text-right">
                          <p className="text-xs font-bold text-gray-400 uppercase">Lobby Code</p>
                          <p className="text-5xl font-mono font-bold text-jeopardy-blue tracking-widest">{lobbyCode}</p>
                      </div>
                  </div>

                  <button 
                    onClick={() => setIsQrExpanded(false)}
                    className="mt-8 text-gray-400 hover:text-black flex items-center gap-2 transition-colors"
                  >
                      <X size={20} /> Close
                  </button>
              </div>
          </div>
      )}
    </div>
  );
};