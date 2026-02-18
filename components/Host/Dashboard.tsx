import React, { useState, useEffect } from 'react';
import { GameBoard } from '../../types';
import { getBoards, createEmptyBoard, deleteBoard, saveBoard } from '../../services/storage';
import { importFromJeopardyLabs, importFromHTMLFile } from '../../services/importService';
import { AuthService } from '../../services/auth';
import { Play, Plus, Trash2, Edit, Download, X, Loader, FileUp, Globe, Share, User as UserIcon } from 'lucide-react';

interface DashboardProps {
  onPlay: (board: GameBoard) => void;
  onEdit: (board: GameBoard) => void;
  onBack: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onPlay, onEdit, onBack }) => {
  const [boards, setBoards] = useState<GameBoard[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [activeTab, setActiveTab] = useState<'FILE' | 'URL'>('FILE');
  
  const currentUser = AuthService.getCurrentUser();

  const loadBoards = async () => {
    const data = await getBoards(currentUser?.username);
    setBoards(data);
  };

  useEffect(() => {
    loadBoards();
  }, [currentUser]);

  const handleCreate = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    onEdit(createEmptyBoard(currentUser?.username));
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm("Are you sure you want to delete this game?")) {
      await deleteBoard(id);
      loadBoards();
    }
  };

  const handleExport = (board: GameBoard, e: React.MouseEvent) => {
      e.stopPropagation();
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(board));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `buzzword-${board.title.replace(/\s+/g, '-').toLowerCase()}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setImportError('');
      setIsImporting(true);

      try {
          const newBoard = await importFromJeopardyLabs(importUrl);
          if (currentUser) newBoard.ownerId = currentUser.username;
          
          await saveBoard(newBoard);
          await loadBoards();
          setShowImportModal(false);
          setImportUrl('');
      } catch (err: any) {
          setImportError(err.message || 'Failed to import. Try using the File Upload method instead.');
      } finally {
          setIsImporting(false);
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImportError('');
      setIsImporting(true);

      try {
          const newBoard = await importFromHTMLFile(file);
          if (currentUser) newBoard.ownerId = currentUser.username;

          await saveBoard(newBoard);
          await loadBoards();
          setShowImportModal(false);
      } catch (err: any) {
          setImportError("Could not parse file. Make sure it is a valid HTML (JeopardyLabs) or JSON (BuzzWord) file.");
      } finally {
          setIsImporting(false);
          e.target.value = '';
      }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-black text-white p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="text-blue-300 hover:text-white transition-colors">
            &larr; Back to Home
          </button>
          
          {currentUser && (
              <div className="flex items-center gap-2 text-jeopardy-gold bg-gray-900 px-4 py-2 rounded-full border border-gray-700">
                  <UserIcon size={16} />
                  <span className="font-bold">{currentUser.username}'s Library</span>
              </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-12">
            <h1 className="text-4xl font-display text-white">My Games</h1>
            <div className="flex gap-2">
                <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 px-4 py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-105"
                >
                    <Download className="w-5 h-5" />
                    <span>Import</span>
                </button>
                <button
                    onClick={handleCreate}
                    className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold shadow-lg transition-transform hover:scale-105"
                >
                    <Plus className="w-5 h-5" />
                    <span>Create New Game</span>
                </button>
            </div>
        </div>

        {boards.length === 0 ? (
          <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-2xl font-bold text-gray-400 mb-4">No games yet</h3>
            <p className="text-gray-500 mb-8">
                {currentUser ? "You haven't created any games on this account yet." : "Create your first trivia board to get started!"}
            </p>
            <button
              onClick={handleCreate}
              className="px-8 py-4 bg-jeopardy-gold text-blue-900 font-bold rounded-lg hover:bg-yellow-300 transition-colors"
            >
              Start Creating
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boards.map(board => (
              <div key={board.id} className="group relative bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-blue-500 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1">
                <div className="p-6">
                  <h3 className="text-2xl font-bold mb-2 truncate text-white group-hover:text-jeopardy-gold transition-colors">
                    {board.title}
                  </h3>
                  <p className="text-sm text-gray-400 mb-6">
                    Created: {new Date(board.createdAt).toLocaleDateString()}
                  </p>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => onPlay(board)}
                      className="flex-1 flex items-center justify-center space-x-2 bg-green-600 hover:bg-green-500 py-3 rounded-lg font-bold transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      <span>Host</span>
                    </button>
                    
                    <button
                      onClick={(e) => handleExport(board, e)}
                      className="p-3 bg-gray-700 hover:bg-blue-600 rounded-lg transition-colors text-gray-300 hover:text-white"
                      title="Export/Download"
                    >
                      <Share className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => onEdit(board)}
                      className="p-3 bg-gray-700 hover:bg-blue-600 rounded-lg transition-colors text-gray-300 hover:text-white"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={(e) => handleDelete(board.id, e)}
                      className="p-3 bg-gray-700 hover:bg-red-600 rounded-lg transition-colors text-gray-300 hover:text-white"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full relative">
                  <button 
                    onClick={() => setShowImportModal(false)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white"
                  >
                      <X />
                  </button>
                  
                  <h2 className="text-2xl font-bold mb-2 text-jeopardy-gold">Import Board</h2>
                  <p className="text-gray-400 mb-6 text-sm">
                      Supports BuzzWord JSON and JeopardyLabs HTML
                  </p>

                  {/* Tabs */}
                  <div className="flex border-b border-gray-700 mb-6">
                    <button 
                      onClick={() => setActiveTab('FILE')}
                      className={`flex-1 pb-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'FILE' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-white'}`}
                    >
                      <FileUp size={16} /> Upload File
                    </button>
                    <button 
                      onClick={() => setActiveTab('URL')}
                      className={`flex-1 pb-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === 'URL' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-gray-500 hover:text-white'}`}
                    >
                      <Globe size={16} /> JeopardyLabs URL
                    </button>
                  </div>

                  {activeTab === 'FILE' ? (
                     <div className="space-y-4">
                        <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center bg-black/20 hover:bg-black/40 transition-colors relative">
                             {isImporting ? (
                                <div className="flex flex-col items-center">
                                    <Loader className="animate-spin mb-2 text-jeopardy-gold" />
                                    <span className="text-gray-400">Parsing file...</span>
                                </div>
                             ) : (
                                <>
                                    <FileUp className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                                    <p className="text-gray-300 font-bold mb-1">Click to select file</p>
                                    <p className="text-gray-500 text-xs">Supports .json or .html</p>
                                    <input 
                                        type="file" 
                                        accept=".html,.htm,.json"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                    />
                                </>
                             )}
                        </div>
                     </div>
                  ) : (
                    <form onSubmit={handleUrlSubmit}>
                      <input 
                        type="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://jeopardylabs.com/play/..."
                        className="w-full bg-black border border-gray-600 rounded-lg p-3 text-white mb-4 focus:ring-2 focus:ring-jeopardy-gold outline-none"
                        required
                        autoFocus
                      />
                      <button 
                        type="submit" 
                        disabled={isImporting}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                      >
                          {isImporting ? <Loader className="animate-spin" /> : <Download />}
                          {isImporting ? 'Downloading...' : 'Import from URL'}
                      </button>
                    </form>
                  )}

                  {importError && (
                      <div className="mt-4 bg-red-900/50 border border-red-700 text-red-200 p-3 rounded text-sm text-center animate-in fade-in slide-in-from-top-2">
                          {importError}
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};