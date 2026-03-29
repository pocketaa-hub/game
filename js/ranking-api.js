import { supabase } from './supabase-client.js';
import { ensureAnonymousAuth } from './auth.js';

export async function submitScore(data) {
  const user = await ensureAnonymousAuth();

  const payload = {
    user_id: user.id,
    game_type: data.gameType,
    mode: data.mode,
    nickname: (data.nickname || 'Guest').trim().slice(0, 10),
    avatar: data.avatar || '🙂',
    score: Number(data.score || data.round || 0),
    round: Number(data.round || data.score || 0),
  };

  const { error } = await supabase.from('rankings').insert(payload);
  if (error) throw error;
  return payload;
}

export async function fetchRanking(gameType, mode, options = {}) {
  const limit = Math.max(1, Math.min(50, Number(options.limit || 10)));

  let query = supabase
    .from('rankings')
    .select('*')
    .eq('game_type', gameType)
    .eq('mode', mode)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options.nickname) {
    query = query.eq('nickname', options.nickname);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}
