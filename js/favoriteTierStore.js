/**
 * Shared favorite/tier storage.
 * V2 schema is stored in chrome.storage.local and keeps legacy starredChannels.
 */
(function() {
  'use strict';

  const STATE_KEY = 'chzzkFavoriteTierState';
  const LEGACY_STAR_KEY = 'starredChannels';
  const ACTIVITY_STREAMERS_KEY = 'satChzzkStreamers';
  const ACTIVITY_STATES_KEY = 'satChzzkStates';
  const DEFAULT_TIERS = [
    { id: 's', label: 'S', color: '#ff6b6b', order: 0 },
    { id: 'a', label: 'A', color: '#ffd166', order: 1 },
    { id: 'b', label: 'B', color: '#7bd88f', order: 2 },
    { id: 'c', label: 'C', color: '#73c2fb', order: 3 },
    { id: 'd', label: 'D', color: '#b8b8c7', order: 4 }
  ];

  function blankState() {
    return {
      version: 2,
      channels: {},
      starred: [],
      tiers: DEFAULT_TIERS.map(tier => ({ ...tier })),
      assignments: {},
      tierOrder: { s: [], a: [], b: [], c: [], d: [] }
    };
  }

  function unique(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function normalizeState(value) {
    const state = { ...blankState(), ...(value || {}) };
    state.version = 2;
    state.channels = state.channels && typeof state.channels === 'object' ? state.channels : {};
    state.starred = unique(state.starred);
    state.tiers = Array.isArray(state.tiers) && state.tiers.length ? state.tiers : DEFAULT_TIERS.map(tier => ({ ...tier }));
    state.assignments = state.assignments && typeof state.assignments === 'object' ? state.assignments : {};
    state.tierOrder = state.tierOrder && typeof state.tierOrder === 'object' ? state.tierOrder : {};
    state.tiers.forEach((tier) => {
      state.tierOrder[tier.id] = unique(state.tierOrder[tier.id]);
    });
    return state;
  }

  function cloneState(state) {
    return normalizeState(JSON.parse(JSON.stringify(state || blankState())));
  }

  class FavoriteTierStore {
    constructor(platform) {
      this.platform = platform || (typeof window !== 'undefined' ? window.ChzzkPlatform : null);
      this.state = blankState();
      this.loaded = false;
    }

    async load() {
      if (!this.platform?.storage) {
        this.state = blankState();
        this.loaded = true;
        return this.state;
      }

      const [localResult, syncResult] = await Promise.all([
        this.platform.storageGet('local', [STATE_KEY, LEGACY_STAR_KEY, ACTIVITY_STREAMERS_KEY, ACTIVITY_STATES_KEY]).catch((error) => {
          if (this.platform?.isContextInvalidatedError?.(error)) throw error;
          return {};
        }),
        this.platform.storageGet('sync', LEGACY_STAR_KEY).catch((error) => {
          if (this.platform?.isContextInvalidatedError?.(error)) throw error;
          return {};
        })
      ]);

      const legacyStarred = unique([
        ...(Array.isArray(localResult?.[LEGACY_STAR_KEY]) ? localResult[LEGACY_STAR_KEY] : []),
        ...(Array.isArray(syncResult?.[LEGACY_STAR_KEY]) ? syncResult[LEGACY_STAR_KEY] : [])
      ]);

      const loaded = normalizeState(localResult?.[STATE_KEY]);
      loaded.starred = unique([...loaded.starred, ...legacyStarred]);

      legacyStarred.forEach((id) => {
        if (!loaded.channels[id]) {
          loaded.channels[id] = { id, name: id, href: `/live/${id}`, avatarUrl: '', lastSeenAt: 0, source: 'legacy-starred' };
        }
      });

      const activityStates = localResult?.[ACTIVITY_STATES_KEY] && typeof localResult[ACTIVITY_STATES_KEY] === 'object'
        ? localResult[ACTIVITY_STATES_KEY]
        : {};
      const activityStreamers = Array.isArray(localResult?.[ACTIVITY_STREAMERS_KEY]) ? localResult[ACTIVITY_STREAMERS_KEY] : [];
      activityStreamers.forEach((streamer) => {
        const id = streamer?.channelId;
        if (!id) return;
        const liveState = activityStates[id] || {};
        loaded.channels[id] = {
          ...(loaded.channels[id] || {}),
          id,
          name: streamer.name || liveState.channelName || loaded.channels[id]?.name || id,
          href: `/live/${id}`,
          avatarUrl: streamer.profileImageUrl || liveState.profileImageUrl || loaded.channels[id]?.avatarUrl || '',
          lastSeenAt: loaded.channels[id]?.lastSeenAt || Date.now(),
          liveStatus: liveState.isLive ? 'live' : 'offline',
          activityEnabled: streamer.enabled !== false,
          source: loaded.channels[id]?.source || 'activity-tracker'
        };
      });

      this.state = loaded;
      this.loaded = true;
      try {
        await this.save();
      } catch (error) {
        if (!this.platform?.isContextInvalidatedError?.(error)) throw error;
        this.platform?.markContextInvalidated?.(error);
      }
      return this.state;
    }

    async ensureLoaded() {
      return this.loaded ? this.state : this.load();
    }

    async save() {
      const state = normalizeState(this.state);
      this.state = state;
      if (!this.platform?.storage) return state;
      this.assertExtensionContextAvailable();

      try {
        await Promise.all([
          this.platform.storageSet('local', { [STATE_KEY]: state, [LEGACY_STAR_KEY]: state.starred }),
          this.platform.storageSet('sync', { [LEGACY_STAR_KEY]: state.starred }).catch(() => undefined)
        ]);
      } catch (error) {
        if (this.platform?.isContextInvalidatedError?.(error)) {
          this.platform?.markContextInvalidated?.(error);
          window.ChzzkLogger?.warn?.('[STORE] Extension context was invalidated during save; reload the CHZZK tab to continue.');
        }
        throw error;
      }
      return state;
    }

    assertExtensionContextAvailable() {
      if (!this.platform?.isContextInvalidated?.()) return;
      const error = new Error('Extension context invalidated.');
      error.code = 'EXTENSION_CONTEXT_INVALIDATED';
      this.platform?.markContextInvalidated?.(error);
      throw error;
    }

    async mergeChannels(channels) {
      await this.ensureLoaded();
      const previousState = cloneState(this.state);
      (channels || []).forEach((channel) => {
        if (!channel?.id) return;
        this.state.channels[channel.id] = {
          ...(this.state.channels[channel.id] || {}),
          id: channel.id,
          name: channel.name || this.state.channels[channel.id]?.name || channel.id,
          href: channel.href || this.state.channels[channel.id]?.href || `/live/${channel.id}`,
          avatarUrl: channel.avatarUrl || this.state.channels[channel.id]?.avatarUrl || '',
          lastSeenAt: channel.lastSeenAt || Date.now(),
          liveStatus: channel.isLive ? 'live' : (channel.liveStatus || this.state.channels[channel.id]?.liveStatus || 'offline'),
          activityEnabled: channel.activityEnabled ?? this.state.channels[channel.id]?.activityEnabled ?? false,
          source: channel.source || this.state.channels[channel.id]?.source || 'chzzk-page'
        };
      });
      try {
        return await this.save();
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    }

    async setStarred(channelId, starred, channel) {
      await this.ensureLoaded();
      if (!channelId) return this.state;
      const previousState = cloneState(this.state);
      if (channel) {
        this.state.channels[channelId] = { ...(this.state.channels[channelId] || {}), ...channel, id: channelId };
      } else if (!this.state.channels[channelId]) {
        this.state.channels[channelId] = { id: channelId, name: channelId, href: `/live/${channelId}`, avatarUrl: '', lastSeenAt: Date.now() };
      }

      const next = new Set(this.state.starred);
      if (starred) next.add(channelId);
      else {
        next.delete(channelId);
        delete this.state.assignments[channelId];
        Object.keys(this.state.tierOrder).forEach((tierId) => {
          this.state.tierOrder[tierId] = this.state.tierOrder[tierId].filter(id => id !== channelId);
        });
      }
      this.state.starred = Array.from(next);
      try {
        return await this.save();
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    }

    async assignTier(channelId, tierId) {
      await this.ensureLoaded();
      if (!channelId) return this.state;
      const previousState = cloneState(this.state);
      Object.keys(this.state.tierOrder).forEach((id) => {
        this.state.tierOrder[id] = this.state.tierOrder[id].filter(existing => existing !== channelId);
      });

      if (tierId) {
        this.state.assignments[channelId] = tierId;
        this.state.tierOrder[tierId] = unique([...(this.state.tierOrder[tierId] || []), channelId]);
        this.state.starred = unique([...this.state.starred, channelId]);
      } else {
        delete this.state.assignments[channelId];
      }
      try {
        return await this.save();
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    }

    async reorderTier(tierId, orderedIds) {
      await this.ensureLoaded();
      if (!this.state.tierOrder[tierId]) return this.state;
      const previousState = cloneState(this.state);
      this.state.tierOrder[tierId] = unique(orderedIds).filter(id => this.state.assignments[id] === tierId);
      try {
        return await this.save();
      } catch (error) {
        this.state = previousState;
        throw error;
      }
    }

    getChannelOrder(channelId) {
      const tierId = this.state.assignments[channelId] || '';
      if (!tierId) return { tierRank: 99, order: 9999, tierId: '' };
      const tier = this.state.tiers.find(item => item.id === tierId);
      const order = this.state.tierOrder[tierId]?.indexOf(channelId) ?? -1;
      return {
        tierRank: tier ? tier.order : 99,
        order: order >= 0 ? order : 9999,
        tierId
      };
    }
  }

  const api = { FavoriteTierStore, STATE_KEY, LEGACY_STAR_KEY, DEFAULT_TIERS, blankState, normalizeState, cloneState };

  if (typeof window !== 'undefined') {
    const store = new FavoriteTierStore(window.ChzzkPlatform);
    window.ChzzkFavoriteTierStore = store;
    window.ChzzkFavoriteTier = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
