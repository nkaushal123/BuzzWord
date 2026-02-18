import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameBoard, GameState, Player, GamePhase, CommsMessage, Question } from '../../types';
import { useComms } from '../../services/comms';
import { Users, Lock, Unlock, Check, X, ArrowRight, Copy, LogOut, Wifi, WifiOff, Star, DollarSign, Link } from 'lucide-react';

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
  const [answeredQuestions, setAnsweredQuestions] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<{catId: string, q: Question} | null>(null);
  const [buzzedPlayerId, setBuzzedPlayerId] = useState<string | null>(null);
  const [buzzLocked, setBuzzLocked] = useState(true);
  const [showAnswer, setShowAnswer] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Daily Double State
  const [dailyDoubleMode, setDailyDoubleMode] = useState(false);
  const [dailyDoublePlayerId, setDailyDoublePlayerId] = useState<string | null>(null);
  const [wager, setWager] = useState<number>(0);
  
  // New phase state for the lobby "waiting room"
  const [gamePhase, setGamePhase] = useState<GamePhase>(GamePhase.LOBBY);

  // Use Comms with HOST role
  // Defined BEFORE broadcastState so we can use sendMessage inside it
  const { sendMessage, isConnected } = useComms(lobbyCode, 'HOST', (msg: CommsMessage) => {
    if (msg.type === 'PLAYER_JOIN') {
      setPlayers(prev => {
        if (prev.find(p => p.id === msg.payload.id)) return prev;
        const newPlayers = [...prev, { id: msg.payload.id, name: msg.payload.name, score: 0 }];
        // Note: We do NOT broadcast here manually anymore. 
        // The useEffect below will detect 'players' changing and broadcast the new state automatically.
        return newPlayers;
      });
    }

    if (msg.type === 'BUZZ') {
      if (currentQuestion && !buzzLocked && !buzzedPlayerId && !dailyDoubleMode) {
        setBuzzedPlayerId(msg.payload.playerId);
        setBuzzLocked(true);
        // Force immediate sync for buzzes (latency critical)
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
             board: null
           }
        });
      }
    }
  });

  // Helper to broadcast state to all players
  const broadcastState = useCallback((
    overridePlayers?: Player[], 
    overrideBuzzLocked?: boolean,
    overrideBuzzedId?: string | null,
    overrideQuestion?: {catId: string, q: Question} | null,
    overridePhase?: GamePhase
  ) => {
    const state: GameState = {
      lobbyCode,
      phase: overridePhase || (currentQuestion ? (showAnswer ? GamePhase.ANSWER : GamePhase.QUESTION) : (gamePhase === GamePhase.LOBBY ? GamePhase.LOBBY : GamePhase.BOARD)),
      currentQuestionId: overrideQuestion?.q.id ?? (currentQuestion?.q.id || null),
      currentCategoryId: overrideQuestion?.catId ?? (currentQuestion?.catId || null),
      answeredQuestions,
      buzzedPlayerId: overrideBuzzedId !== undefined ? overrideBuzzedId : buzzedPlayerId,
      buzzLocked: overrideBuzzLocked !== undefined ? overrideBuzzLocked : buzzLocked,
      players: overridePlayers || players,
      board: null
    };
    sendMessage({ type: 'HOST_SYNC', payload: state });
  }, [players, answeredQuestions, currentQuestion, buzzedPlayerId, buzzLocked, showAnswer, gamePhase, lobbyCode, sendMessage]);

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

  const openQuestion = (catId: string, q: Question) => {
    if (answeredQuestions.includes(q.id)) return;
    
    setCurrentQuestion({ catId, q });
    setShowAnswer(false);
    setBuzzedPlayerId(null);
    setBuzzLocked(true);
    
    // Check for Daily Double
    if (q.isDailyDouble) {
      setDailyDoubleMode(true);
      setWager(q.points); // Default wager to question value
      setDailyDoublePlayerId(null); // Host must select player
    } else {
      setDailyDoubleMode(false);
      setWager(0);
    }
  };

  const unlockBuzzers = () => {
    setBuzzLocked(false);
  };

  const handleCorrect = () => {
    if (!currentQuestion) return;
    
    if (dailyDoubleMode) {
        // Daily Double Scoring
        if (!dailyDoublePlayerId) {
            alert("Please select a player for the Daily Double.");
            return;
        }
        setPlayers(prev => prev.map(p => p.id === dailyDoublePlayerId ? { ...p, score: p.score + wager } : p));
        setDailyDoubleMode(false); // Exit mode to show answer
        revealAnswer();
    } else {
        // Standard Scoring
        const points = currentQuestion.q.points;
        if (buzzedPlayerId) {
            setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score + points } : p));
            setBuzzedPlayerId(null);
        } 
        revealAnswer();
    }
  };

  const handleIncorrect = () => {
    if (!currentQuestion) return;

    if (dailyDoubleMode) {
        // Daily Double Scoring (Penalty)
        if (!dailyDoublePlayerId) {
            alert("Please select a player for the Daily Double.");
            return;
        }
        setPlayers(prev => prev.map(p => p.id === dailyDoublePlayerId ? { ...p, score: p.score - wager } : p));
        setDailyDoubleMode(false); // Exit DD mode
        revealAnswer(); // Usually DD ends the turn even if wrong
    } else {
        // Standard Scoring
        const points = currentQuestion.q.points;
        if (buzzedPlayerId) {
            setPlayers(prev => prev.map(p => p.id === buzzedPlayerId ? { ...p, score: p.score - points } : p));
            setBuzzedPlayerId(null);
        }
        setBuzzLocked(false); // Re-open buzzers for others
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
    setWager(0);
    setDailyDoublePlayerId(null);
  };

  const copyToClipboard = () => {
    const url = `${window.location.origin}?code=${lobbyCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

         <div className="max-w-4xl w-full bg-blue-900/20 border border-blue-800 rounded-2xl p-12 text-center">
            <h1 className="text-3xl text-blue-300 mb-8 font-light">
                Join at <span className="text-white font-bold">{window.location.hostname}</span> with code:
            </h1>
            
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

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* LEFT: Game Control & Players */}
      <div className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col z-20 shadow-xl shrink-0">
        <div className="p-4 border-b border-gray-800 bg-blue-900/20 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center text-jeopardy-gold">
            <Users className="mr-2" /> LEADERBOARD
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
        
        {/* Player List / Leaderboard */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {players.length === 0 && <div className="text-gray-500 text-center italic mt-10">No players yet</div>}
          
          {players.map(player => {
            const isBuzzed = buzzedPlayerId === player.id;
            const isDDPlayer = dailyDoublePlayerId === player.id;
            
            return (
                <div 
                key={player.id} 
                className={`p-4 rounded-xl border-2 flex justify-between items-center transition-all duration-300 relative overflow-hidden ${
                    (isBuzzed || isDDPlayer)
                    ? 'bg-jeopardy-gold border-white shadow-[0_0_20px_rgba(255,204,0,0.8)] scale-105 z-10' 
                    : 'bg-gray-800 border-gray-700'
                }`}
                >
                <span className={`font-bold truncate max-w-[120px] text-lg ${(isBuzzed || isDDPlayer) ? 'text-black' : 'text-white'}`}>
                    {player.name}
                </span>
                
                <div className={`font-mono text-xl font-black px-3 py-1 rounded transition-all ${(isBuzzed || isDDPlayer) ? 'bg-black' : ''}`}>
                    <ScoreDisplay 
                        score={player.score} 
                        className={(isBuzzed || isDDPlayer) ? 'text-jeopardy-gold' : (player.score < 0 ? 'text-red-400' : 'text-green-400')}
                    />
                </div>
                
                {/* Visual indicator for buzzed/selected player */}
                {(isBuzzed || isDDPlayer) && (
                    <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none"></div>
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
                                {players.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} (${p.score})</option>
                                ))}
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

                    <div className="flex justify-between gap-2">
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
                            <div className="text-xl font-bold text-white truncate">{players.find(p => p.id === buzzedPlayerId)?.name}</div>
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
        {/* Active Question Overlay - Centered in Right Panel */}
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

                    <div className="mt-12 w-full">
                        <p className="text-3xl md:text-5xl font-display uppercase text-white leading-tight shadow-black drop-shadow-md break-words">
                            {currentQuestion.q.question}
                        </p>
                    </div>
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