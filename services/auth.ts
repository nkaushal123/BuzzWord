import { User, UserStats, ModeStats } from '../types';

const USERS_KEY = 'buzzword_users';
const CURRENT_USER_KEY = 'buzzword_current_user';

// Initial empty stats helper
const createEmptyModeStats = (): ModeStats => ({
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  questionsAttempted: 0,
  questionsCorrect: 0,
  bestGameScore: 0
});

const getUsers = (): User[] => {
  try {
    const data = localStorage.getItem(USERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveUsers = (users: User[]) => {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
};

export const AuthService = {
  // Sign Up
  register: (username: string, password?: string): User => {
    const users = getUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Username already exists');
    }

    const newUser: User = {
      username,
      password, // Save password
      stats: {
        solo: createEmptyModeStats(),
        team: createEmptyModeStats(),
        categoryStats: {},
        totalBuzzes: 0,
        dailyDoublesAttempted: 0
      },
      createdAt: Date.now()
    };

    users.push(newUser);
    saveUsers(users);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(newUser));
    return newUser;
  },

  // Login
  login: (username: string, password?: string): User => {
    const users = getUsers();
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    
    if (!user) {
      throw new Error('User not found. Please register.');
    }

    // Simple password check (Client-side only)
    if (user.password && user.password !== password) {
        throw new Error('Incorrect password');
    }
    
    // Migration check for old user objects (if any)
    if (!user.stats.solo) {
        user.stats = {
            solo: createEmptyModeStats(),
            team: createEmptyModeStats(),
            categoryStats: {},
            totalBuzzes: 0,
            dailyDoublesAttempted: 0
        };
        // Attempt to migrate flat stats if they existed
        // @ts-ignore
        if (user.stats.totalScore) user.stats.solo.totalScore = user.stats.totalScore;
    }

    // If migrating an old user to add a password
    if (!user.password && password) {
        user.password = password;
        saveUsers(users);
    }

    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): User | null => {
    try {
      const data = localStorage.getItem(CURRENT_USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  // Update Stats - Now accepts a complex update object
  updateStats: (
      mode: 'solo' | 'team', 
      updates: Partial<ModeStats>, 
      categoryUpdate?: { title: string; correct: boolean; points: number },
      generalUpdate?: Partial<UserStats>
  ) => {
    const currentUser = AuthService.getCurrentUser();
    if (!currentUser) return;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.username === currentUser.username);
    
    if (userIndex === -1) return;

    const user = users[userIndex];

    // 1. Update Mode Stats (Solo or Team)
    const currentModeStats = user.stats[mode];
    user.stats[mode] = {
      gamesPlayed: currentModeStats.gamesPlayed + (updates.gamesPlayed || 0),
      gamesWon: currentModeStats.gamesWon + (updates.gamesWon || 0),
      totalScore: currentModeStats.totalScore + (updates.totalScore || 0),
      questionsAttempted: currentModeStats.questionsAttempted + (updates.questionsAttempted || 0),
      questionsCorrect: currentModeStats.questionsCorrect + (updates.questionsCorrect || 0),
      bestGameScore: Math.max(currentModeStats.bestGameScore, updates.bestGameScore || 0)
    };

    // 2. Update Category Stats
    if (categoryUpdate) {
        const catKey = categoryUpdate.title;
        if (!user.stats.categoryStats[catKey]) {
            user.stats.categoryStats[catKey] = { correct: 0, wrong: 0, pointsEarned: 0 };
        }
        
        const catStat = user.stats.categoryStats[catKey];
        if (categoryUpdate.correct) {
            catStat.correct++;
            catStat.pointsEarned += categoryUpdate.points;
        } else {
            catStat.wrong++;
            catStat.pointsEarned -= categoryUpdate.points;
        }
    }

    // 3. General Updates (Buzzes, DDs)
    if (generalUpdate) {
        if (generalUpdate.totalBuzzes) user.stats.totalBuzzes = (user.stats.totalBuzzes || 0) + generalUpdate.totalBuzzes;
        if (generalUpdate.dailyDoublesAttempted) user.stats.dailyDoublesAttempted = (user.stats.dailyDoublesAttempted || 0) + generalUpdate.dailyDoublesAttempted;
    }

    // Save
    users[userIndex] = user;
    saveUsers(users);
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  getLeaderboard: (): User[] => {
    // Sort by total score (combined solo + team) or just solo for now
    return getUsers().sort((a, b) => (b.stats.solo.totalScore + b.stats.team.totalScore) - (a.stats.solo.totalScore + a.stats.team.totalScore));
  }
};
