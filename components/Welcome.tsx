import React from 'react';
import { Monitor, Smartphone, Edit3, HelpCircle, Database } from 'lucide-react';

interface WelcomeProps {
  onSelectRole: (role: 'HOST' | 'PLAYER' | 'EDITOR' | 'HELP' | 'DB_CONFIG') => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onSelectRole }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
         <div className="absolute top-10 left-10 w-32 h-32 bg-yellow-400 rounded-full blur-3xl"></div>
         <div className="absolute bottom-10 right-10 w-64 h-64 bg-blue-500 rounded-full blur-3xl"></div>
      </div>

      <button 
          onClick={() => onSelectRole('DB_CONFIG')}
          className="absolute top-4 left-4 flex items-center gap-2 text-gray-500 hover:text-jeopardy-gold transition-colors z-20 text-xs uppercase font-bold"
      >
          <Database size={16} /> Config Database
      </button>

      <div className="z-10 text-center max-w-4xl w-full">
        <h1 className="text-6xl md:text-8xl font-display text-jeopardy-gold mb-4 drop-shadow-lg tracking-wider uppercase">
          BuzzWord
        </h1>
        <p className="text-xl md:text-2xl text-blue-200 mb-12 font-light">
          DIY Trivia Game Show
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
           <button
            onClick={() => onSelectRole('EDITOR')}
            className="group relative bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 rounded-xl p-8 transition-all hover:scale-105 shadow-xl flex flex-col items-center"
          >
            <div className="bg-gray-600 p-4 rounded-full mb-4 group-hover:bg-gray-500 transition-colors">
              <Edit3 size={40} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Create Board</h2>
            <p className="text-gray-300 text-sm">Build your own trivia questions.</p>
          </button>

          <button
            onClick={() => onSelectRole('HOST')}
            className="group relative bg-blue-800 hover:bg-blue-700 border-2 border-blue-500 rounded-xl p-8 transition-all hover:scale-105 shadow-xl flex flex-col items-center"
          >
            <div className="bg-blue-600 p-4 rounded-full mb-4 group-hover:bg-blue-500 transition-colors">
              <Monitor size={40} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Host Game</h2>
            <p className="text-blue-200 text-sm">Launch a lobby from a saved board.</p>
          </button>

          <button
            onClick={() => onSelectRole('PLAYER')}
            className="group relative bg-indigo-900 hover:bg-indigo-800 border-2 border-indigo-600 rounded-xl p-8 transition-all hover:scale-105 shadow-xl flex flex-col items-center"
          >
            <div className="bg-indigo-700 p-4 rounded-full mb-4 group-hover:bg-indigo-600 transition-colors">
              <Smartphone size={40} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Join Lobby</h2>
            <p className="text-indigo-200 text-sm">Enter a code to connect.</p>
          </button>
        </div>

        <button 
            onClick={() => onSelectRole('HELP')}
            className="mt-12 flex items-center text-gray-400 hover:text-white transition-colors gap-2"
        >
            <HelpCircle size={20} />
            <span>How does this work?</span>
        </button>
      </div>
    </div>
  );
};