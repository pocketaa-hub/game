import { supabase } from './supabase-client.js';
import { ensureAnonymousAuth } from './auth.js';

export async function submitScore(data) {
  const user = await ensureAnonymousAuth();

  const { error } = await supabase.from('rankings').insert({
    user_id: user.id,
    game_type: data.gameType,
    mode: data.mode,
    nickname: data.nickname,
    avatar: data.avatar,
    score: data.score,
    round: data.round
  });

  if (error) console.error(error);
}

export async function fetchRanking(gameType, mode) {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('game_type', gameType)
    .eq('mode', mode)
    .order('score', { ascending: false })
    .limit(10);

  if (error) console.error(error);
  return data;
}
