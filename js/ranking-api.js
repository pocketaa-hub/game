import { supabase } from './supabase-client.js';
import { ensureAnonymousAuth } from './auth.js';

function toKstDate(date = new Date()) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + 9 * 60 * 60 * 1000);
}

function getPeriodStartIso(period) {
  const kstNow = toKstDate(new Date());

  if (period === 'weekly') {
    const day = kstNow.getUTCDay(); // 0: Sun, 1: Mon
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(kstNow);
    monday.setUTCDate(kstNow.getUTCDate() - diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    return new Date(monday.getTime() - 9 * 60 * 60 * 1000).toISOString();
  }

  if (period === 'monthly') {
    const first = new Date(kstNow);
    first.setUTCDate(1);
    first.setUTCHours(0, 0, 0, 0);
    return new Date(first.getTime() - 9 * 60 * 60 * 1000).toISOString();
  }

  return null;
}

function dedupeByUser(rows) {
  const bestMap = new Map();

  for (const row of rows || []) {
    const key = row.user_id || `name:${row.nickname || 'Guest'}`;
    const prev = bestMap.get(key);

    if (!prev) {
      bestMap.set(key, row);
      continue;
    }

    const prevScore = Number(prev.score || prev.round || 0);
    const currScore = Number(row.score || row.round || 0);
    const prevTime = new Date(prev.created_at || 0).getTime();
    const currTime = new Date(row.created_at || 0).getTime();

    if (currScore > prevScore || (currScore === prevScore && currTime < prevTime)) {
      bestMap.set(key, row);
    }
  }

  return Array.from(bestMap.values()).sort((a, b) => {
    const sa = Number(a.score || a.round || 0);
    const sb = Number(b.score || b.round || 0);
    if (sb !== sa) return sb - sa;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
}

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
  const limit = Math.max(1, Math.min(100, Number(options.limit || 100)));
  const period = options.period || 'all';
  const dedupe = options.dedupe !== false;
  const includeMine = options.includeMine === true;
  const nickname = options.nickname || null;

  let query = supabase
    .from('rankings')
    .select('*')
    .eq('game_type', gameType)
    .eq('mode', mode);

  const startIso = getPeriodStartIso(period);
  if (startIso) query = query.gte('created_at', startIso);
  if (nickname) query = query.eq('nickname', nickname);

  query = query
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(dedupe || includeMine ? 1000 : limit);

  const { data, error } = await query;
  if (error) throw error;

  let rows = data || [];
  if (dedupe) rows = dedupeByUser(rows);

  const top = rows.slice(0, limit);

  if (!includeMine) return top;

  const user = await ensureAnonymousAuth();
  const myKey = user?.id || null;

  let myEntry = null;
  const idx = rows.findIndex(r => (r.user_id || null) === myKey);

  if (idx >= 0) {
    myEntry = { ...rows[idx], rank: idx + 1 };
  } else if (nickname) {
    const idx2 = rows.findIndex(r => String(r.nickname || '') === String(nickname));
    if (idx2 >= 0) myEntry = { ...rows[idx2], rank: idx2 + 1 };
  }

  return {
    items: top,
    myEntry,
    totalCount: rows.length
  };
}
