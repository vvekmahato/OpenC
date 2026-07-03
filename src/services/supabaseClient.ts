import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verify if the credentials are valid and not default placeholders
const hasValidCredentials =
  Boolean(supabaseUrl) &&
  supabaseUrl !== 'your_supabase_project_url' &&
  Boolean(supabaseAnonKey) &&
  supabaseAnonKey !== 'your_supabase_anon_key';

export const supabase = hasValidCredentials
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

if (!supabase) {
  console.warn(
    'Supabase keys are missing or invalid. Operating in LocalStorage Mock Mode.\n' +
    'To connect to your cloud database, copy .env.example to .env and fill in your Supabase credentials.'
  );
}
