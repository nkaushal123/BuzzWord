import React, { useState } from 'react';
import { DatabaseService } from '../../services/db';
import { Database, ArrowLeft, Check, X, Server, AlertTriangle } from 'lucide-react';

interface DatabaseConfigProps {
    onBack: () => void;
}

export const DatabaseConfig: React.FC<DatabaseConfigProps> = ({ onBack }) => {
    const isConnected = DatabaseService.isConnected();
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');

    const handleConnect = (e: React.FormEvent) => {
        e.preventDefault();
        if (url && key) {
            DatabaseService.setConnection(url, key);
        }
    };

    const handleDisconnect = () => {
        if(window.confirm("Disconnecting will revert to Local Storage. Are you sure?")) {
            DatabaseService.disconnect();
        }
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative">
            <button onClick={onBack} className="absolute top-6 left-6 text-gray-400 hover:text-white flex items-center gap-2">
                <ArrowLeft size={20} /> Back
            </button>

            <div className="max-w-2xl w-full">
                <div className="text-center mb-12">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(0,0,0,0.5)] ${isConnected ? 'bg-green-600 shadow-green-900/50' : 'bg-gray-800'}`}>
                        <Database className={`w-12 h-12 ${isConnected ? 'text-white' : 'text-gray-500'}`} />
                    </div>
                    <h1 className="text-4xl font-display text-jeopardy-gold mb-2">Cloud Database</h1>
                    <p className="text-gray-400">
                        {isConnected 
                            ? "You are connected to the global database. All stats and boards are syncing." 
                            : "Connect a Supabase instance to enable global stats, leaderboards, and cloud save."}
                    </p>
                </div>

                {isConnected ? (
                    <div className="bg-gray-900 border border-green-700 rounded-xl p-8 text-center">
                        <div className="flex items-center justify-center gap-2 text-green-400 font-bold text-xl mb-6">
                            <Check /> Connected to Supabase
                        </div>
                        <button 
                            onClick={handleDisconnect}
                            className="bg-red-900/50 hover:bg-red-800 text-red-200 px-6 py-3 rounded-lg border border-red-800 transition-colors"
                        >
                            Disconnect Database
                        </button>
                    </div>
                ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
                        <div className="mb-6 p-4 bg-blue-900/20 border border-blue-800 rounded-lg flex gap-3 text-sm text-blue-200">
                            <Server className="shrink-0" />
                            <div>
                                <p className="font-bold mb-1">How to set this up:</p>
                                <ol className="list-decimal pl-4 space-y-1">
                                    <li>Create a free project at <a href="https://supabase.com" target="_blank" className="underline hover:text-white">supabase.com</a></li>
                                    <li>Create a table named <code>users</code> with columns: <code>username</code> (text, unique), <code>json_data</code> (jsonb)</li>
                                    <li>Create a table named <code>boards</code> with columns: <code>id</code> (text, primary), <code>owner_id</code> (text), <code>json_data</code> (jsonb)</li>
                                    <li>Copy your Project URL and Anon Key from API Settings.</li>
                                </ol>
                            </div>
                        </div>

                        <form onSubmit={handleConnect} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Project URL</label>
                                <input 
                                    type="url" 
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    placeholder="https://xyz.supabase.co"
                                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-jeopardy-gold outline-none"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Anon API Key</label>
                                <input 
                                    type="password" 
                                    value={key}
                                    onChange={e => setKey(e.target.value)}
                                    placeholder="eyJh..."
                                    className="w-full bg-black border border-gray-700 rounded-lg p-3 text-white focus:border-jeopardy-gold outline-none"
                                    required
                                />
                            </div>
                            <button 
                                type="submit" 
                                className="w-full bg-jeopardy-gold hover:bg-yellow-300 text-black font-bold py-3 rounded-lg transition-transform active:scale-95"
                            >
                                Connect
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};