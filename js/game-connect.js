import { ensureAnonymousAuth } from './auth.js';
import { submitScore, fetchRanking } from './ranking-api.js';

const state = {
  ready: false,
  user: null,
  error: null,
};

const KEYS = {
  playerName: 'limitgame_last_player',
  avatar: 'limitgame_profile_avatar_v1',
};

function getPlayerName() {
  return (localStorage.getItem(KEYS.playerName) || 'Guest').trim().slice(0, 10) || 'Guest';
}

function getAvatar() {
  const raw = localStorage.getItem(KEYS.avatar);
  if (!raw) return '🙂';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.emoji) return parsed.emoji;
  } catch {}
  return raw || '🙂';
}

function formatMmDd(ts) {
  const d = new Date(ts || Date.now());
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
}

function brainModeFromTab() {
  if (document.getElementById('rankTabToday')?.classList.contains('active')) return 'hard';
  return 'normal';
}

function speedModeFromTab() {
  if (document.getElementById('speedRankTabHard')?.classList.contains('active')) return 'hard';
  if (document.getElementById('speedRankTabRound')?.classList.contains('active')) return 'round';
  return 'normal';
}

function renderBrainServerList(records) {
  const list = document.getElementById('rankList');
  if (!list) return;

  const myName = getPlayerName();
  if (!records.length) {
    const mode = brainModeFromTab();
    list.innerHTML = `<div class="rank-empty">No ${mode} record yet.<br>Be the first!</div>`;
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  list.innerHTML = records.slice(0, 5).map((r, i) => {
    const name = String(r.nickname || 'Guest').slice(0, 10);
    const avatar = r.avatar || '🙂';
    const score = Number(r.score || r.round || 0);
    const ts = r.created_at || r.ts || Date.now();
    const modeLabel = brainModeFromTab() === 'hard' ? 'Brain Limit · Hard' : 'Brain Limit · Normal';
    return `
      <div class="rank-row ${myName && name === myName ? 'rank-me' : ''}">
        <div class="rank-pos">${i < 3 ? medals[i] : (i + 1)}</div>
        <div class="rank-name">${avatar} ${name}</div>
        <div class="rank-stage">${modeLabel}</div>
        <div class="rank-score">${score}</div>
        <div class="rank-date">${formatMmDd(ts)}</div>
      </div>
    `;
  }).join('');
}

function renderSpeedServerList(records, mode) {
  const root = document.getElementById('speedRankList');
  const meta = document.getElementById('speedRankMeta');
  if (!root) return;

  const title = mode === 'hard' ? 'Hard' : (mode === 'round' ? 'Infinite' : 'Normal');
  if (meta) meta.textContent = `Top 10 · Server · ${title}`;

  if (!records.length) {
    root.innerHTML = `<div class="speed-rank-empty">No ${title} record yet.</div>`;
    return;
  }

  root.innerHTML = `
    <div class="speed-rank-section">
      ${records.slice(0, 10).map((r, i) => `
        <div class="speed-rank-row ${i === 0 ? 'top1' : ''}">
          <div class="speed-rank-pos">#${i + 1}</div>
          <div class="speed-rank-label">${r.avatar || '🙂'} ${String(r.nickname || 'Guest').slice(0,10)}</div>
          <div class="speed-rank-score">${Number(r.score || r.round || 0)}R</div>
        </div>
      `).join('')}
    </div>
  `;
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
      return [];
    }
  }
};

function patchBrainLimitSubmit() {
  const original = window.addRankRecord;
  if (typeof original !== 'function') return;
  window.addRankRecord = function patchedAddRankRecord(name, score, stageName) {
    const result = original.apply(this, arguments);
    const stage = String(stageName || '');
    const mode = /Hard/.test(stage) ? 'hard' : (/Normal/.test(stage) ? 'normal' : null);
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

function patchSpeedInfiniteSubmit() {
  const original = window.updateSpeedInfiniteRanking;
  if (typeof original !== 'function') return;
  window.updateSpeedInfiniteRanking = function patchedUpdateSpeedInfiniteRanking(mode, score) {
    const result = original.apply(this, arguments);
    const normalizedMode = mode === 'hard' ? 'hard' : (mode === 'round' ? 'round' : 'normal');
    window.gameConnect.submitScore({
      gameType: 'speed_infinite',
      mode: normalizedMode,
      nickname: getPlayerName(),
      avatar: getAvatar(),
      score: Number(score || 0),
      round: Number(score || 0),
    });
    return result;
  };
}

function patchBrainRankingRender() {
  const original = window.renderRanking;
  if (typeof original !== 'function') return;

  window.renderRanking = async function patchedRenderRanking() {
    const mineTab = document.getElementById('rankTabMine');
    if (mineTab?.classList.contains('active')) {
      return original.apply(this, arguments);
    }

    const mode = brainModeFromTab();
    const records = await window.gameConnect.fetchRanking('brain_limit', mode, { limit: 5 });
    if (!records?.length) {
      return original.apply(this, arguments);
    }
    renderBrainServerList(records);
  };
}

function patchSpeedRankingRender() {
  const original = window.setSpeedRankTab;
  if (typeof original !== 'function') return;

  window.setSpeedRankTab = async function patchedSetSpeedRankTab(tab) {
    original.apply(this, arguments);
    const mode = tab === 'hard' ? 'hard' : (tab === 'round' ? 'round' : 'normal');
    const records = await window.gameConnect.fetchRanking('speed_infinite', mode, { limit: 10 });
    if (!records?.length) return;
    renderSpeedServerList(records, mode);
  };
}

function installPatches() {
  patchBrainLimitSubmit();
  patchSpeedInfiniteSubmit();
  patchBrainRankingRender();
  patchSpeedRankingRender();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await initGameConnect();
    installPatches();
  }, { once: true });
} else {
  initGameConnect().then(installPatches);
}
