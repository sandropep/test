import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = 'https://mkumxedlfoxjqggsnctq.supabase.co';
const supabaseAnonKey = 'sb_publishable_Ud7dAsBGhUVIO7KHjJR6FQ_HTu5n6VN';

const webStorage = {
  getItem: (key: string): Promise<string | null> =>
    Promise.resolve(typeof window !== 'undefined' ? window.localStorage.getItem(key) : null),
  setItem: (key: string, value: string): Promise<void> =>
    Promise.resolve(void (typeof window !== 'undefined' && window.localStorage.setItem(key, value))),
  removeItem: (key: string): Promise<void> =>
    Promise.resolve(void (typeof window !== 'undefined' && window.localStorage.removeItem(key))),
};

let _client: SupabaseClient | null = null;

function getInstance(): SupabaseClient {
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _client;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    return getInstance()[prop as keyof SupabaseClient];
  },
});
