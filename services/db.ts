import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, GameBoard } from '../types';

const USERS_KEY = 'buzzword_users';
const BOARDS_KEY = 'buzzword_boards';
const DB_CONFIG_KEY = 'buzzword_db_config';

interface DbConfig {
    url: string;
    key: string;
}

let supabase: SupabaseClient | null = null;

// Initialize Supabase if config exists
const initSupabase = () => {
    try {
        const configStr = localStorage.getItem(DB_CONFIG_KEY);
        if (configStr) {
            const config: DbConfig = JSON.parse(configStr);
            if (config.url && config.key) {
                supabase = createClient(config.url, config.key);
                console.log("Supabase Client Initialized");
            }
        }
    } catch (e) {
        console.error("Failed to init supabase", e);
    }
};

initSupabase();

export const DatabaseService = {
    isConnected: () => !!supabase,

    setConnection: (url: string, key: string) => {
        localStorage.setItem(DB_CONFIG_KEY, JSON.stringify({ url, key }));
        initSupabase();
        window.location.reload(); // Reload to ensure services pick up the new DB
    },

    disconnect: () => {
        localStorage.removeItem(DB_CONFIG_KEY);
        supabase = null;
        window.location.reload();
    },

    // --- USERS ---

    getUsers: async (): Promise<User[]> => {
        if (supabase) {
            const { data, error } = await supabase.from('users').select('*');
            if (error) throw error;
            // Map DB snake_case to app camelCase if needed, but assuming JSONB 'data' column or mapped columns
            // For simplicity, we assume we store the whole User object in a 'data' JSONB column
            // OR we map columns. Let's assume a 'users' table with a 'json_data' column for flexibility
            // Table Schema assumption: id (uuid), username (text, unique), json_data (jsonb)
            return (data || []).map((row: any) => row.json_data as User);
        } else {
            const data = localStorage.getItem(USERS_KEY);
            return data ? JSON.parse(data) : [];
        }
    },

    saveUser: async (user: User): Promise<void> => {
        if (supabase) {
            // Upsert based on username
            const { error } = await supabase.from('users').upsert({
                username: user.username,
                json_data: user
            }, { onConflict: 'username' });
            
            if (error) throw error;
        } else {
            const users = await DatabaseService.getUsers();
            const index = users.findIndex(u => u.username === user.username);
            if (index >= 0) users[index] = user;
            else users.push(user);
            localStorage.setItem(USERS_KEY, JSON.stringify(users));
        }
    },

    // --- BOARDS ---

    getBoards: async (ownerId?: string | null): Promise<GameBoard[]> => {
        if (supabase) {
            let query = supabase.from('boards').select('*');
            if (ownerId) {
                query = query.eq('owner_id', ownerId);
            } else {
                // Guests boards
                query = query.is('owner_id', null);
            }
            
            const { data, error } = await query;
            if (error) throw error;
            return (data || []).map((row: any) => row.json_data as GameBoard);
        } else {
            const data = localStorage.getItem(BOARDS_KEY);
            const all: GameBoard[] = data ? JSON.parse(data) : [];
            if (ownerId) {
                return all.filter(b => b.ownerId === ownerId);
            } else {
                return all.filter(b => !b.ownerId);
            }
        }
    },

    saveBoard: async (board: GameBoard): Promise<void> => {
        if (supabase) {
            const { error } = await supabase.from('boards').upsert({
                id: board.id,
                owner_id: board.ownerId || null,
                json_data: board
            });
            if (error) throw error;
        } else {
            const data = localStorage.getItem(BOARDS_KEY);
            const all: GameBoard[] = data ? JSON.parse(data) : [];
            const index = all.findIndex(b => b.id === board.id);
            if (index >= 0) all[index] = board;
            else all.push(board);
            localStorage.setItem(BOARDS_KEY, JSON.stringify(all));
        }
    },

    deleteBoard: async (boardId: string): Promise<void> => {
        if (supabase) {
            const { error } = await supabase.from('boards').delete().eq('id', boardId);
            if (error) throw error;
        } else {
            const data = localStorage.getItem(BOARDS_KEY);
            const all: GameBoard[] = data ? JSON.parse(data) : [];
            const filtered = all.filter(b => b.id !== boardId);
            localStorage.setItem(BOARDS_KEY, JSON.stringify(filtered));
        }
    }
};