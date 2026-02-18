import React, { useState, useEffect } from 'react';
import { AuthService } from '../../services/auth';
import { User, ModeStats } from '../../types';
import { ArrowLeft, Trophy, Target, Award, Hash, Zap, Users, Shield, Star, DollarSign, Smartphone } from 'lucide-react';

interface StatsScreenProps {
  onBack: () => void;
  onSync: () => void;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ onBack, onSync }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);
  const [view, setView] = useState<'ME' | 'GLOBAL'>('ME');
  const [statsMode, setStatsMode] = useState<'SOLO' | 'TEAM'>('SOLO');

  useEffect(() => {
    setCurrentUser(AuthService.getCurrentUser());
    setLeaderboard(AuthService.getLeaderboard());
  }, []);

  const StatCard = ({ label, value, icon: Icon, color }: any) => (
    <div className="bg-gray-800 border border-gray-700 p-4 rounded-xl flex items-center space-x-4 hover:bg-gray-750 transition-colors">
      <div className={`p-3 rounded-lg bg-opacity-20 ${color.bg}`}>
        <Icon className={`w-6 h-6 ${color.text}`} />
      </div>
      <div>
        <p className="text-gray-400 text-xs uppercase font-bold">{label}</p>
        <p className="text-2xl font-bold text-white">{value}</p>
      </div>
    </div>
  );

  const renderModeStats = (stats: ModeStats) => {
      const accuracy = stats.questionsAttempted > 0 
        ? Math.round((stats.questionsCorrect / stats.questionsAttempted) * 100) 
        : 0;

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-500">
            <StatCard 
                label="Lifetime Winnings" 
                value={`$${stats.totalScore}`} 
                icon={DollarSign} 
                color={{ bg: 'bg-green-500', text: 'text-green-500' }} 
            />
            <StatCard 
                label="Games Played" 
                value={stats.gamesPlayed} 
                icon={Hash} 
                color={{ bg: 'bg-blue-500', text: 'text-blue-500' }} 
            />
            <StatCard 
                label="Games Won" 
                value={stats.gamesWon} 
                icon={Trophy} 
                color={{ bg: 'bg-yellow-500', text: 'text-yellow-500' }} 
            />
            <StatCard 
                label="Questions Attempted" 
                value={stats.questionsAttempted} 
                icon={Target} 
                color={{ bg: 'bg-purple-500', text: 'text-purple-500' }} 
            />
            <StatCard 
                label="Accuracy" 
                value={`${accuracy}%`} 
                icon={Zap} 
                color={{ bg: 'bg-red-500', text: 'text-red-500' }} 
            />
            <StatCard 
                label="Best Game Score" 
                value={`$${stats.bestGameScore}`} 
                icon={Star} 
                color={{ bg: 'bg-orange-500', text: 'text-orange-500' }} 
            />
        </div>
      );
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
          <button onClick={onBack} className="text-gray-400 hover:text-white flex items-center gap-2 self-start md:self-auto">
            <ArrowLeft size={20} /> Back
          </button>
          <div className="bg-gray-900 rounded-lg p-1 flex">
            <button 
              onClick={() => setView('ME')}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${view === 'ME' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              My Profile
            </button>
            <button 
              onClick={() => setView('GLOBAL')}
              className={`px-6 py-2 rounded-md text-sm font-bold transition-all ${view === 'GLOBAL' ? 'bg-jeopardy-gold text-black' : 'text-gray-400 hover:text-white'}`}
            >
              Leaderboard
            </button>
          </div>
        </div>

        {view === 'ME' ? (
          <div>
            {currentUser ? (
              <>
                <div className="text-center mb-10 relative">
                   <div className="inline-block p-4 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 mb-4 shadow-xl">
                      <Trophy size={48} className="text-white" />
                   </div>
                   <h1 className="text-4xl font-display">{currentUser.username}</h1>
                   <p className="text-gray-400 text-sm mt-1">
                       Member since {new Date(currentUser.createdAt).toLocaleDateString()}
                   </p>
                   
                   <button 
                      onClick={onSync}
                      className="absolute top-0 right-0 md:static md:mt-4 bg-gray-800 hover:bg-gray-700 text-xs md:text-sm px-3 py-2 rounded-full border border-gray-600 flex items-center gap-2 transition-colors mx-auto"
                   >
                       <Smartphone size={14} /> Sync Devices
                   </button>
                </div>
                
                {/* Mode Selector */}
                <div className="flex justify-center mb-8">
                     <div className="border-b border-gray-800 flex space-x-8">
                         <button 
                             onClick={() => setStatsMode('SOLO')}
                             className={`pb-4 px-4 flex items-center gap-2 border-b-2 transition-all ${statsMode === 'SOLO' ? 'border-jeopardy-gold text-jeopardy-gold' : 'border-transparent text-gray-500 hover:text-white'}`}
                         >
                             <Users size={20} />
                             <span className="font-bold">Solo Career</span>
                         </button>
                         <button 
                             onClick={() => setStatsMode('TEAM')}
                             className={`pb-4 px-4 flex items-center gap-2 border-b-2 transition-all ${statsMode === 'TEAM' ? 'border-jeopardy-gold text-jeopardy-gold' : 'border-transparent text-gray-500 hover:text-white'}`}
                         >
                             <Shield size={20} />
                             <span className="font-bold">Team Career</span>
                         </button>
                     </div>
                </div>
                
                {/* Stats Grid */}
                <div className="mb-12">
                    {renderModeStats(statsMode === 'SOLO' ? currentUser.stats.solo : currentUser.stats.team)}
                </div>

                {/* Categories Breakdown */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Award className="text-jeopardy-gold" /> Best Categories
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(Object.entries(currentUser.stats.categoryStats || {}) as [string, { correct: number; wrong: number; pointsEarned: number }][])
                            .sort(([, a], [, b]) => b.pointsEarned - a.pointsEarned) // Sort by points
                            .slice(0, 6) // Top 6
                            .map(([catTitle, stats]) => (
                                <div key={catTitle} className="bg-black/30 p-4 rounded-lg flex justify-between items-center">
                                    <div className="truncate pr-4">
                                        <div className="font-bold truncate text-sm" title={catTitle}>{catTitle}</div>
                                        <div className="text-xs text-gray-500">
                                            {stats.correct} / {stats.correct + stats.wrong} correct
                                        </div>
                                    </div>
                                    <div className={`font-mono font-bold ${stats.pointsEarned > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        ${stats.pointsEarned}
                                    </div>
                                </div>
                            ))
                        }
                        {Object.keys(currentUser.stats.categoryStats || {}).length === 0 && (
                            <p className="text-gray-500 text-sm col-span-full text-center py-4">Play games to track category performance!</p>
                        )}
                    </div>
                </div>
              </>
            ) : (
              <div className="text-center py-20 bg-gray-900 rounded-2xl border border-gray-800">
                <p className="text-xl text-gray-400 mb-4">You are playing as a Guest.</p>
                <p className="text-sm text-gray-500">Log in to track your stats!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
             <table className="w-full text-left">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">Rank</th>
                    <th className="p-4 text-xs font-bold text-gray-400 uppercase">Player</th>
                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Solo Winnings</th>
                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Team Winnings</th>
                    <th className="p-4 text-xs font-bold text-gray-400 uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((user, index) => {
                      const total = user.stats.solo.totalScore + user.stats.team.totalScore;
                      return (
                        <tr key={user.username} className="border-t border-gray-800 hover:bg-white/5 transition-colors">
                        <td className="p-4 font-mono text-gray-500">#{index + 1}</td>
                        <td className="p-4 font-bold flex items-center gap-2">
                            {index === 0 && <Trophy size={14} className="text-jeopardy-gold" />}
                            {user.username}
                            {currentUser?.username === user.username && <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded ml-2">YOU</span>}
                        </td>
                        <td className="p-4 text-gray-300 font-mono text-right">${user.stats.solo.totalScore}</td>
                        <td className="p-4 text-gray-300 font-mono text-right">${user.stats.team.totalScore}</td>
                        <td className="p-4 text-green-400 font-bold font-mono text-right">${total}</td>
                        </tr>
                      );
                  })}
                  {leaderboard.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">No players yet.</td>
                    </tr>
                  )}
                </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
};
