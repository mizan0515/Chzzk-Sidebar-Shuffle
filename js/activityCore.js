(function initActivityCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }
  root.StreamerActivityCore = core;
})(typeof globalThis !== "undefined" ? globalThis : window, function buildActivityCore() {
  const CHZZK_ID_PATTERN = /^[0-9a-f]{32}$/i;

  function nowIso() {
    return new Date().toISOString();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function makeId(prefix) {
    const body = String(prefix || "item")
      .toLowerCase()
      .replace(/[^a-z0-9\uac00-\ud7a3_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    return `${body || "item"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function extractChzzkChannelId(input) {
    const text = normalizeText(input);
    if (!text) {
      return "";
    }
    if (CHZZK_ID_PATTERN.test(text)) {
      return text;
    }
    try {
      const url = new URL(text);
      const parts = url.pathname.split("/").filter(Boolean);
      const liveIndex = parts.indexOf("live");
      if (liveIndex >= 0 && CHZZK_ID_PATTERN.test(parts[liveIndex + 1] || "")) {
        return parts[liveIndex + 1];
      }
      const channelIndex = parts.indexOf("channel");
      if (channelIndex >= 0 && CHZZK_ID_PATTERN.test(parts[channelIndex + 1] || "")) {
        return parts[channelIndex + 1];
      }
      const last = parts[parts.length - 1] || "";
      return CHZZK_ID_PATTERN.test(last) ? last : "";
    } catch (error) {
      const match = text.match(/[0-9a-f]{32}/i);
      return match ? match[0] : "";
    }
  }

  function normalizeChzzkLiveStatus(payload, channelId) {
    const content = payload && payload.content ? payload.content : payload || {};
    const channel = content.channel || {};
    const status = normalizeText(content.status || content.liveStatus).toUpperCase();
    const title = normalizeText(content.liveTitle || content.title);
    const imageUrl = normalizeText(content.liveImageUrl || content.defaultThumbnailImageUrl || content.thumbnailUrl);
    const channelName = normalizeText(channel.channelName || content.channelName);
    const isLive = status === "OPEN" || status === "LIVE" || status === "ON_AIR" || content.openLive === true;

    return {
      channelId,
      channelName,
      imageUrl,
      isLive,
      profileImageUrl: normalizeText(channel.channelImageUrl || content.profileImageUrl),
      rawStatus: status || "UNKNOWN",
      title,
      url: channelId ? `https://chzzk.naver.com/live/${channelId}` : "",
      checkedAt: nowIso()
    };
  }

  function detectChzzkEvents(previous, current, options) {
    const settings = options || {};
    if (!current || current.error) {
      return [];
    }
    if (!previous) {
      return [];
    }

    const name = current.channelName || previous.channelName || current.channelId || "\uc2a4\ud2b8\ub9ac\uba38";
    // Notification icon prefers the streamer's PROFILE (face) so you recognize who
    // it is at a glance; the live thumbnail is only a fallback. options.profileImageUrl
    // is the unit's persisted avatar (most reliable), then the freshly-polled one.
    const imageUrl =
      settings.profileImageUrl ||
      current.profileImageUrl ||
      previous.profileImageUrl ||
      current.imageUrl ||
      previous.imageUrl ||
      "";
    const events = [];

    if (settings.notifyLiveStart !== false && !previous.isLive && current.isLive) {
      events.push({
        id: `live_${current.channelId}_${Date.now()}`,
        imageUrl,
        message: current.title || "\ubc29\uc1a1\uc774 \uc2dc\uc791\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
        title: `🟢 ${name}\ub2d8\uc774 \ubc29\uc1a1\uc744 \uc2dc\uc791\ud588\uc5b4\uc694`,
        type: "chzzk_live_start",
        url: current.url,
        createdAt: nowIso()
      });
    }

    if (
      settings.notifyTitleChange !== false &&
      previous.isLive &&
      current.isLive &&
      previous.title &&
      current.title &&
      previous.title !== current.title
    ) {
      events.push({
        id: `title_change_${current.channelId}_${Date.now()}`,
        imageUrl,
        message: `${previous.title} -> ${current.title}`,
        title: `✏️ ${name}\ub2d8\uc774 \ubc29\uc1a1 \uc81c\ubaa9\uc744 \ubc14\uafe8\uc5b4\uc694`,
        type: "chzzk_title_change",
        url: current.url,
        createdAt: nowIso()
      });
    }

    return events;
  }

  function toTimeMs(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function selectNewCafeArticles(matchedArticles, previousIds, unitCreatedAt, limit, options) {
    const articles = Array.isArray(matchedArticles) ? matchedArticles : [];
    const seen = new Set(Array.isArray(previousIds) ? previousIds : []);
    const max = Math.max(1, Number(limit) || 5);
    const alreadyOnlyNew = options && options.alreadyOnlyNew === true;
    let next = [];

    if (alreadyOnlyNew) {
      next = articles.filter((article) => article.articleId && !seen.has(article.articleId));
    } else if (seen.size > 0) {
      next = articles.filter((article) => article.articleId && !seen.has(article.articleId));
    } else {
      // First poll after registration should not spam old posts, but it must not
      // miss a post that was written after the user added this cafe and before
      // the first alarm fired.
      const createdAtMs = toTimeMs(unitCreatedAt);
      if (createdAtMs > 0) {
        next = articles.filter((article) => toTimeMs(article.createdAtMs) > createdAtMs);
      }
    }

    return next.slice(0, max).reverse();
  }

  function extractCafeName(input) {
    const text = normalizeText(input);
    if (!text) {
      return "";
    }
    // Accept: a full URL, a "cafe.naver.com/<name>" without scheme, or a bare name.
    // Add a scheme only when the text isn't already a host-qualified cafe path, so
    // "cafe.naver.com/jingburger" parses to "jingburger" (not double-prefixed).
    let candidate = text;
    if (!/^https?:\/\//i.test(text)) {
      candidate = /(^|\.)cafe\.naver\.com\//i.test(text)
        ? `https://${text}`
        : `https://cafe.naver.com/${text}`;
    }
    try {
      const url = new URL(candidate);
      const host = url.hostname.toLowerCase();
      if (!host.endsWith("cafe.naver.com")) {
        return "";
      }
      const first = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[a-z0-9_-]+$/i.test(first) ? first : "";
    } catch (error) {
      return /^[a-z0-9_-]+$/i.test(text) ? text : "";
    }
  }

  // --- Streamer unit model --------------------------------------------------
  // A "streamer" bundles a CHZZK channel and/or a Naver Cafe member into ONE unit
  // with a profile image, mirroring streamer-alarm2's `streamers` table (minus
  // twitter/weverse). A unit may have channelId only, cafe only, or both.

  function normalizeName(value) {
    return normalizeText(value).toLowerCase();
  }

  // Build/validate a streamer unit from raw input. Requires a name AND at least
  // one platform (channel or cafe). Returns { ok, unit, error }.
  function buildStreamerUnit(input) {
    const data = input || {};
    const name = normalizeText(data.name);
    const channelId = extractChzzkChannelId(data.channel || data.channelId || data.url || "");
    const cafeName = extractCafeName(data.cafe || data.cafeName || "");
    const nickname = normalizeText(data.nickname);

    if (!name) {
      return { ok: false, error: "\uc2a4\ud2b8\ub9ac\uba38 \uc774\ub984\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." };
    }
    const hasCafe = !!(cafeName && nickname);
    if (data.cafe || data.cafeName || data.nickname) {
      // Cafe was partially given: require both the cafe and the nickname.
      if (!cafeName) {
        return { ok: false, error: "\uce74\ud398 \uc8fc\uc18c\ub97c \ud655\uc778\ud560 \uc218 \uc5c6\uc5b4\uc694." };
      }
      if (!nickname) {
        return { ok: false, error: "\uce74\ud398 \uba64\ubc84 \ub2c9\ub124\uc784\uc744 \uc785\ub825\ud574 \uc8fc\uc138\uc694." };
      }
    }
    if (!channelId && !hasCafe) {
      return { ok: false, error: "\uce58\uc9c0\uc9c1 \ucc44\ub110 \ub610\ub294 \uce74\ud398 \uc911 \ud558\ub098\ub294 \uc785\ub825\ud574 \uc8fc\uc138\uc694." };
    }

    return {
      ok: true,
      unit: {
        id: makeId(name || channelId),
        name,
        profileImageUrl: normalizeText(data.profileImageUrl),
        channelId: channelId || null,
        cafe: hasCafe
          ? { cafeName, cafeId: normalizeText(data.cafeId), cafeRealName: normalizeText(data.cafeRealName), nickname }
          : null,
        notifications: normalizeStreamerNotifications(data.notifications),
        enabled: data.enabled !== false,
        createdAt: nowIso()
      }
    };
  }

  function normalizeStreamerNotifications(value) {
    const settings = value && typeof value === "object" ? value : {};
    return {
      liveStart: settings.liveStart !== false,
      titleChange: settings.titleChange !== false,
      cafePosts: settings.cafePosts !== false
    };
  }

  // True when a record already looks like a unit (has the cafe/channelId shape),
  // so migration is idempotent on already-migrated data.
  function isStreamerUnit(record) {
    return !!record && (Object.prototype.hasOwnProperty.call(record, "cafe") ||
      Object.prototype.hasOwnProperty.call(record, "profileImageUrl"));
  }

  // One-time merge of the OLD two lists (chzzk streamers + cafe subscriptions) into
  // unified streamer units. Same display name -> one unit (channel gets the cafe
  // attached); otherwise a standalone unit. Idempotent: if the chzzk list is already
  // units, it is returned as-is (cafe list folded in once). Pure.
  function migrateToStreamerUnits(chzzkStreamers, cafeSubscriptions) {
    const chzzk = Array.isArray(chzzkStreamers) ? chzzkStreamers : [];
    const cafes = Array.isArray(cafeSubscriptions) ? cafeSubscriptions : [];
    const units = [];
    const byName = new Map();

    const place = (unit) => {
      units.push(unit);
      byName.set(normalizeName(unit.name), unit);
    };

    for (const item of chzzk) {
      if (isStreamerUnit(item)) {
        // Already a unit: keep its shape, just ensure required fields exist.
        const unit = {
          id: item.id || makeId(item.name || item.channelId),
          name: normalizeText(item.name) || normalizeText(item.channelId),
          profileImageUrl: normalizeText(item.profileImageUrl),
          channelId: item.channelId || null,
          cafe: item.cafe || null,
          notifications: normalizeStreamerNotifications(item.notifications),
          enabled: item.enabled !== false,
          createdAt: item.createdAt || nowIso()
        };
        place(unit);
        continue;
      }
      place({
        id: item.id || makeId(item.name || item.channelId),
        name: normalizeText(item.name) || normalizeText(item.channelId),
        profileImageUrl: normalizeText(item.profileImageUrl),
        channelId: item.channelId || null,
        cafe: null,
        notifications: normalizeStreamerNotifications(item.notifications),
        enabled: item.enabled !== false,
        createdAt: item.createdAt || nowIso()
      });
    }

    for (const sub of cafes) {
      const cafe = {
        cafeName: normalizeText(sub.cafeName),
        cafeId: normalizeText(sub.cafeId),
        cafeRealName: normalizeText(sub.cafeRealName),
        nickname: normalizeText(sub.nickname)
      };
      if (!cafe.cafeName || !cafe.nickname) {
        continue;
      }
      // Auto-pair: a channel unit whose display name matches the cafe nickname or
      // the sub's display name gets the cafe attached (only if it has no cafe yet).
      const matchKey = normalizeName(sub.name || cafe.nickname);
      const existing = byName.get(matchKey);
      if (existing && !existing.cafe) {
        existing.cafe = cafe;
        continue;
      }
      place({
        id: sub.id || makeId(cafe.nickname),
        name: normalizeText(sub.name) || cafe.nickname,
        profileImageUrl: normalizeText(sub.profileImageUrl),
        channelId: null,
        cafe,
        notifications: normalizeStreamerNotifications(sub.notifications),
        enabled: sub.enabled !== false,
        createdAt: sub.createdAt || nowIso()
      });
    }

    return units;
  }

  return {
    buildStreamerUnit,
    detectChzzkEvents,
    extractCafeName,
    extractChzzkChannelId,
    isStreamerUnit,
    makeId,
    migrateToStreamerUnits,
    normalizeChzzkLiveStatus,
    normalizeStreamerNotifications,
    normalizeText,
    nowIso,
    selectNewCafeArticles
  };
});
