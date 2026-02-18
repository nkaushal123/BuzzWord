
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
  id: string; 
  ownerId?: string; // Links board to a specific user account
  title: string;
  createdAt: number; 
  categories: Category[];
}

// User & Stats Types
export interface ModeStats {
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number; // Cumulative currency
  questionsAttempted: number;
  questionsCorrect: number;
  bestGameScore: number;
}

export interface UserStats {
  solo: ModeStats;
  team: ModeStats;
  // Track performance by category name (e.g. "Science": { correct: 5, total: 6 })
  categoryStats: Record<string, { correct: number; wrong: number; pointsEarned: number }>;
  totalBuzzes: number;
  dailyDoublesAttempted: number;
}

export interface User {
  username: string;
  password?: string; // Added password for verification during sync
  stats: UserStats;
  createdAt: number;
}

// Multiplayer / State Types
export interface Player {
  id: string;
  name: string;
  score: number;
}

export interface Team {
  id: string;
  name: string;
  score: number;
  members: string[]; // Array of Player IDs
}

export enum GamePhase {
  LOBBY = 'LOBBY', 
  BOARD = 'BOARD',
  QUESTION = 'QUESTION',
  ANSWER = 'ANSWER',
  GAME_OVER = 'GAME_OVER'
}

export interface GameState {
  lobbyCode: string;
  phase: GamePhase;
  currentQuestionId: string | null;
  currentCategoryId: string | null;
  answeredQuestions: string[];
  buzzedPlayerId: string | null;
  buzzLocked: boolean;
  players: Player[];
  board: GameBoard | null;
  
  // Teams Mode
  isTeamsMode: boolean;
  teams: Team[];
  
  // Lockout Logic
  blockedPlayerIds: string[];
  blockedTeamIds: string[];

  // Timer Logic
  timer: number | null; // Null if inactive, Integer seconds if active
  timerMode: 'BUZZ' | 'ANSWER' | null; // 'BUZZ' = waiting for buzzer (10s), 'ANSWER' = waiting for answer (5s)
}

// Comms
export type CommsMessage = 
  | { type: 'PLAYER_JOIN'; payload: { id: string; name: string } }
  | { type: 'BUZZ'; payload: { playerId: string } }
  | { type: 'HOST_SYNC'; payload: GameState }
  | { type: 'AWARD_POINTS'; payload: { playerId: string; points: number } }
  | { type: 'RESET_BUZZER'; payload: null }
  | { type: 'CREATE_TEAM'; payload: { name: string; playerId: string } }
  | { type: 'JOIN_TEAM'; payload: { teamId: string; playerId: string } }
  | { type: 'RESULT_EVENT'; payload: { playerId: string; correct: boolean; points: number; categoryTitle: string; isDailyDouble: boolean } }
  | { type: 'GAME_OVER_SUMMARY'; payload: { winners: string[] } }
  | { type: 'TIME_SYNC'; payload: { timer: number; timerMode: 'BUZZ' | 'ANSWER' | null } }
  | { type: 'SYNC_REQUEST'; payload: null }
  | { type: 'SYNC_DATA'; payload: { user: User; boards: GameBoard[] } };