import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question, Team } from '../../types';
import { useComms } from '../../services/comms';
import { soundService } from '../../services/sound';
import { Users, Lock, Unlock, Check, X, ArrowRight, LogOut, Wifi, Shield, Eye, Clock, Play, Trophy, Maximize, RotateCcw, BarChart2, Zap, Brain, AlertTriangle, TrendingUp, Medal, Mic, MicOff, Sparkles, Youtube, StopCircle, UserMinus } from 'lucide-react';

interface HostGameViewProps {
  board: GameBoard;
  lobbyCode: string;
  onExit: () => void;
}

interface GameEvent {
    id: string;
    type: 'CORRECT' | 'WRONG';
    playerId: string;
    points: number;
    timestamp: number;
    questionValue: number;
}

const ScoreDisplay: React.FC<{ score: number; className?: string }> = ({ score, className }) => {
    return (
        <span className={className}>
            {score < 0 ? '-' : ''}${Math.abs(score)}
        </span>
    );
};

// --- HELPER FOR YOUTUBE ---
const getYoutubeId = (url: string | undefined) => {
    if (!url) return null;
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
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
  
  // Undo / Stats State
  const [gameEvents, setGameEvents] = useState<GameEvent[]>([]);
  const [lastAction, setLastAction] = useState<{
      type: 'CORRECT' | 'WRONG';
      playerId: string;
      points: number;
      questionId: string;
      playerName: string;
      eventId: string;
  } | null>(null);
  const lastActionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI State
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [showDetailedStats, setShowDetailedStats] = useState(false); 

  // --- AUDIO STATE ---
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // --- SPEECH RECOGNITION STATE ---
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Generate QR Code on mount
  useEffect(() => {
    const url = `${window.location.origin}?code=${lobbyCode}`;
    QRCode.toDataURL(url, { 
        width: 512, 
        margin: 2,
        color: {
            dark: '#000000',
            light: '#ffffff'
        }
    }).then(setQrCodeDataUrl);
  }, [lobbyCode]);

  // Clean up on unmount or when question changes
  useEffect(() => {
      return () => {
          stopListening();
      }
  }, []);

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

  // --- AUTO START LISTENING EFFECT ---
  useEffect(() => {
    // Only auto-start if:
    // 1. We are in Question Phase
    // 2. We have a question loaded
    // 3. Buzzers are still locked (meaning we haven't opened them yet)
    if (phase === GamePhase.QUESTION && currentQuestion && buzzLocked) {
        const hasText = currentQuestion.q.question && currentQuestion.q.question.trim().length > 0;

        if (!hasText) {
             // Case: Image Only / No Text -> Auto-open buzzers
             // We use a timeout to allow the transition animation to play out (e.g. 1.5s)
             const timer = setTimeout(() => {
                 handleUnlockBuzzers();
             }, 1500);
             return () => clearTimeout(timer);
        } else if (!isListening) {
            // Case: Has Text -> Use Speech Recognition
            startListening();
        }
    }
  }, [phase, currentQuestion, buzzLocked]);

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
            stopListening(); // Stop listening if someone buzzes
            setIsPlayingAudio(false); // Stop YouTube audio on buzz
            
            // Send fast update to lock screens immediately
            sendMessage({ type: 'BUZZER_STATUS', payload: { isOpen: false } });

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
      // OPTIMIZATION: Send null instead of board. The board contains large image data (base64)
      // which slows down the sync considerably. Players do not need the board data to play.
      board: null, 
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

  const handleEndGame = () => {
      if (window.confirm("Are you sure you want to end the game?")) {
          setPhase(GamePhase.GAME_OVER);
          stopListening();
          setIsPlayingAudio(false);
          
          // Calculate winners
          const participants = isTeamsMode ? teams : players;
          const maxScore = Math.max(...participants.map(p => p.score));
          const winners = participants.filter(p => p.score === maxScore).map(p => p.id);
          
          sendMessage({
              type: 'GAME_OVER_SUMMARY',
              payload: { winners }
          });
      }
  };

  const handleKickPlayer = (playerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Kick this player?")) return;

    // Send kick message to player
    sendMessage({ type: 'KICK_PLAYER', payload: { playerId } });

    // Update state to remove player
    setPlayers(prev => prev.filter(p => p.id !== playerId));
    
    // Also remove from teams if applicable
    setTeams(prev => prev.map(t => ({
        ...t,
        members: t.members.filter(id => id !== playerId)
    })));

    // If they were currently buzzed in, reset
    if (buzzedPlayerId === playerId) {
        setBuzzedPlayerId(null);
        setBuzzLocked(false);
    }
  };

  const handleQuestionSelect = (catId: string, q: Question) => {
    if (answeredQuestions.includes(q.id)) return;
    
    // Stop any previous instance first to ensure clean state
    stopListening();
    setIsPlayingAudio(false);
    
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
    // Auto-start is handled by useEffect
  };

  // --- SPEECH RECOGNITION FUNCTIONS ---

  const stopListening = () => {
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          recognitionRef.current = null;
      }
      setIsListening(false);
  };

  const startListening = () => {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
          console.warn("Speech recognition not supported in this browser.");
          return;
      }

      // If already listening, don't double start
      if (recognitionRef.current) return;

      try {
          const recognition = new SpeechRecognition();
          recognition.lang = 'en-US';
          recognition.continuous = false; // We want to detect the *end* of a phrase
          recognition.interimResults = false;

          recognition.onstart = () => {
              setIsListening(true);
          };

          // This fires when the user stops talking
          recognition.onspeechend = () => {
              // The browser detected speech ended. Unlock buzzers.
              handleUnlockBuzzers();
              stopListening();
          };

          recognition.onerror = (event: any) => {
              // 'no-speech' happens if they don't say anything for a while. 
              // We just stop listening to avoid error loops.
              console.log("Speech recognition error", event.error);
              stopListening();
          };

          recognition.onend = () => {
              setIsListening(false);
              recognitionRef.current = null;
          };

          recognition.start();
          recognitionRef.current = recognition;
      } catch (err) {
          console.error("Failed to start speech recognition", err);
          setIsListening(false);
      }
  };

  const handleUnlockBuzzers = () => {
    // FAST PATH: Send a lightweight message immediately before React state updates/syncs
    // This dramatically reduces latency perception
    sendMessage({ type: 'BUZZER_STATUS', payload: { isOpen: true } });

    setBuzzLocked(false);
    setTimerMode('BUZZ');
    setTimer(10);
    // Ensure mic is off
    stopListening();
  };

  const setUndoAction = (action: typeof lastAction) => {
      if (lastActionTimeoutRef.current) clearTimeout(lastActionTimeoutRef.current);
      setLastAction(action);
      lastActionTimeoutRef.current = setTimeout(() => {
          setLastAction(null);
      }, 8000);
  };

  const handleUndo = () => {
      if (!lastAction) return;
      const { type, playerId, points, questionId, eventId } = lastAction;

      // Revert Score
      if (isTeamsMode) {
          const team = teams.find(t => t.members.includes(playerId));
          if (team) {
              setTeams(prev => prev.map(t => t.id === team.id ? { ...t, score: type === 'CORRECT' ? t.score - points : t.score + points } : t));
              if (type === 'WRONG') {
                   setBlockedTeamIds(prev => prev.filter(id => id !== team.id));
              }
          }
      } else {
          setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, score: type === 'CORRECT' ? p.score - points : p.score + points } : p));
          if (type === 'WRONG') {
              setBlockedPlayerIds(prev => prev.filter(id => id !== playerId));
          }
      }

      // Revert Question State if it was marked correct
      if (type === 'CORRECT') {
          setAnsweredQuestions(prev => prev.filter(id => id !== questionId));
      }

      // Remove the event from history
      setGameEvents(prev => prev.filter(e => e.id !== eventId));

      // Cleanup
      if (lastActionTimeoutRef.current) clearTimeout(lastActionTimeoutRef.current);
      setLastAction(null);
  };

  const handleCorrect = () => {
    if (!currentQuestion || !buzzedPlayerId) return;
    stopListening();
    setIsPlayingAudio(false);

    soundService.play('CORRECT');
    const points = currentQuestion.q.points;
    const catTitle = board.categories.find(c => c.id === currentQuestion.catId)?.title || "Unknown";
    
    // Store name for Undo Toast
    const playerName = isTeamsMode 
        ? teams.find(t => t.members.includes(buzzedPlayerId))?.name || 'Team' 
        : players.find(p => p.id === buzzedPlayerId)?.name || 'Player';

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

    const eventId = Math.random().toString(36).substr(2, 9);
    const newEvent: GameEvent = {
        id: eventId,
        playerId: buzzedPlayerId,
        type: 'CORRECT',
        points,
        timestamp: Date.now(),
        questionValue: points
    };
    setGameEvents(prev => [...prev, newEvent]);
    
    setUndoAction({
        type: 'CORRECT',
        playerId: buzzedPlayerId,
        points,
        questionId: currentQuestion.q.id,
        playerName,
        eventId
    });

    setAnsweredQuestions(prev => [...prev, currentQuestion.q.id]);
    setPhase(GamePhase.BOARD);
    setCurrentQuestion(null);
    setBuzzedPlayerId(null);
    setTimer(null);
  };

  const handleWrong = () => {
    if (!currentQuestion || !buzzedPlayerId) return;
    stopListening();
    setIsPlayingAudio(false);

    soundService.play('WRONG');
    const points = currentQuestion.q.points;
    const catTitle = board.categories.find(c => c.id === currentQuestion.catId)?.title || "Unknown";

    const playerName = isTeamsMode 
        ? teams.find(t => t.members.includes(buzzedPlayerId))?.name || 'Team' 
        : players.find(p => p.id === buzzedPlayerId)?.name || 'Player';

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

    const eventId = Math.random().toString(36).substr(2, 9);
    const newEvent: GameEvent = {
        id: eventId,
        playerId: buzzedPlayerId,
        type: 'WRONG',
        points,
        timestamp: Date.now(),
        questionValue: points
    };
    setGameEvents(prev => [...prev, newEvent]);

    setUndoAction({
        type: 'WRONG',
        playerId: buzzedPlayerId,
        points,
        questionId: currentQuestion.q.id,
        playerName,
        eventId
    });

    setBuzzedPlayerId(null);
    setBuzzLocked(false);
    setTimerMode('BUZZ');
    setTimer(10);
  };

  const handleSkip = () => {
    if (!currentQuestion) return;
    stopListening();
    setIsPlayingAudio(false);
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

  // --- SUB-COMPONENTS FOR STATS ---

  const StatsView = () => {
      const participants = isTeamsMode ? teams : players;
      
      // Compute Awards
      let mostCorrect = { id: '', count: -1 };
      let mostWrong = { id: '', count: -1 };
      let highestGain = { id: '', amount: -1 };
      
      const statsMap = new Map<string, { correct: number, wrong: number, maxPoints: number }>();
      
      participants.forEach(p => {
          statsMap.set(p.id, { correct: 0, wrong: 0, maxPoints: 0 });
      });

      gameEvents.forEach(e => {
          // Resolve player ID to Team ID if needed
          let entityId = e.playerId;
          if (isTeamsMode) {
              const team = teams.find(t => t.members.includes(e.playerId));
              if (team) entityId = team.id;
          }

          const stat = statsMap.get(entityId);
          if (stat) {
              if (e.type === 'CORRECT') {
                  stat.correct++;
                  if (e.points > stat.maxPoints) stat.maxPoints = e.points;
                  if (e.points > highestGain.amount) highestGain = { id: entityId, amount: e.points };
              } else {
                  stat.wrong++;
              }
          }
      });

      statsMap.forEach((val, key) => {
          if (val.correct > mostCorrect.count) mostCorrect = { id: key, count: val.correct };
          if (val.wrong > mostWrong.count) mostWrong = { id: key, count: val.wrong };
      });

      const getName = (id: string) => participants.find(p => p.id === id)?.name || 'None';

      // Chart Generation (Score over Events)
      const chartHeight = 200;
      const chartWidth = 600;
      const minScore = Math.min(...participants.map(p => p.score), 0);
      const maxScore = Math.max(...participants.map(p => p.score), 1000);
      const scoreRange = maxScore - minScore || 1;
      
      const getY = (score: number) => chartHeight - ((score - minScore) / scoreRange) * chartHeight;
      const getX = (index: number) => (index / (gameEvents.length || 1)) * chartWidth;

      // Build lines
      const lines = participants.map((p, i) => {
          let currentScore = 0;
          let path = `M 0 ${getY(0)}`;
          const color = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ec4899'][i % 6];
          
          gameEvents.forEach((e, idx) => {
              let isThisEntity = e.playerId === p.id;
              if (isTeamsMode) {
                  const team = teams.find(t => t.id === p.id); // p is Team here
                  if (team && team.members.includes(e.playerId)) isThisEntity = true;
              }

              if (isThisEntity) {
                  if (e.type === 'CORRECT') currentScore += e.points;
                  else currentScore -= e.points;
              }
              path += ` L ${getX(idx + 1)} ${getY(currentScore)}`;
          });

          return { path, color, name: p.name, finalScore: currentScore };
      });

      return (
          <div className="flex flex-col h-full overflow-y-auto p-8 animate-in slide-in-from-bottom-10 fade-in duration-500">
              <div className="flex justify-between items-center mb-8">
                  <h2 className="text-4xl font-display text-jeopardy-gold">Game Statistics</h2>
                  <button onClick={() => setShowDetailedStats(false)} className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">Back to Summary</button>
              </div>

              {/* Awards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  <div className="bg-gray-800 p-6 rounded-xl border border-blue-500/30 flex items-center gap-4">
                      <div className="p-4 bg-blue-900/50 rounded-full text-blue-400">
                          <Brain size={32} />
                      </div>
                      <div>
                          <p className="text-sm text-gray-400 uppercase font-bold">Big Brain</p>
                          <p className="text-xl font-bold text-white">{getName(mostCorrect.id)}</p>
                          <p className="text-xs text-blue-300">{mostCorrect.count > -1 ? mostCorrect.count : 0} Correct Answers</p>
                      </div>
                  </div>

                  <div className="bg-gray-800 p-6 rounded-xl border border-red-500/30 flex items-center gap-4">
                      <div className="p-4 bg-red-900/50 rounded-full text-red-400">
                          <AlertTriangle size={32} />
                      </div>
                      <div>
                          <p className="text-sm text-gray-400 uppercase font-bold">Risk Taker</p>
                          <p className="text-xl font-bold text-white">{getName(mostWrong.id)}</p>
                          <p className="text-xs text-red-300">{mostWrong.count > -1 ? mostWrong.count : 0} Wrong Answers</p>
                      </div>
                  </div>

                  <div className="bg-gray-800 p-6 rounded-xl border border-yellow-500/30 flex items-center gap-4">
                      <div className="p-4 bg-yellow-900/50 rounded-full text-jeopardy-gold">
                          <Zap size={32} />
                      </div>
                      <div>
                          <p className="text-sm text-gray-400 uppercase font-bold">High Roller</p>
                          <p className="text-xl font-bold text-white">{getName(highestGain.id)}</p>
                          <p className="text-xs text-yellow-300">won ${highestGain.amount > -1 ? highestGain.amount : 0} in one go</p>
                      </div>
                  </div>
              </div>

              {/* Chart */}
              <div className="bg-gray-800/50 p-8 rounded-2xl mb-8 border border-gray-700">
                  <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-300"><TrendingUp /> Score History</h3>
                  <div className="relative w-full h-[250px] bg-gray-900/50 rounded border border-gray-800">
                      <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" className="overflow-visible">
                          {/* Grid Lines */}
                          <line x1="0" y1={getY(0)} x2={chartWidth} y2={getY(0)} stroke="#4b5563" strokeWidth="1" strokeDasharray="4" opacity="0.5" />
                          
                          {lines.map((l, i) => (
                              <path key={i} d={l.path} stroke={l.color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-lg" />
                          ))}
                      </svg>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-6 justify-center">
                      {lines.map((l, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm bg-gray-900 px-3 py-1 rounded-full border border-gray-700">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }}></div>
                              <span className="font-bold text-gray-300">{l.name}</span>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      );
  };

  // --- LAYOUT ---

  // GAME OVER PHASE
  if (phase === GamePhase.GAME_OVER) {
      if (showDetailedStats) {
          return (
             <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans">
                 <div className="flex-1 relative bg-gray-900 flex flex-col">
                     <StatsView />
                 </div>
             </div>
          );
      }

      const participants = isTeamsMode ? teams : players;
      const sorted = [...participants].sort((a, b) => b.score - a.score);
      const winner = sorted[0];

      return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans flex-col items-center justify-center relative">
            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-600/20 rounded-full blur-[100px] animate-pulse"></div>
            </div>

            <div className="z-10 text-center max-w-4xl w-full p-6">
                <div className="mb-8 animate-bounce">
                    <Trophy size={80} className="text-jeopardy-gold mx-auto drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                </div>
                
                <h1 className="text-6xl md:text-8xl font-display text-white mb-2 drop-shadow-xl uppercase tracking-wider">
                    {winner ? winner.name : 'No Winner'}
                </h1>
                <p className="text-2xl text-jeopardy-gold font-mono font-bold mb-12 tracking-widest">
                    WINS WITH ${winner ? winner.score : 0}
                </p>

                {/* Scoreboard */}
                <div className="bg-gray-800/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 mb-12 max-h-[300px] overflow-y-auto custom-scrollbar shadow-2xl">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-gray-700 text-gray-400 uppercase text-xs">
                                <th className="pb-2 pl-4">Rank</th>
                                <th className="pb-2">Name</th>
                                <th className="pb-2 pr-4 text-right">Score</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((p, i) => (
                                <tr key={p.id} className="border-b border-gray-700/50 last:border-0 hover:bg-white/5">
                                    <td className="py-3 pl-4 font-mono text-gray-500">#{i + 1}</td>
                                    <td className="py-3 font-bold text-lg flex items-center gap-2">
                                        {i === 0 && <Medal size={16} className="text-jeopardy-gold" />}
                                        {i === 1 && <Medal size={16} className="text-gray-400" />}
                                        {i === 2 && <Medal size={16} className="text-amber-700" />}
                                        {p.name}
                                    </td>
                                    <td className={`py-3 pr-4 text-right font-mono font-bold ${p.score >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        ${p.score}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-center gap-6">
                    <button 
                        onClick={() => setShowDetailedStats(true)}
                        className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
                    >
                        <BarChart2 /> View Game Stats
                    </button>
                    <button 
                        onClick={onExit}
                        className="px-8 py-4 bg-gray-700 hover:bg-red-600 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 transition-colors"
                    >
                        <LogOut /> Exit to Lobby
                    </button>
                </div>
            </div>
        </div>
      );
  }

  // STANDARD GAME LAYOUT

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans relative">
      
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
              <button onClick={handleEndGame} className="flex items-center gap-2 text-gray-400 hover:text-red-400 text-sm transition-colors">
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
                                relative p-4 rounded-xl border-2 transition-all duration-300 group
                                ${isBuzzed ? 'bg-jeopardy-gold border-white scale-105 shadow-xl text-black' : 'bg-gray-700/50 border-gray-600 text-white'}
                                ${isBlocked ? 'opacity-50 grayscale' : ''}
                            `}
                        >
                            <div className="flex justify-between items-start">
                                <div className="pr-6">
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
                            
                            {/* Kick Button (Hover) - Not for teams since it's messy */}
                            {!isTeamsMode && (
                                <button 
                                    onClick={(e) => handleKickPlayer(p.id, e)}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-600/0 text-red-500 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                    title="Kick Player"
                                >
                                    <UserMinus size={14} />
                                </button>
                            )}
                            
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

                            {/* Mic Listening Indicator */}
                            {isListening && (
                                <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse shadow-lg">
                                    <Mic size={14} /> Listening to host...
                                </div>
                            )}

                            {/* Audio Player (Hidden Iframe) - Using Off-screen positioning to allow autoplay */}
                            {isPlayingAudio && currentQuestion.q.youtubeUrl && (
                                <div className="fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none z-[-1] overflow-hidden">
                                    <iframe 
                                        width="1" 
                                        height="1" 
                                        src={`https://www.youtube.com/embed/${getYoutubeId(currentQuestion.q.youtubeUrl)}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0`} 
                                        title="Audio Player"
                                        allow="autoplay; encrypted-media; gyroscope; picture-in-picture"
                                        tabIndex={-1}
                                    ></iframe>
                                </div>
                            )}
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

                           {/* Center: Open Buzzers & Mic */}
                           <div className="col-span-1 flex gap-2">
                                <button 
                                    onClick={handleUnlockBuzzers} 
                                    disabled={!buzzLocked || !!buzzedPlayerId}
                                    className="flex-1 bg-jeopardy-gold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl text-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                                >
                                    <Unlock size={24} /> OPEN
                                </button>
                                
                                <div className="flex flex-col gap-1">
                                    {/* Mic Button - Toggles Web Speech API */}
                                    <button
                                        onClick={isListening ? stopListening : startListening}
                                        disabled={!buzzLocked || !!buzzedPlayerId}
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-600 animate-pulse text-white' : 'bg-gray-800 hover:bg-gray-700 text-jeopardy-gold disabled:opacity-30'}`}
                                        title={isListening ? "Stop Auto-Detection" : "Start Auto-Detection (Mic)"}
                                    >
                                        {isListening ? <MicOff size={24} /> : <Sparkles size={24} />}
                                    </button>
                                </div>

                                {/* Audio Button (Only if URL exists) */}
                                {currentQuestion.q.youtubeUrl && (
                                    <button
                                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${isPlayingAudio ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-blue-400'}`}
                                        title={isPlayingAudio ? "Stop Audio" : "Play Audio Clue"}
                                    >
                                        {isPlayingAudio ? <StopCircle size={24} /> : <Youtube size={24} />}
                                    </button>
                                )}
                           </div>

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

          {/* Undo Toast */}
          {lastAction && (
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-4">
                  <button 
                    onClick={handleUndo}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-full shadow-2xl border border-gray-600 flex items-center gap-3 transition-all hover:scale-105 group"
                  >
                      <RotateCcw className="text-gray-400 group-hover:text-white transition-colors" size={20} />
                      <div className="flex flex-col items-start text-left">
                          <span className="text-xs text-gray-400 font-bold uppercase">Undo Action</span>
                          <span className="text-sm">
                              {lastAction.type === 'CORRECT' ? 'Marked Correct: ' : 'Marked Wrong: '} 
                              <span className="font-bold text-jeopardy-gold">{lastAction.playerName}</span>
                          </span>
                      </div>
                  </button>
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