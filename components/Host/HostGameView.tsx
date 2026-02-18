import React, { useState, useEffect, useCallback, useRef } from 'react';
import QRCode from 'qrcode';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question, Team } from '../../types';
import { useComms } from '../../services/comms';
import { soundService } from '../../services/sound';
import { Users, Lock, Unlock, Check, X, ArrowRight, Copy, LogOut, Wifi, WifiOff, Star, DollarSign, Link, Shield, Trash2, Eye, Trophy, Target, Zap, TrendingDown, Clock } from 'lucide-react';

interface HostGameViewProps {
  board: GameBoard;
  lobbyCode: string;
  onExit: () => void;
}

// Stats tracking for the current session
interface SessionStats {
    buzzes: number;
    correct: number;
    wrong: number;
    dailyDoubles: number;
    accuracy: number;
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

  // Generate QR Code on mount
  useEffect(() => {
    const url = `${window.location.origin}?code=${lobbyCode}`;
    QRCode.toDataURL(url, { 
        width: 256,
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
          // We DO NOT auto-lock. We just play the sound and let the host decide.
          // But we stop the timer to avoid spamming.
          setTimer(null); 
      }
      return () => {
          if (timerIntervalRef.current) clearTimeout(timerIntervalRef.current);
      };
  }, [timer]);

  // Sync Timer updates lightly
  useEffect(() => {
      // Send a lightweight sync when timer changes to keep clients roughly in sync
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
        
        // Check if player is blocked
        const isPlayerBlocked = blockedPlayerIds.includes(msg.payload.playerId);
        
        // Check if team is blocked
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
            // Remove from old team if exists (though UI prevents this usually)
            if (team.members.includes(msg.payload.playerId)) {
                return { ...team, members: team.members.filter(id => id !== msg.payload.playerId) };
            }
            // Add to new team
            if (team.id === msg.payload.teamId) {
                return { ...team, members: [...team.members, msg.payload.playerId] };
            }
            return team;
        }));
    }
  });

  // Sync State to Players whenever it changes significantly
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
      blockedTeamIds,
      // Timer is synced separately via TIME_SYNC to avoid spamming the full state
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
    setBuzzLocked(true); // Locked until host opens it
    setBlockedPlayerIds([]); // Reset blocks for new question
    setBlockedTeamIds([]);
    setTimer(null); // Reset timer
    setTimerMode(null);
    
    if (q.isDailyDouble) {
        soundService.play('DAILY_DOUBLE');
    }
  };

  const handleUnlockBuzzers = () => {
    setBuzzLocked(false);
    // TIMER: Start 10 second countdown for someone to buzz
    setTimerMode('BUZZ');
    setTimer(10);
  };

  const handleCorrect = () => {
    if (!currentQuestion || !buzzedPlayerId) return;

    soundService.play('CORRECT');
    const points = currentQuestion.q.points;
    const catTitle = board.categories.find(c => c.id === currentQuestion.catId)?.title || "Unknown";

    if (isTeamsMode) {
        // Find team
        const team = teams.find(t => t.members.includes(buzzedPlayerId));
        if (team) {
            setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: t.score + points } : t));
        }
    } else {
        // Solo
        setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score + points } : p));
    }

    // Send Result Event to Players (for stats)
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

    // Close Question
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
             // Block team
             setBlockedTeamIds(prev => [...prev, team.id]);
        }
    } else {
        setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score - points } : p));
        // Block player
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

    // Re-open buzzers for others
    setBuzzedPlayerId(null);
    setBuzzLocked(false);
    
    // TIMER: Restart 10s buzz timer for others
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

  const handleEndGame = () => {
      if (window.confirm("End the game and show final results?")) {
          setPhase(GamePhase.GAME_OVER);
          
          // Calculate Winners
          let highestScore = -Infinity;
          let winners: string[] = [];

          if (isTeamsMode) {
              teams.forEach(t => {
                  if (t.score > highestScore) highestScore = t.score;
              });
              // Get all members of winning teams
              teams.filter(t => t.score === highestScore).forEach(t => {
                  winners.push(...t.members);
              });
          } else {
              players.forEach(p => {
                  if (p.score > highestScore) highestScore = p.score;
              });
              players.filter(p => p.score === highestScore).forEach(p => {
                  winners.push(p.id);
              });
          }

          sendMessage({ type: 'GAME_OVER_SUMMARY', payload: { winners } });
      }
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

  // --- RENDER HELPERS ---

  // Timer Bar Component
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

  if (phase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white flex flex-col p-8">
        <div className="flex justify-between items-start mb-12">
           <div>
               <h1 className="text-6xl font-display text-jeopardy-gold mb-2">{board.title}</h1>
               <div className="flex items-center gap-4">
                    <div className="bg-gray-800 px-6 py-3 rounded-xl border border-blue-500 flex items-center gap-4">
                        <span className="text-gray-400 uppercase text-sm font-bold tracking-wider">Lobby Code</span>
                        <span className="text-5xl font-mono font-bold tracking-widest text-white">{lobbyCode}</span>
                    </div>
                    
                    {/* QR CODE SECTION */}
                    {qrCodeDataUrl && (
                        <div className="bg-white p-2 rounded-xl">
                            <img src={qrCodeDataUrl} alt="Join Game QR" className="w-24 h-24" />
                        </div>
                    )}
               </div>
               <p className="mt-4 text-blue-300 flex items-center gap-2">
                   <ArrowRight size={16} /> Join at <span className="text-white font-mono">{window.location.host}</span>
                   or scan the QR code
               </p>
           </div>
           
           <div className="flex gap-4">
                <button 
                    onClick={() => setIsTeamsMode(!isTeamsMode)}
                    className={`px-6 py-3 rounded-lg font-bold flex items-center gap-2 transition-all ${isTeamsMode ? 'bg-jeopardy-gold text-blue-900' : 'bg-gray-800 text-gray-400'}`}
                >
                    <Shield size={20} />
                    {isTeamsMode ? 'Teams Mode: ON' : 'Teams Mode: OFF'}
                </button>
                <button 
                    onClick={startGame}
                    className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg text-xl flex items-center gap-2"
                >
                    <Play size={24} /> Start Game
                </button>
           </div>
        </div>

        <div className="flex-1 grid grid-cols-2 gap-8">
            {/* Players List */}
            <div className="bg-black/30 rounded-2xl p-6 border border-white/10 overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                    <Users className="text-blue-400" /> 
                    Players ({players.length})
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                    {players.map(p => (
                        <div key={p.id} className="bg-gray-800 p-3 rounded-lg flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold">
                                {p.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate font-medium">{p.name}</span>
                        </div>
                    ))}
                    {players.length === 0 && <p className="text-gray-500 italic">Waiting for players...</p>}
                </div>
            </div>
            
            {/* Teams Preview (If Active) */}
            {isTeamsMode && (
                 <div className="bg-black/30 rounded-2xl p-6 border border-white/10 overflow-y-auto">
                    <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                        <Shield className="text-jeopardy-gold" /> 
                        Teams ({teams.length})
                    </h2>
                     <div className="space-y-3">
                        {teams.map(t => (
                             <div key={t.id} className="bg-blue-900/40 border border-blue-500/30 p-4 rounded-xl">
                                 <div className="flex justify-between items-center mb-2">
                                     <span className="font-bold text-lg">{t.name}</span>
                                     <span className="text-xs bg-blue-800 px-2 py-1 rounded text-blue-200">{t.members.length} Members</span>
                                 </div>
                                 <div className="flex flex-wrap gap-1">
                                     {t.members.map(mid => {
                                         const p = players.find(pl => pl.id === mid);
                                         return p ? (
                                             <span key={mid} className="text-xs bg-black/40 px-2 py-1 rounded text-gray-300">{p.name}</span>
                                         ) : null;
                                     })}
                                 </div>
                             </div>
                        ))}
                         {teams.length === 0 && <p className="text-gray-500 italic">Players can create teams on their phones.</p>}
                     </div>
                 </div>
            )}
        </div>
      </div>
    );
  }
  
  // RENDER BOARD / QUESTION / GAME OVER...
  // (Reusing simplified structure for brevity where logic didn't change heavily, but focusing on Timer UI)

  if (phase === GamePhase.GAME_OVER) {
       return (
           <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
               <h1 className="text-6xl font-display text-jeopardy-gold mb-8">FINAL STANDINGS</h1>
               <div className="w-full max-w-4xl space-y-4">
                   {(isTeamsMode ? teams : players)
                    .sort((a, b) => b.score - a.score)
                    .map((participant, index) => (
                        <div key={participant.id} className={`flex items-center justify-between p-6 rounded-xl border ${index === 0 ? 'bg-jeopardy-gold text-black border-yellow-500 scale-105 shadow-2xl' : 'bg-gray-800 border-gray-700'}`}>
                            <div className="flex items-center gap-4">
                                <span className="font-mono text-2xl font-bold opacity-50">#{index + 1}</span>
                                <span className="text-3xl font-bold">{participant.name}</span>
                            </div>
                            <span className="font-mono text-4xl font-bold">
                                {participant.score < 0 ? '-' : ''}${Math.abs(participant.score)}
                            </span>
                        </div>
                    ))}
               </div>
               <button onClick={onExit} className="mt-12 bg-gray-700 hover:bg-gray-600 text-white px-8 py-3 rounded-lg font-bold flex items-center gap-2">
                   <LogOut /> Exit Game
               </button>
           </div>
       )
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Top Bar */}
      <div className="bg-gray-900 border-b border-gray-800 p-2 flex justify-between items-center px-4">
          <div className="flex gap-4">
              <button onClick={onExit} className="text-gray-400 hover:text-white"><LogOut size={20} /></button>
              <div className="flex items-center gap-2 text-jeopardy-gold font-mono">
                  <Wifi size={16} />
                  <span>{lobbyCode}</span>
              </div>
          </div>
          <div className="flex gap-4 overflow-x-auto max-w-[60vw] scrollbar-hide">
              {(isTeamsMode ? teams : players).sort((a,b) => b.score - a.score).map(p => (
                  <div key={p.id} className={`flex flex-col items-center px-3 py-1 rounded ${buzzedPlayerId && (isTeamsMode ? (p as Team).members.includes(buzzedPlayerId) : p.id === buzzedPlayerId) ? 'bg-white text-black' : 'bg-gray-800'}`}>
                      <span className="text-xs font-bold truncate max-w-[80px]">{p.name}</span>
                      <ScoreDisplay score={p.score} className="font-mono text-sm" />
                  </div>
              ))}
          </div>
      </div>

      <div className="flex-1 relative">
         {phase === GamePhase.BOARD ? (
             <div className="h-full flex flex-col p-4">
                 <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${board.categories.length}, 1fr)` }}>
                     {board.categories.map(cat => (
                         <div key={cat.id} className="flex flex-col gap-2">
                             <div className="bg-blue-900 text-white font-display text-center py-4 text-xl md:text-2xl uppercase shadow-lg border-b-4 border-black items-center justify-center flex h-24 overflow-hidden leading-tight break-words px-1">
                                 {cat.title}
                             </div>
                             {cat.questions.map(q => {
                                 const isAnswered = answeredQuestions.includes(q.id);
                                 return (
                                     <button
                                        key={q.id}
                                        disabled={isAnswered}
                                        onClick={() => handleQuestionSelect(cat.id, q)}
                                        className={`
                                            flex-1 font-display text-3xl md:text-5xl text-jeopardy-gold shadow-lg transition-all duration-300
                                            ${isAnswered ? 'bg-blue-900/20 text-transparent cursor-default' : 'bg-blue-900 hover:bg-blue-800 hover:scale-[1.02] cursor-pointer'}
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
         ) : (
             currentQuestion && (
                 <div className="absolute inset-0 bg-blue-900 flex flex-col items-center justify-center p-12 text-center">
                     <div className="max-w-5xl w-full">
                         {/* Category & Value Header */}
                         <div className="mb-8 text-blue-300 font-bold uppercase tracking-widest text-xl">
                             {board.categories.find(c => c.id === currentQuestion.catId)?.title} - ${currentQuestion.q.points}
                         </div>

                         {/* QUESTION CONTENT */}
                         <div className="min-h-[300px] flex flex-col items-center justify-center mb-8">
                             {currentQuestion.q.image && (
                                 <img src={currentQuestion.q.image} className="max-h-[400px] object-contain mb-6 rounded-lg shadow-2xl" />
                             )}
                             <h2 className="text-4xl md:text-6xl font-display uppercase leading-tight drop-shadow-md">
                                 {currentQuestion.q.question}
                             </h2>
                         </div>
                         
                         {/* TIMER VISUAL */}
                         {timer !== null && (
                             <div className="mb-8">
                                 <div className="flex justify-between text-sm uppercase font-bold text-gray-400 mb-1">
                                     <span>{timerMode === 'BUZZ' ? 'Time to Buzz' : 'Time to Answer'}</span>
                                     <span>{timer}s</span>
                                 </div>
                                 <TimerBar />
                             </div>
                         )}

                         {/* CONTROLS */}
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                             {/* LEFT: BUZZER STATUS */}
                             <div className="flex items-center justify-center">
                                 {buzzedPlayerId ? (
                                     <div className="bg-white text-black p-6 rounded-xl animate-pulse w-full">
                                         <span className="block text-sm uppercase text-gray-500 font-bold">Buzzed In</span>
                                         <h3 className="text-3xl font-bold truncate">
                                             {isTeamsMode ? `${getBuzzedTeamName()} (${getBuzzedName()})` : getBuzzedName()}
                                         </h3>
                                     </div>
                                 ) : (
                                     <div className={`w-full p-6 rounded-xl border-2 text-center ${buzzLocked ? 'border-red-500 bg-red-900/20 text-red-500' : 'border-green-500 bg-green-900/20 text-green-500'}`}>
                                         {buzzLocked ? <div className="flex items-center justify-center gap-2 font-bold"><Lock /> LOCKED</div> : <div className="flex items-center justify-center gap-2 font-bold"><Unlock /> OPEN</div>}
                                     </div>
                                 )}
                             </div>

                             {/* CENTER: HOST ACTIONS */}
                             <div className="flex flex-col gap-2 justify-center">
                                 {buzzedPlayerId ? (
                                     <div className="flex gap-2 w-full h-16">
                                         <button onClick={handleCorrect} className="flex-1 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-xl shadow-lg">Correct</button>
                                         <button onClick={handleWrong} className="flex-1 bg-red-600 hover:bg-red-500 rounded-lg font-bold text-xl shadow-lg">Wrong</button>
                                     </div>
                                 ) : (
                                     <button 
                                        onClick={handleUnlockBuzzers} 
                                        disabled={!buzzLocked}
                                        className="w-full h-16 bg-jeopardy-gold hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold text-xl rounded-lg shadow-lg flex items-center justify-center gap-2"
                                     >
                                         <Unlock size={24} /> OPEN BUZZERS (Space)
                                     </button>
                                 )}
                             </div>

                             {/* RIGHT: NAVIGATION */}
                             <div className="flex items-center justify-center gap-2">
                                 <button onClick={() => setCurrentQuestion(prev => prev ? { ...prev, q: { ...prev.q, question: `Answer: ${prev.q.answer}` }} : null)} className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold" title="Reveal Answer"><Eye /></button>
                                 <button onClick={handleSkip} className="p-4 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold" title="Skip/Back"><ArrowRight /></button>
                             </div>
                         </div>
                     </div>
                 </div>
             )
         )}
      </div>
    </div>
  );
};

// Keyboard listener for Spacebar to unlock
function Play(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> }