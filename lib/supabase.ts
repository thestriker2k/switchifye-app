import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SUPABASE_URL = "https://jxcwfcbwgqjifmiyeenh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4Y3dmY2J3Z3FqaWZtaXllZW5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMDQyNTcsImV4cCI6MjA4Mjc4MDI1N30.y-FvSge9Mrz86Pe8_HyVl2GUgUAf_UDHAJ1bwSPCGpU";

export { SUPABASE_URL, SUPABASE_ANON_KEY };

console.log(`[supabase] URL: ${SUPABASE_URL}`);
console.log(`[supabase] ANON_KEY: ${SUPABASE_ANON_KEY.slice(0, 20)}...`);

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
