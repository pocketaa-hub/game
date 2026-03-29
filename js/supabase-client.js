import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const { url, anonKey } = window.SUPABASE_CONFIG;

export const supabase = createClient(url, anonKey);
