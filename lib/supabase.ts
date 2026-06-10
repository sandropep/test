import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkumxedlfoxjqggsnctq.supabase.co';
const supabaseAnonKey = 'sb_publishable_Ud7dAsBGhUVIO7KHjJR6FQ_HTu5n6VN';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
