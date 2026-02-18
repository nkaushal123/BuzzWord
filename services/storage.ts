import { GameBoard, Category, Question } from '../types';
import { DatabaseService } from './db';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const createEmptyBoard = (ownerId?: string): GameBoard => {
  const categories: Category[] = Array.from({ length: 5 }).map((_, cIndex) => ({
    id: generateId(),
    title: `Category ${cIndex + 1}`,
    questions: Array.from({ length: 5 }).map((_, qIndex) => ({
      id: generateId(),
      points: (qIndex + 1) * 200,
      question: '',
      answer: ''
    }))
  }));

  return {
    id: generateId(),
    ownerId, // Attach user if provided
    title: 'New Game',
    createdAt: Date.now(),
    categories
  };
};

export const saveBoard = async (board: GameBoard): Promise<void> => {
  // Safety check
  if (!board || typeof board !== 'object' || 'nativeEvent' in board) {
    console.error("Invalid board object passed to saveBoard:", board);
    return;
  }
  await DatabaseService.saveBoard(board);
};

// Public getter filtered by user
export const getBoards = async (username?: string | null): Promise<GameBoard[]> => {
    return await DatabaseService.getBoards(username);
};

export const deleteBoard = async (id: string): Promise<void> => {
    await DatabaseService.deleteBoard(id);
};

// --- SYNC HELPERS ---
export const saveSyncedBoards = async (newBoards: GameBoard[]) => {
    // This is typically used for peer-sync, but we can reuse DB save
    for (const b of newBoards) {
        await DatabaseService.saveBoard(b);
    }
}