import { GameBoard, Category, Question } from '../types';

const STORAGE_KEY = 'buzzword_boards';

const generateId = () => Math.random().toString(36).substr(2, 9);

export const createEmptyBoard = (): GameBoard => {
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
    title: 'New Game',
    createdAt: Date.now(),
    categories
  };
};

export const saveBoard = (board: GameBoard): void => {
  // Safety check: Prevent React Events or DOM nodes from being passed as board
  if (!board || typeof board !== 'object' || 'nativeEvent' in board || 'preventDefault' in board) {
    console.error("Invalid board object passed to saveBoard:", board);
    return;
  }

  const boards = getBoards();
  const index = boards.findIndex(b => b.id === board.id);
  if (index >= 0) {
    boards[index] = board;
  } else {
    boards.push(board);
  }
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch (e) {
    console.error("Failed to save board to localStorage", e);
  }
};

export const getBoards = (): GameBoard[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load boards", e);
    return [];
  }
};

export const deleteBoard = (id: string): void => {
  // Safety check to ensure ID is a string
  if (typeof id !== 'string') {
    console.error("Invalid ID passed to deleteBoard:", id);
    return;
  }

  const boards = getBoards().filter(b => b.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch (e) {
    console.error("Failed to update boards after deletion", e);
  }
};