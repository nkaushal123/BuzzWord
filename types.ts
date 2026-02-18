
// Game Content Types
export interface Question {
  id: string;
  points: number;
  question: string;
  answer: string;
  image?: string; // Base64 encoded image string
  isDailyDouble?: boolean;
  youtubeUrl?: string;
}

export interface Category {
  id: string;
  title: string;
  questions: Question[];
}

export interface GameBoard {
  id: string; // Added for persistence
  title: string;
  createdAt: number; // Added for sorting
  categories: Category[];
}

// Multiplayer / State Types
export interface Player {
  id: string;
  name: string;
  score: number;
}

export enum GamePhase {
  LOBBY = 'LOBBY', // Added LOBBY phase
  BOARD = 'BOARD',
  QUESTION = 'QUESTION',
  ANSWER = 'ANSWER',
  GAME_OVER = 'GAME_OVER'
}

export interface GameState {
  lobbyCode: string; // Added lobby code
  phase: GamePhase;
  currentQuestionId: string | null;
  currentCategoryId: string | null;
  answeredQuestions: string[];
  buzzedPlayerId: string | null;
  buzzLocked: boolean;
  players: Player[];
  board: GameBoard | null;
}

// Comms
export type CommsMessage = 
  | { type: 'PLAYER_JOIN'; payload: { id: string; name: string } }
  | { type: 'BUZZ'; payload: { playerId: string } }
  | { type: 'HOST_SYNC'; payload: GameState }
  | { type: 'AWARD_POINTS'; payload: { playerId: string; points: number } }
  | { type: 'RESET_BUZZER'; payload: null };
