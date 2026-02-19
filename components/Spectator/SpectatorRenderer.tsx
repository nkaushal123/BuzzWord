import React from 'react';
import { GameBoard, GameState, GamePhase } from '../../types';
import { Trophy, Clock, Lock, Unlock, Youtube, Loader, Monitor, Wifi } from 'lucide-react';

interface SpectatorRendererProps {
  gameState: GameState | null;
  board: GameBoard | null;
  lobbyCode: string;
  qrCodeDataUrl?: string;
  isConnected?: boolean; // For remote view
  statusMessage?: string; // For remote view
}

const getYoutubeId = (url: string | undefined) => {
    if (!url) return null;
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
};

export const SpectatorRenderer: React.FC<SpectatorRendererProps> = ({ 
    gameState, 
    board, 
    lobbyCode, 
    qrCodeDataUrl,
    isConnected = true,
    statusMessage 
}) => {
  
  // --- LOADING / ERROR STATES ---
  if (!gameState || !board) {
      return (
          <div className="h-screen w-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 font-sans">
              <div className="text-center max-w-lg w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl">
                  <h1 className="text-3xl font-display text-jeopardy-gold mb-8 tracking-widest uppercase">
                      BuzzWord TV
                  </h1>
                  
                  <div className="flex flex-col items-center gap-4">
                      <Loader className="animate-spin text-blue-400 w-10 h-10" />
                      <h3 className="text-xl font-bold">{statusMessage || 'Initializing...'}</h3>
                      <p className="text-gray-400">Waiting for game data...</p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-800 text-sm text-gray-500">
                      <p>Lobby Code: <span className="font-mono text-white font-bold">{lobbyCode}</span></p>
                  </div>
              </div>
          </div>
      );
  }

  // Derived State
  const participants = gameState.isTeamsMode ? gameState.teams : gameState.players || [];
  const currentQ = gameState.currentQuestionId && board 
      ? board.categories.flatMap(c => c.questions).find(q => q.id === gameState.currentQuestionId)
      : null;
  const currentCat = gameState.currentCategoryId && board
      ? board.categories.find(c => c.id === gameState.currentCategoryId)
      : null;
  
  const buzzedName = gameState.buzzedPlayerId 
      ? (gameState.isTeamsMode 
          ? gameState.teams.find(t => t.members.includes(gameState.buzzedPlayerId!))?.name 
          : gameState.players.find(p => p.id === gameState.buzzedPlayerId)?.name)
      : null;


  // --- LOBBY PHASE ---
  if (gameState.phase === GamePhase.LOBBY) {
      return (
        <div className="h-screen w-screen bg-gradient-to-br from-blue-900 to-black text-white p-12 flex flex-col items-center justify-center relative overflow-hidden font-sans">
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500 via-black to-black"></div>
            
            <div className="z-10 flex flex-row items-center gap-16 w-full max-w-7xl">
                {/* Left: Info */}
                <div className="flex-1 text-center lg:text-left">
                    <h1 className="text-8xl font-display text-jeopardy-gold mb-6 drop-shadow-lg tracking-wider">
                        {board.title}
                    </h1>
                    <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20 inline-block mb-12 shadow-2xl">
                         <p className="text-xl uppercase tracking-widest text-blue-300 mb-2">Join at {window.location.host}</p>
                         <div className="text-9xl font-mono font-bold text-white tracking-widest drop-shadow-2xl">
                             {lobbyCode}
                         </div>
                    </div>
                </div>
                
                {/* Right: QR */}
                <div className="bg-white p-4 rounded-3xl shadow-2xl transform rotate-3">
                    {qrCodeDataUrl ? (
                         <img src={qrCodeDataUrl} className="w-[400px] h-[400px]" alt="Join QR" />
                    ) : (
                         <div className="w-[400px] h-[400px] flex items-center justify-center text-black">
                             Loading QR...
                         </div>
                    )}
                </div>
            </div>

            {/* Player List ticker */}
            <div className="absolute bottom-0 left-0 w-full bg-black/50 backdrop-blur-md border-t border-gray-800 p-6">
                <div className="flex justify-center gap-8 flex-wrap">
                    {participants.length === 0 && <span className="text-gray-500 animate-pulse italic text-xl">Waiting for players to join...</span>}
                    {participants.map(p => (
                        <div key={p.id} className="flex items-center gap-2 bg-blue-900/50 px-6 py-3 rounded-full border border-blue-500/30 shadow-lg animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                            <span className="font-bold text-2xl">{p.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );
  }

  // --- GAME OVER PHASE ---
  if (gameState.phase === GamePhase.GAME_OVER) {
      const sorted = [...participants].sort((a, b) => b.score - a.score);
      const winner = sorted[0];

      return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
             <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-10"></div>
             
             <Trophy size={120} className="text-jeopardy-gold mb-8 drop-shadow-[0_0_50px_rgba(255,215,0,0.6)] animate-bounce" />
             <h1 className="text-7xl font-display uppercase mb-4">{winner?.name || 'No Winner'}</h1>
             <p className="text-3xl text-blue-300 mb-12 font-mono">WINS WITH ${winner?.score}</p>

             <div className="w-full max-w-3xl bg-gray-800/80 rounded-2xl p-8 border border-gray-700 shadow-2xl">
                 {sorted.slice(0, 5).map((p, i) => (
                     <div key={p.id} className="flex justify-between items-center py-4 border-b border-gray-700 last:border-0 text-2xl">
                         <span className="font-bold text-gray-400 w-12">#{i+1}</span>
                         <span className="flex-1 text-left font-bold">{p.name}</span>
                         <span className={`font-mono font-bold ${p.score >= 0 ? 'text-green-400' : 'text-red-400'}`}>${p.score}</span>
                     </div>
                 ))}
             </div>
        </div>
      );
  }

  // --- BOARD / QUESTION PHASES ---
  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex relative overflow-hidden font-sans">
        {/* Left Sidebar: Scores */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col shadow-2xl z-20">
            <div className="p-6 bg-blue-900 text-center">
                <div className="text-4xl font-mono font-bold tracking-widest">{lobbyCode}</div>
                <div className="text-xs uppercase text-blue-300 mt-1">Join Code</div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {participants.sort((a, b) => b.score - a.score).map(p => {
                    const isBuzzed = gameState.buzzedPlayerId && (gameState.isTeamsMode 
                        ? (p as any).members?.includes(gameState.buzzedPlayerId) 
                        : p.id === gameState.buzzedPlayerId);
                    
                    return (
                        <div key={p.id} className={`p-4 rounded-xl border-2 transition-all duration-300 ${isBuzzed ? 'bg-jeopardy-gold text-black scale-105 shadow-xl border-white' : 'bg-gray-700/50 border-gray-600'}`}>
                            <div className="flex justify-between items-center">
                                <span className="font-bold text-xl truncate pr-2">{p.name}</span>
                                <span className={`font-mono text-2xl font-bold ${isBuzzed ? 'text-black' : (p.score >= 0 ? 'text-green-400' : 'text-red-400')}`}>
                                    ${p.score}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 relative flex flex-col">
            {/* Header / Category Indicator */}
            {gameState.phase === GamePhase.QUESTION && currentCat && (
                <div className="bg-blue-800 p-4 text-center border-b border-blue-600 shadow-lg z-10">
                    <span className="text-blue-200 font-bold uppercase tracking-widest text-lg mr-4">{currentCat.title}</span>
                    <span className="bg-jeopardy-gold text-black px-3 py-1 rounded-full font-bold">${currentQ?.points}</span>
                </div>
            )}

            {/* BOARD VIEW */}
            {gameState.phase === GamePhase.BOARD && (
                <div className="flex-1 p-8 overflow-hidden flex flex-col justify-center">
                     <div className="grid gap-4 h-full max-h-full" style={{ gridTemplateColumns: `repeat(${board.categories.length}, 1fr)` }}>
                        {board.categories.map(cat => (
                            <div key={cat.id} className="flex flex-col gap-4 h-full">
                                <div className="bg-blue-900 text-white font-display text-center py-4 text-2xl md:text-3xl uppercase shadow-lg rounded-lg flex items-center justify-center h-32 border-4 border-blue-950 text-shadow-lg">
                                    {cat.title}
                                </div>
                                {cat.questions.map(q => {
                                    const isAnswered = gameState.answeredQuestions.includes(q.id);
                                    return (
                                        <div key={q.id} className={`
                                            flex-1 font-display text-5xl md:text-6xl rounded-lg flex items-center justify-center border-2 transition-all duration-500
                                            ${isAnswered ? 'bg-black/20 text-transparent border-transparent' : 'bg-blue-700 text-jeopardy-gold border-black shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]'}
                                        `}>
                                            {!isAnswered && `$${q.points}`}
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                     </div>
                </div>
            )}

            {/* QUESTION / ANSWER VIEW */}
            {(gameState.phase === GamePhase.QUESTION || gameState.phase === GamePhase.ANSWER) && currentQ && (
                <div className="flex-1 bg-blue-900 flex flex-col items-center justify-center p-12 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-800 to-blue-950"></div>
                    
                    {/* Content Card */}
                    <div className="z-10 max-w-6xl w-full text-center">
                        {currentQ.image && (
                            <img src={currentQ.image} className="max-h-[35vh] mx-auto mb-8 rounded-lg shadow-2xl border-4 border-black" alt="Clue" />
                        )}
                        
                        <h2 className="text-5xl md:text-7xl font-display uppercase leading-tight text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] mb-12">
                            {currentQ.question}
                        </h2>

                        {/* Answer Reveal */}
                        {gameState.phase === GamePhase.ANSWER && (
                            <div className="animate-in slide-in-from-bottom-10 fade-in duration-700 mt-8">
                                <div className="inline-block bg-white text-black px-12 py-6 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.5)] transform -rotate-1">
                                    <h3 className="text-4xl font-bold uppercase tracking-widest">
                                        {currentQ.answer}
                                    </h3>
                                </div>
                            </div>
                        )}

                        {/* YouTube Audio Player (Auto-play logic) */}
                        {currentQ.youtubeUrl && (
                             <div className="absolute top-4 right-4 w-16 h-16 opacity-50">
                                 <iframe 
                                     width="100%" 
                                     height="100%" 
                                     src={`https://www.youtube.com/embed/${getYoutubeId(currentQ.youtubeUrl)}?autoplay=1&controls=0&disablekb=1&fs=0&modestbranding=1&rel=0`} 
                                     title="Audio"
                                     allow="autoplay; encrypted-media;"
                                 ></iframe>
                                 <Youtube className="text-red-500 w-full h-full" />
                             </div>
                        )}
                    </div>

                    {/* Buzzer / Timer Status Bar */}
                    <div className="absolute bottom-0 left-0 w-full p-8 flex items-center justify-between bg-black/40 backdrop-blur-md border-t border-white/10">
                        <div className="flex items-center gap-4">
                            {gameState.timer !== null && (
                                <div className="flex items-center gap-3">
                                    <Clock className="text-gray-400" />
                                    <span className={`text-4xl font-mono font-bold ${gameState.timer <= 3 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                                        {gameState.timer}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="absolute left-1/2 -translate-x-1/2">
                            {buzzedName ? (
                                <div className="bg-white text-black px-12 py-4 rounded-full font-bold text-3xl animate-bounce shadow-[0_0_50px_rgba(255,255,255,0.5)]">
                                    {buzzedName}
                                </div>
                            ) : !gameState.buzzLocked ? (
                                <div className="flex items-center gap-2 text-jeopardy-gold animate-pulse">
                                    <Unlock size={32} />
                                    <span className="text-2xl font-bold tracking-widest">BUZZERS OPEN</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-gray-500">
                                    <Lock size={32} />
                                    <span className="text-2xl font-bold tracking-widest">LOCKED</span>
                                </div>
                            )}
                        </div>
                        
                        <div className="w-10"></div> {/* Spacer */}
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
