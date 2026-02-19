import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question, Team } from '../../types';
import { useComms } from '../../services/comms';
import { soundService } from '../../services/sound';
import { Users, Lock, Unlock, Check, X, ArrowRight, LogOut, Wifi, Shield, Eye, Clock, Play, Trophy, Maximize, RotateCcw, BarChart2, Zap, Brain, AlertTriangle, TrendingUp, Medal, Mic, MicOff, Sparkles, Youtube, StopCircle, UserMinus, Star, DollarSign } from 'lucide-react';

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
  const [lastCorrectPlayerId, setLastCorrectPlayerId] = useState<string | null>(null);
  
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

  // --- WAGER STATE ---
  const [wagerAmount, setWagerAmount] = useState<number>(0);

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
    if (phase === GamePhase.QUESTION && currentQuestion && buzzLocked) {
        // Don't auto-start if it's a Daily Double that was just wagered (buzzer is locked but player is selected)
        if (buzzedPlayerId) return;

        const hasText = currentQuestion.q.question && currentQuestion.q.question.trim().length > 0;

        if (!hasText) {
             const timer = setTimeout(() => {
                 handleUnlockBuzzers();
             }, 1500);
             return () => clearTimeout(timer);
        } else if (!isListening) {
            startListening();
        }
    }
  }, [phase, currentQuestion, buzzLocked, buzzedPlayerId]);

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
    
    // Reset lockout
    setBlockedPlayerIds([]); 
    setBlockedTeamIds([]);
    setTimer(null); 
    setTimerMode(null);

    // DAILY DOUBLE LOGIC
    if (q.isDailyDouble) {
        soundService.play('DAILY_DOUBLE');
        
        // 1. Determine who controls the board
        let activeId = lastCorrectPlayerId;
        
        // If no one has answered correctly yet (start of game), Host must pick manually or it defaults to null
        // We will handle the "null" case in the Wager UI by asking host to select a player
        
        setBuzzedPlayerId(activeId); // Assign control immediately
        setBuzzLocked(true); // Lock everyone else out
        setPhase(GamePhase.WAGER);
        setWagerAmount(0);
        setCurrentQuestion({ catId, q });
        return;
    }

    setCurrentQuestion({ catId, q });
    setPhase(GamePhase.QUESTION);
    setBuzzedPlayerId(null);
    setBuzzLocked(true); 
  };
  
  const handleConfirmWager = () => {
      if (!currentQuestion) return;
      // Update question points for this instance only (don't save to board)
      const updatedQ = { ...currentQuestion.q, points: wagerAmount };
      setCurrentQuestion({ ...currentQuestion, q: updatedQ });
      setPhase(GamePhase.QUESTION);
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
    sendMessage({ type: 'BUZZER_STATUS', payload: { isOpen: true } });

    setBuzzLocked(false);
    setTimerMode('BUZZ');
    setTimer(10);
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
    
    // Track Last Correct Player
    setLastCorrectPlayerId(buzzedPlayerId);

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

    // For Daily Double, WRONG means the question is done (no one else can answer)
    if (currentQuestion.q.isDailyDouble) {
        setAnsweredQuestions(prev => [...prev, currentQuestion.q.id]);
        setPhase(GamePhase.BOARD);
        setCurrentQuestion(null);
        setBuzzedPlayerId(null);
        setTimer(null);
    } else {
        setBuzzedPlayerId(null);
        setBuzzLocked(false);
        setTimerMode('BUZZ');
        setTimer(10);
    }
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
  // (StatsView removed for brevity since it was unchanged)

  // --- LAYOUT ---

  // GAME OVER PHASE
  if (phase === GamePhase.GAME_OVER) {
     // (Game Over view unchanged)
     const participants = isTeamsMode ? teams : players;
      const sorted = [...participants].sort((a, b) => b.score - a.score);
      const winner = sorted[0];

      return (
        <div className="flex h-screen bg-gray-900 text-white overflow-hidden font-sans flex-col items-center justify-center relative">
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

                <div className="flex justify-center gap-6">
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
                                </div>
                                <div className={`font-mono text-xl font-bold ${isBuzzed ? 'text-black' : (p.score >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                                    <ScoreDisplay score={p.score} />
                                </div>
                            </div>
                            
                            {!isTeamsMode && (
                                <button 
                                    onClick={(e) => handleKickPlayer(p.id, e)}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-600/0 text-red-500 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                                    title="Kick Player"
                                >
                                    <UserMinus size={14} />
                                </button>
                            )}
                        </div>
                      )
              })}
          </div>
          
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

          {/* PHASE: WAGER (DAILY DOUBLE) */}
          {phase === GamePhase.WAGER && currentQuestion && (
              <div className="absolute inset-0 bg-blue-950 flex flex-col items-center justify-center p-12 z-40">
                  <div className="animate-in zoom-in duration-500 flex flex-col items-center text-center max-w-2xl w-full">
                      <div className="mb-8">
                        <Star className="w-32 h-32 text-jeopardy-gold animate-spin-slow" />
                      </div>
                      <h1 className="text-6xl font-display text-white mb-2 uppercase tracking-wider">Daily Double</h1>
                      
                      {/* Active Player Selector or Display */}
                      <div className="mb-8 p-4 bg-white/10 rounded-xl w-full">
                         {buzzedPlayerId ? (
                            <div>
                                <p className="text-blue-300 uppercase tracking-widest text-sm font-bold mb-2">Current Player</p>
                                <p className="text-4xl font-bold text-white">{isTeamsMode ? getBuzzedTeamName() : getBuzzedName()}</p>
                            </div>
                         ) : (
                             <div>
                                 <p className="text-red-300 uppercase tracking-widest text-sm font-bold mb-2">Select Player To Wager</p>
                                 <div className="flex flex-wrap gap-2 justify-center">
                                     {(isTeamsMode ? teams : players).map(p => (
                                         <button 
                                            key={p.id}
                                            onClick={() => setBuzzedPlayerId(p.id)}
                                            className="px-4 py-2 bg-blue-800 hover:bg-blue-700 rounded text-white font-bold"
                                         >
                                             {p.name}
                                         </button>
                                     ))}
                                 </div>
                             </div>
                         )}
                      </div>

                      {buzzedPlayerId && (
                          <div className="w-full bg-black/40 p-8 rounded-2xl border border-blue-500/30">
                              <label className="text-jeopardy-gold uppercase font-bold tracking-widest mb-4 block">Enter Wager Amount</label>
                              <div className="relative mb-6">
                                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                  <input 
                                      type="number" 
                                      value={wagerAmount}
                                      onChange={(e) => setWagerAmount(Math.max(0, parseInt(e.target.value) || 0))}
                                      className="w-full bg-black border-2 border-blue-500 rounded-xl p-6 pl-12 text-5xl text-white font-mono text-center outline-none focus:border-jeopardy-gold transition-colors"
                                      autoFocus
                                  />
                              </div>
                              <button 
                                onClick={handleConfirmWager}
                                className="w-full bg-jeopardy-gold hover:bg-yellow-300 text-black font-bold text-2xl py-4 rounded-xl shadow-lg transition-transform active:scale-95"
                              >
                                  Reveal Clue
                              </button>
                              
                              <p className="mt-4 text-gray-400 text-sm">
                                  Max Wager: ${Math.max(1000, (isTeamsMode ? teams.find(t => t.id === buzzedPlayerId)?.score : players.find(p => p.id === buzzedPlayerId)?.score) || 0)}
                              </p>
                          </div>
                      )}
                  </div>
              </div>
          )}

          {/* PHASE: QUESTION / ANSWER (OVERLAY) */}
          {(currentQuestion && (phase === GamePhase.QUESTION || phase === GamePhase.ANSWER)) && (
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
                           
                           {currentQuestion.q.image && (
                               <img src={currentQuestion.q.image} className="max-h-[300px] mx-auto mb-8 rounded-lg shadow-lg" />
                           )}
                           
                           <h2 className="text-4xl md:text-6xl font-display uppercase leading-tight text-white drop-shadow-md">
                               {currentQuestion.q.question}
                           </h2>
                           
                           {/* HOST ANSWER PREVIEW BOX - ALWAYS VISIBLE TO HOST */}
                           <div className="mt-8 bg-black/40 border border-jeopardy-gold/50 rounded-xl p-4 inline-block">
                               <p className="text-xs text-jeopardy-gold uppercase font-bold tracking-widest mb-1">Answer</p>
                               <p className="text-2xl font-bold text-white">{currentQuestion.q.answer}</p>
                           </div>

                           {/* Audio Player (Hidden Iframe) */}
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

                            {isListening && (
                                <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse shadow-lg">
                                    <Mic size={14} /> Listening...
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
                                    disabled={!buzzLocked || !!buzzedPlayerId} // Disable opening if someone is buzzed
                                    className="flex-1 bg-jeopardy-gold hover:bg-yellow-300 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl text-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                                >
                                    <Unlock size={24} /> OPEN
                                </button>
                                
                                <div className="flex flex-col gap-1">
                                    <button
                                        onClick={isListening ? stopListening : startListening}
                                        disabled={!buzzLocked || !!buzzedPlayerId}
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${isListening ? 'bg-red-600 animate-pulse text-white' : 'bg-gray-800 hover:bg-gray-700 text-jeopardy-gold disabled:opacity-30'}`}
                                    >
                                        {isListening ? <MicOff size={24} /> : <Sparkles size={24} />}
                                    </button>
                                </div>

                                {currentQuestion.q.youtubeUrl && (
                                    <button
                                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                                        className={`w-14 h-14 rounded-xl flex items-center justify-center transition-all ${isPlayingAudio ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-800 hover:bg-gray-700 text-blue-400'}`}
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
      
      {/* Expanded QR Code Modal */}
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