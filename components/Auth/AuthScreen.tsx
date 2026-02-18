import React, { useState } from 'react';
import { AuthService } from '../../services/auth';
import { User } from '../../types';
import { UserCircle, ArrowRight, Smartphone } from 'lucide-react';

interface AuthScreenProps {
  onSuccess: (user: User) => void;
  onGuest: () => void;
  onBack: () => void;
  onSync?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onGuest, onBack, onSync }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    try {
      let user;
      if (isLogin) {
        user = AuthService.login(username);
      } else {
        user = AuthService.register(username);
      }
      onSuccess(user);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-2xl relative">
        <button onClick={onBack} className="absolute top-4 left-4 text-gray-500 hover:text-white">Back</button>
        
        <div className="flex justify-center mb-8">
            <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center border border-blue-500/30">
                <UserCircle className="w-12 h-12 text-blue-400" />
            </div>
        </div>

        <h2 className="text-3xl font-display text-center mb-2 text-white">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        <p className="text-gray-400 text-center mb-8 text-sm">
          {isLogin ? 'Sign in to track your stats' : 'Start your journey to the leaderboard'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Username</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-jeopardy-gold outline-none transition-colors"
              placeholder="Enter username"
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-red-200 text-sm text-center">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full bg-jeopardy-gold hover:bg-yellow-300 text-black font-bold py-3 rounded-lg transition-transform active:scale-95"
          >
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 flex flex-col gap-4 text-center">
            <button 
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>

            <div className="relative py-2">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800"></div></div>
                <div className="relative flex justify-center"><span className="bg-gray-900 px-2 text-xs text-gray-500">OR</span></div>
            </div>

            <button onClick={onGuest} className="text-gray-500 hover:text-white text-sm flex items-center justify-center gap-2">
                Continue as Guest <ArrowRight size={14} />
            </button>
            
            {onSync && (
                <button onClick={onSync} className="text-gray-500 hover:text-white text-sm flex items-center justify-center gap-2 mt-2">
                    <Smartphone size={14} /> Transfer Data from another Device
                </button>
            )}
        </div>
      </div>
    </div>
  );
};
