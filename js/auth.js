import { supabase } from './supabase-client.js';

export async function ensureAnonymousAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) return session.user;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;

  return data.user;
}
