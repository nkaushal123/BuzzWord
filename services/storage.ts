import { GameBoard, Category, Question } from '../types';

const STORAGE_KEY = 'buzzword_boards';

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

export const saveBoard = (board: GameBoard): void => {
  // Safety check
  if (!board || typeof board !== 'object' || 'nativeEvent' in board) {
    console.error("Invalid board object passed to saveBoard:", board);
    return;
  }

  // Load ALL boards from storage
  const allBoards = getAllBoardsRaw();
  const index = allBoards.findIndex(b => b.id === board.id);
  
  if (index >= 0) {
    allBoards[index] = board;
  } else {
    allBoards.push(board);
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allBoards));
  } catch (e) {
    console.error("Failed to save board to localStorage", e);
  }
};

// Internal helper to get everything regardless of user
const getAllBoardsRaw = (): GameBoard[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load boards", e);
    return [];
  }
}

// Public getter filtered by user
export const getBoards = (username?: string | null): GameBoard[] => {
  const all = getAllBoardsRaw();
  if (username) {
      // Return boards owned by this user
      return all.filter(b => b.ownerId === username);
  } else {
      // Return boards with NO owner (Guest boards)
      return all.filter(b => !b.ownerId);
  }
};

export const deleteBoard = (id: string): void => {
  const allBoards = getAllBoardsRaw();
  const filtered = allBoards.filter(b => b.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error("Failed to update boards after deletion", e);
  }
};

// --- SYNC HELPERS ---
export const saveSyncedBoards = (newBoards: GameBoard[]) => {
    const existing = getAllBoardsRaw();
    
    // Merge strategy: Overwrite existing IDs, add new ones
    newBoards.forEach(nb => {
        const idx = existing.findIndex(e => e.id === nb.id);
        if (idx >= 0) {
            existing[idx] = nb;
        } else {
            existing.push(nb);
        }
    });

    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}
