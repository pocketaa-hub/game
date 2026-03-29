import { ensureAnonymousAuth } from './auth.js';
import { submitScore, fetchRanking } from './ranking-api.js';

const state = {
  ready: false,
  user: null,
  error: null,
};

const STORAGE_KEYS = {
  playerName: 'limitgame_player_name',
  lastPlayer: 'limitgame_last_player',
  profileAvatar: 'limitgame_profile_avatar_v1',
  avatar: 'limitgame_avatar',
};

function getPlayerName() {
  return (
    localStorage.getItem(STORAGE_KEYS.playerName) ||
    localStorage.getItem(STORAGE_KEYS.lastPlayer) ||
    'Guest'
  ).trim().slice(0, 10) || 'Guest';
}

function getAvatar() {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.profileAvatar) ||
      localStorage.getItem(STORAGE_KEYS.avatar);

    if (!raw) return '🙂';

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.emoji) {
      return parsed.emoji;
    }

    return raw || '🙂';
  } catch {
    return '🙂';
  }
}

function getSpeedGameType(mode) {
  if (mode === 'hard' || mode === 'normal') {
    return 'speed_time_attack';
  }
  if (mode === 'round') {
    return 'speed_infinite';
  }
  return 'speed_time_attack';
}

async function initGameConnect() {
  if (state.ready && state.user) return state.user;

  try {
    if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.anonKey) {
      throw new Error('SUPABASE_CONFIG is missing. Check js/config.js');
    }

    const user = await ensureAnonymousAuth();

    state.user = user || null;
    state.ready = true;
    state.error = null;

    console.log('[game-connect] anonymous auth ready', user?.id || '(no user id)');
    return state.user;
  } catch (error) {
    state.ready = false;
    state.user = null;
    state.error = error;
    console.error('[game-connect] init failed', error);
    return null;
  }
}

window.gameConnect = {
  init: initGameConnect,
  isReady: () => state.ready,
  getUser: () => state.user,
  getError: () => state.error,

  async submitScore(payload) {
    await initGameConnect();
    if (!state.ready) return false;

    try {
      await submitScore(payload);
      return true;
    } catch (error) {
      console.error('[game-connect] submitScore failed', error);
      return false;
    }
  },

  async fetchRanking(gameType, mode, options = {}) {
    try {
      return await fetchRanking(gameType, mode, options);
    } catch (error) {
      console.error('[game-connect] fetchRanking failed', error);
      return options.includeMine
        ? { items: [], myEntry: null, totalCount: 0 }
        : [];
    }
  }
};

function patchBrainLimitSubmit() {
  const original = window.addRankRecord;
  if (typeof original !== 'function' || window.__brainLimitPatched) return;

  window.__brainLimitPatched = true;

  window.addRankRecord = function patchedAddRankRecord(name, score, stageName) {
    const result = original.apply(this, arguments);

    const stage = String(stageName || '');
    const mode = /Hard/.test(stage)
      ? 'hard'
      : /Normal/.test(stage)
        ? 'normal'
        : null;

    if (!mode) return result;

    window.gameConnect.submitScore({
      gameType: 'brain_limit',
      mode,
      nickname: (name || getPlayerName()).trim().slice(0, 10) || 'Guest',
      avatar: getAvatar(),
      score: Number(score || 0),
      round: Number(score || 0),
    });

    return result;
  };
}

function patchSpeedSubmit() {
  const original = window.updateSpeedInfiniteRanking;
  if (typeof original !== 'function' || window.__speedSubmitPatched) return;

  window.__speedSubmitPatched = true;

  window.updateSpeedInfiniteRanking = function patchedUpdateSpeedInfiniteRanking(mode, score) {
    const result = original.apply(this, arguments);

    const normalizedMode =
      mode === 'hard'
        ? 'hard'
        : mode === 'round'
          ? 'round'
          : 'normal';

    const gameType = getSpeedGameType(normalizedMode);

    window.gameConnect.submitScore({
      gameType,
      mode: normalizedMode,
      nickname: getPlayerName(),
      avatar: getAvatar(),
      score: Number(score || 0),
      round: Number(score || 0),
    });

    return result;
  };
}

function installPatches() {
  patchBrainLimitSubmit();
  patchSpeedSubmit();
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      initGameConnect().then(installPatches);
    },
    { once: true }
  );
} else {
  initGameConnect().then(installPatches);
}
