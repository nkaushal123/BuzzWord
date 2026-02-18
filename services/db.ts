import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, GameBoard } from '../types';

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
        if (!supabase) throw new Error("Database not connected. Please configure Supabase in the main menu.");
        
        const { data, error } = await supabase.from('users').select('*');
        if (error) throw error;
        return (data || []).map((row: any) => row.json_data as User);
    },

    saveUser: async (user: User): Promise<void> => {
        if (!supabase) throw new Error("Database not connected. Please configure Supabase in the main menu.");

        // Upsert based on username
        const { error } = await supabase.from('users').upsert({
            username: user.username,
            json_data: user
        }, { onConflict: 'username' });
        
        if (error) throw error;
    },

    // --- BOARDS ---

    getBoards: async (ownerId?: string | null): Promise<GameBoard[]> => {
        if (!supabase) throw new Error("Database not connected. Please configure Supabase in the main menu.");

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
    },

    saveBoard: async (board: GameBoard): Promise<void> => {
        if (!supabase) throw new Error("Database not connected. Please configure Supabase in the main menu.");

        const { error } = await supabase.from('boards').upsert({
            id: board.id,
            owner_id: board.ownerId || null,
            json_data: board
        });
        if (error) throw error;
    },

    deleteBoard: async (boardId: string): Promise<void> => {
        if (!supabase) throw new Error("Database not connected. Please configure Supabase in the main menu.");

        const { error } = await supabase.from('boards').delete().eq('id', boardId);
        if (error) throw error;
    }
};