import React, { useState, useEffect } from 'react';
import { GameBoard, Category, Question } from '../../types';
import { saveBoard } from '../../services/storage';
import { Save, ArrowLeft, Plus, Image as ImageIcon, Trash2, Info, X, Star, Youtube } from 'lucide-react';

interface BoardEditorProps {
  initialBoard: GameBoard;
  onSave: () => void;
  onCancel: () => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const BoardEditor: React.FC<BoardEditorProps> = ({ initialBoard, onSave, onCancel }) => {
  const [board, setBoard] = useState<GameBoard>(initialBoard);
  const [editingCell, setEditingCell] = useState<{ catIndex: number; qIndex: number } | null>(null);

  // Helper to ensure all categories have the same number of questions if something goes out of sync
  useEffect(() => {
    // Basic consistency check logic could go here
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBoard({ ...board, title: e.target.value });
  };

  const handleCategoryTitleChange = (index: number, title: string) => {
    const newCats = [...board.categories];
    newCats[index] = { ...newCats[index], title };
    setBoard({ ...board, categories: newCats });
  };

  const handleQuestionChange = (catIndex: number, qIndex: number, field: keyof Question, value: any) => {
    const newCats = [...board.categories];
    const newQs = [...newCats[catIndex].questions];
    // @ts-ignore - dynamic key assignment
    newQs[qIndex] = { ...newQs[qIndex], [field]: value };
    newCats[catIndex] = { ...newCats[catIndex], questions: newQs };
    setBoard({ ...board, categories: newCats });
  };

  const addCategory = () => {
    const rowCount = board.categories.length > 0 ? board.categories[0].questions.length : 5;
    const newCat: Category = {
      id: generateId(),
      title: `CAT ${board.categories.length + 1}`,
      questions: Array.from({ length: rowCount }).map((_, i) => ({
        id: generateId(),
        points: (i + 1) * 200,
        question: '',
        answer: ''
      }))
    };
    setBoard({ ...board, categories: [...board.categories, newCat] });
  };

  const deleteCategory = (index: number) => {
      if (board.categories.length <= 1) {
          alert("You must have at least one category.");
          return;
      }
      if (!window.confirm("Delete this category?")) return;
      
      const newCats = [...board.categories];
      newCats.splice(index, 1);
      setBoard({ ...board, categories: newCats });
  };

  const addRow = () => {
    const newCats = board.categories.map(cat => ({
      ...cat,
      questions: [...cat.questions, {
        id: generateId(),
        points: (cat.questions.length + 1) * 200,
        question: '',
        answer: ''
      }]
    }));
    setBoard({ ...board, categories: newCats });
  };

  const deleteRow = (rowIndex: number) => {
      if (board.categories.length > 0 && board.categories[0].questions.length <= 1) {
          alert("You must have at least one row.");
          return;
      }
      if (!window.confirm("Delete this row?")) return;

      const newCats = board.categories.map(cat => ({
          ...cat,
          questions: cat.questions.filter((_, i) => i !== rowIndex).map((q, i) => ({
              ...q,
              points: (i + 1) * 200 // Re-calculate points
          }))
      }));
      setBoard({ ...board, categories: newCats });
  };

  const handlePaste = (e: React.ClipboardEvent, catIndex: number, qIndex: number) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
             if (event.target?.result) {
                handleQuestionChange(catIndex, qIndex, 'image', event.target.result as string);
             }
          };
          reader.readAsDataURL(blob);
        }
        return; // Only handle the first image found
      }
    }
  };

  const save = () => {
    saveBoard(board);
    onSave();
  };

  const rowCount = board.categories.length > 0 ? board.categories[0].questions.length : 0;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 overflow-y-auto">
      {/* Header */}
      <div className="max-w-7xl mx-auto flex items-center justify-between mb-8 bg-gray-800 p-4 rounded-xl border border-gray-700 sticky top-0 z-40 shadow-xl">
        <div className="flex items-center space-x-4">
          <button type="button" onClick={onCancel} className="p-2 hover:bg-gray-700 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <label className="text-xs text-gray-400 uppercase font-bold tracking-wider">Game Title</label>
            <input
              className="block w-full bg-transparent text-2xl font-bold focus:outline-none focus:border-b-2 border-jeopardy-gold transition-all"
              value={board.title}
              onChange={handleTitleChange}
              placeholder="Enter Game Title"
            />
          </div>
        </div>
        <div className="flex space-x-3">
            <button
            type="button"
            onClick={addCategory}
            className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg font-bold shadow transition-all text-sm"
            >
            <Plus className="w-4 h-4" />
            <span>Add Category</span>
            </button>
            <button
            type="button"
            onClick={addRow}
            className="flex items-center space-x-2 bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg font-bold shadow transition-all text-sm"
            >
            <Plus className="w-4 h-4" />
            <span>Add Row</span>
            </button>
            <button
            type="button"
            onClick={save}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
            >
            <Save className="w-5 h-5" />
            <span>Save</span>
            </button>
        </div>
      </div>

      {/* Grid Editor */}
      <div className="max-w-full mx-auto overflow-x-auto pb-24 px-4">
        <div 
          className="grid gap-4 min-w-max pb-4"
          style={{ gridTemplateColumns: `50px repeat(${board.categories.length}, minmax(200px, 1fr))` }}
        >
          {/* Row Controls Column */}
          <div className="flex flex-col space-y-4">
              {/* Spacer for Category Header */}
              <div className="h-[64px] mb-1"></div> 
              {/* Row Delete Buttons */}
              {Array.from({ length: rowCount }).map((_, rIndex) => (
                  <button 
                     type="button"
                     key={rIndex} 
                     onClick={() => deleteRow(rIndex)}
                     className="h-24 flex items-center justify-center bg-gray-800 hover:bg-red-900/50 text-gray-500 hover:text-red-500 rounded-lg transition-colors border border-gray-700 hover:border-red-500 z-10"
                     title="Delete Row"
                  >
                     <Trash2 size={20} />
                  </button>
              ))}
          </div>

          {/* Categories */}
          {board.categories.map((cat, cIndex) => (
            <div key={cat.id} className="flex flex-col space-y-4">
              {/* Category Header */}
              <div className="relative group/header">
                  <input
                    className="w-full h-[64px] bg-blue-900 border-2 border-blue-700 text-center font-display text-xl p-2 rounded-lg focus:ring-2 focus:ring-jeopardy-gold focus:border-transparent outline-none uppercase tracking-wide placeholder-blue-300/50"
                    value={cat.title}
                    onChange={(e) => handleCategoryTitleChange(cIndex, e.target.value)}
                    placeholder={`CAT ${cIndex + 1}`}
                  />
                  
                  {/* Action Buttons (Absolute Positioned) */}
                  <div className="absolute top-2 right-2 flex space-x-1 z-20">
                      {/* Delete Button */}
                      <button 
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteCategory(cIndex); }}
                        className="p-1.5 bg-red-600 text-white rounded-full shadow-md hover:bg-red-500 hover:scale-110 transition-all cursor-pointer"
                        title="Delete Category"
                      >
                        <X size={14} />
                      </button>
                  </div>
              </div>

              {/* Questions */}
              {cat.questions.map((q, qIndex) => {
                const isEditing = editingCell?.catIndex === cIndex && editingCell?.qIndex === qIndex;
                const hasContent = q.question.trim() || q.answer.trim() || q.image || q.youtubeUrl;

                return (
                  <div key={q.id} className="relative group">
                    <button
                      type="button"
                      onClick={() => setEditingCell({ catIndex: cIndex, qIndex })}
                      className={`w-full h-24 rounded-lg border-2 flex flex-col items-center justify-center transition-all relative overflow-hidden
                        ${hasContent 
                          ? 'bg-blue-900/40 border-blue-600 hover:bg-blue-800' 
                          : 'bg-gray-800/40 border-gray-700 hover:bg-gray-800'
                        }
                        ${isEditing ? 'ring-2 ring-jeopardy-gold border-transparent' : ''}
                      `}
                    >
                      <span className="text-2xl font-display text-jeopardy-gold z-10 relative drop-shadow-md">${q.points}</span>
                      {hasContent && <span className="text-xs text-green-400 mt-1 z-10 relative">✓ Edited</span>}
                      {q.isDailyDouble && (
                         <span className="absolute top-1 right-1">
                            <Star className="w-4 h-4 text-jeopardy-gold fill-current" />
                         </span>
                      )}
                      {q.youtubeUrl && (
                        <span className="absolute bottom-1 right-1">
                            <Youtube className="w-4 h-4 text-red-500 fill-current" />
                        </span>
                      )}
                      {q.image && (
                          <div className="absolute inset-0 opacity-20">
                              <img src={q.image} className="w-full h-full object-cover grayscale" alt="preview" />
                          </div>
                      )}
                    </button>

                    {/* Edit Overlay/Modal */}
                    {isEditing && (
                      <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
                        <div className="bg-gray-900 w-full max-w-4xl rounded-xl border border-gray-700 shadow-2xl p-6 relative flex flex-col max-h-[95vh]">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-jeopardy-gold">
                                Editing: {cat.title} - ${q.points}
                            </h3>
                            <div className="flex items-center gap-4">
                                <label className="flex items-center space-x-2 cursor-pointer bg-blue-900 px-3 py-1 rounded border border-blue-700 hover:bg-blue-800">
                                    <input 
                                        type="checkbox" 
                                        checked={q.isDailyDouble || false} 
                                        onChange={(e) => handleQuestionChange(cIndex, qIndex, 'isDailyDouble', e.target.checked)}
                                        className="w-4 h-4 text-jeopardy-gold rounded focus:ring-0"
                                    />
                                    <span className="text-sm font-bold text-jeopardy-gold flex items-center gap-1">
                                        <Star size={14} /> Daily Double
                                    </span>
                                </label>
                                <div className="flex items-center text-sm text-gray-400 gap-2">
                                    <Info className="w-4 h-4" />
                                    <span>Paste image (Ctrl+V)</span>
                                </div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 overflow-y-auto p-1">
                            {/* Left Col: Text Inputs */}
                            <div className="space-y-6">
                                <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Question (The Clue)</label>
                                <textarea
                                    className="w-full h-32 bg-black/50 border border-gray-600 rounded-lg p-4 text-lg focus:ring-2 focus:ring-jeopardy-gold outline-none resize-none"
                                    value={q.question}
                                    onChange={(e) => handleQuestionChange(cIndex, qIndex, 'question', e.target.value)}
                                    onPaste={(e) => handlePaste(e, cIndex, qIndex)}
                                    placeholder="e.g. This planet is known as the Red Planet."
                                    autoFocus
                                />
                                </div>
                                
                                <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Answer (The Response)</label>
                                <input
                                    className="w-full bg-black/50 border border-gray-600 rounded-lg p-4 text-lg focus:ring-2 focus:ring-jeopardy-gold outline-none"
                                    value={q.answer}
                                    onChange={(e) => handleQuestionChange(cIndex, qIndex, 'answer', e.target.value)}
                                    placeholder="e.g. What is Mars?"
                                />
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                      <Youtube size={14} /> YouTube Audio URL (Audio Only)
                                  </label>
                                  <input
                                      className="w-full bg-black/50 border border-gray-600 rounded-lg p-4 text-sm focus:ring-2 focus:ring-jeopardy-gold outline-none font-mono text-blue-300"
                                      value={q.youtubeUrl || ''}
                                      onChange={(e) => handleQuestionChange(cIndex, qIndex, 'youtubeUrl', e.target.value)}
                                      placeholder="https://www.youtube.com/watch?v=..."
                                  />
                                </div>
                            </div>

                            {/* Right Col: Image Preview */}
                            <div className="flex flex-col">
                                <label className="block text-sm font-medium text-gray-400 mb-2">Image Attachment</label>
                                <div 
                                    className="flex-1 bg-black/30 border-2 border-dashed border-gray-700 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group min-h-[200px]"
                                    onPaste={(e) => handlePaste(e, cIndex, qIndex)}
                                >
                                    {q.image ? (
                                        <>
                                            <img src={q.image} className="max-w-full max-h-[300px] object-contain" alt="Question attachment" />
                                            <button 
                                                type="button"
                                                onClick={() => handleQuestionChange(cIndex, qIndex, 'image', '')}
                                                className="absolute top-2 right-2 p-2 bg-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4 text-white" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-gray-500 flex flex-col items-center pointer-events-none">
                                            <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                                            <p>Paste image here</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                          </div>

                          <div className="mt-8 flex justify-end pt-4 border-t border-gray-800">
                            <button
                              type="button"
                              onClick={() => setEditingCell(null)}
                              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg font-bold"
                            >
                              Done
                            </button>
                          </div>
                        </div>
                        {/* Backdrop click to close */}
                        <div className="absolute inset-0 -z-10" onClick={() => setEditingCell(null)}></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};