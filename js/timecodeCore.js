(function initTimecodeCore(root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = core;
  }
  root.ChzzkTimecodeCore = core;
})(typeof globalThis !== "undefined" ? globalThis : window, function buildTimecodeCore() {
  const FORMAT_CONTEXT = "context";
  const FORMAT_TIME = "time";
  const FORMAT_VOD = "vod";

  function clampSeconds(value) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue) || numberValue < 0) {
      return 0;
    }
    return Math.floor(numberValue);
  }

  function formatTime(seconds) {
    const total = clampSeconds(seconds);
    const hours = Math.floor(total / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
    const secs = Math.floor(total % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${secs}`;
  }

  function parseHms(text) {
    if (typeof text !== "string") {
      return null;
    }
    const match = text.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!match) {
      return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (minutes > 59 || seconds > 59) {
      return null;
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  // Flexible parser for the jump input. Accepts what a person naturally types:
  //   "1:02:03" / "02:03" / "90" / "1h2m3s" / "2m" / "1시간 2분 3초" / "[01:02:03]".
  // Colon form keeps the right-most group as seconds (mm:ss, hh:mm:ss).
  // Returns whole seconds, or null when nothing parseable is present.
  function parseTimeInput(text) {
    if (typeof text !== "string") {
      return null;
    }
    let body = text.trim().replace(/^[-–\s]*\[?/, "").replace(/\]\s*$/, "").trim();
    if (!body) {
      return null;
    }

    if (body.includes(":")) {
      const parts = body.split(":").map((part) => part.trim());
      if (parts.some((part) => !/^\d{1,3}$/.test(part)) || parts.length > 3) {
        return null;
      }
      const numbers = parts.map(Number);
      while (numbers.length < 3) {
        numbers.unshift(0);
      }
      const [hours, minutes, seconds] = numbers;
      if (minutes > 59 || seconds > 59) {
        return null;
      }
      return hours * 3600 + minutes * 60 + seconds;
    }

    if (/^\d+$/.test(body)) {
      return Number(body);
    }

    const hourMatch = body.match(/(\d+)\s*(?:시간|시|h)/i);
    const minuteMatch = body.match(/(\d+)\s*(?:분|m(?!s))/i);
    const secondMatch = body.match(/(\d+)\s*(?:초|s)/i);
    if (hourMatch || minuteMatch || secondMatch) {
      const hours = hourMatch ? Number(hourMatch[1]) : 0;
      const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
      const seconds = secondMatch ? Number(secondMatch[1]) : 0;
      return hours * 3600 + minutes * 60 + seconds;
    }

    return null;
  }

  function getVideoNo(urlText) {
    try {
      const url = new URL(urlText);
      const match = url.pathname.match(/^\/video\/([^/?#]+)/);
      return match ? match[1] : "";
    } catch (error) {
      return "";
    }
  }

  // --- Live (DVR / time-machine) helpers ------------------------------------
  // CHZZK live pages show, near the viewer count:
  //   <span data-knife-tooltip="라이브 시작: 2026-06-03 17:31:02">06:43:12 스트리밍 중</span>
  // "06:43:12" is WALL-CLOCK elapsed since the live started; the tooltip is the
  // absolute local start time. These pure helpers parse and reconcile both, and
  // map a requested wall-clock elapsed onto the player's media (DVR) timeline so
  // content.js can seek inside the ~1h rewind window (or fall back to copying).

  // Parse "라이브 시작: 2026-06-03 17:31:02" (also tolerates a bare
  // "2026-06-03 17:31:02" or an ISO-ish "2026-06-03T17:31:02"). Returns epoch ms
  // interpreted in LOCAL time (CHZZK prints the viewer's local clock), or null.
  function parseLiveStart(text) {
    if (typeof text !== "string") {
      return null;
    }
    const match = text.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = match[6] ? Number(match[6]) : 0;
    if (month < 1 || month > 12 || day < 1 || day > 31 ||
        hour > 23 || minute > 59 || second > 59) {
      return null;
    }
    // Local time on purpose (new Date(y, mIndex, ...) is local), not UTC.
    return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
  }

  // Parse the live elapsed badge text "06:43:12 스트리밍 중" (or a bare
  // "06:43:12" / "1:02:03"). Returns whole seconds, or null when not present.
  //
  // The hours group allows up to 5 digits: a CHZZK 24h channel that has been live
  // for ~100 days really shows "2401:20:01" (verified on the live JTBC channel),
  // and the old (\d{1,3}) cap silently dropped the leading hour digit (2401 -> 401).
  // We take the LAST h:mm:ss in the string so any leading non-time digits (a viewer
  // count glued onto the badge with no separator) cannot be absorbed into the hours.
  function parseLiveElapsed(text) {
    if (typeof text !== "string") {
      return null;
    }
    const matches = text.match(/(\d{1,5}):([0-5]\d):([0-5]\d)/g);
    if (!matches || matches.length === 0) {
      return null;
    }
    const last = matches[matches.length - 1].match(/(\d{1,5}):([0-5]\d):([0-5]\d)/);
    const hours = Number(last[1]);
    const minutes = Number(last[2]);
    const seconds = Number(last[3]);
    return hours * 3600 + minutes * 60 + seconds;
  }

  function pad2(value) {
    return Math.floor(value).toString().padStart(2, "0");
  }

  // Resolve the live-start epoch (ms). Current CHZZK live pages no longer expose
  // data-knife-tooltip="라이브 시작" (verified 2026-06-04), so tooltipStartMs is
  // usually null. When it is, derive the start from the badge's exact elapsed:
  // start = now - elapsed. Prefer the tooltip when present (it carries seconds the
  // page actually rendered). Returns null only when neither source is usable.
  function resolveLiveStartMs(tooltipStartMs, elapsedSec, nowMs) {
    if (Number.isFinite(tooltipStartMs)) {
      return tooltipStartMs;
    }
    if (Number.isFinite(elapsedSec) && elapsedSec >= 0 && Number.isFinite(nowMs)) {
      return nowMs - elapsedSec * 1000;
    }
    return null;
  }

  // Format an epoch (ms) as a local wall clock "HH:MM:SS" (24h). Returns "" when
  // the input is not a finite number.
  function formatClock(epochMs) {
    if (!Number.isFinite(epochMs)) {
      return "";
    }
    const date = new Date(epochMs);
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  }

  // Map a requested WALL-CLOCK elapsed onto the player's media (DVR) timeline.
  // The live edge (now) is currentElapsedSec on the wall clock and ~seekableEnd
  // on the media timeline, so going back delta = (current - requested) seconds
  // means media position = seekableEnd - delta. A requested time newer than now
  // is clamped to the live edge; a requested time older than the rewind window
  // (mediaPos < seekableStart) is out of range -> not seekable.
  //   seconds may be fractional (video.seekable is float); we keep them as-is.
  // Returns { seekable, mediaPos, reason, clampedToEdge }.
  function computeLiveSeekTarget(options) {
    const opts = options || {};
    const start = Number(opts.seekableStart);
    const end = Number(opts.seekableEnd);
    const current = Number(opts.currentElapsedSec);
    const requested = Number(opts.requestedElapsedSec);

    if (!Number.isFinite(current) || current < 0) {
      return { seekable: false, mediaPos: null, reason: "no-elapsed", clampedToEdge: false };
    }
    if (!Number.isFinite(requested) || requested < 0) {
      return { seekable: false, mediaPos: null, reason: "bad-request", clampedToEdge: false };
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      // No usable DVR window (live-only stream or seekable not ready).
      return { seekable: false, mediaPos: null, reason: "no-window", clampedToEdge: false };
    }

    // Future / at the edge -> clamp to the live edge.
    if (requested >= current) {
      return { seekable: true, mediaPos: end, reason: "edge", clampedToEdge: requested > current };
    }

    const delta = current - requested; // seconds to rewind from the live edge
    const mediaPos = end - delta;
    if (mediaPos < start) {
      // Older than the rewindable window (typically ~1h).
      return { seekable: false, mediaPos: null, reason: "out-of-window", clampedToEdge: false };
    }
    return { seekable: true, mediaPos, reason: "in-window", clampedToEdge: false };
  }

  // The live "time machine" input is a RELATIVE rewind amount (how far back to go
  // from now), e.g. "5분" / "5:00" = rewind 5 minutes. CHZZK's DVR lets you go back
  // up to ~1h while the streamer has it on. This resolves the rewind amount against
  // the current elapsed into a target elapsed (= current - rewind), then maps it onto
  // the media timeline via computeLiveSeekTarget. The COPIED / SHOWN time is the
  // rewound point's elapsed (targetElapsedSec), not the raw amount typed.
  //   rewindSec 0 (or "지금") -> stay at the live edge. A rewind larger than the whole
  //   elapsed is clamped to the broadcast start (targetElapsedSec 0).
  // Returns { ...seekResult, targetElapsedSec } (targetElapsedSec is always finite
  // when currentElapsedSec is readable, so the caller can copy it even on fallback).
  function computeLiveRewindTarget(options) {
    const opts = options || {};
    const current = Number(opts.currentElapsedSec);
    const rewind = Number(opts.rewindSec);

    if (!Number.isFinite(current) || current < 0) {
      return {
        seekable: false, mediaPos: null, reason: "no-elapsed",
        clampedToEdge: false, targetElapsedSec: null
      };
    }
    if (!Number.isFinite(rewind) || rewind < 0) {
      return {
        seekable: false, mediaPos: null, reason: "bad-request",
        clampedToEdge: false, targetElapsedSec: null
      };
    }
    const targetElapsedSec = Math.max(0, current - rewind);
    const seek = computeLiveSeekTarget({
      seekableStart: opts.seekableStart,
      seekableEnd: opts.seekableEnd,
      currentElapsedSec: current,
      requestedElapsedSec: targetElapsedSec
    });
    return { ...seek, targetElapsedSec };
  }

  // Given candidate DOM elements (described as plain { tooltip, text, depth }),
  // pick the live elapsed badge and return what content.js needs:
  //   { elapsedSec, liveStartMs, found }.
  // Selection mirrors findLiveElapsedElement: prefer a candidate whose tooltip
  // says "라이브 시작" AND whose text parses as elapsed; otherwise a candidate
  // whose text is "<h:mm:ss> 스트리밍 중"; among ties pick the DEEPEST (most
  // specific) so we read the elapsed span, not an ancestor that also wraps the
  // viewer count. Pure -> unit-testable against the manager's real DOM shape.
  function selectLiveElapsedCandidate(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const score = (c) => {
      const text = typeof c.text === "string" ? c.text : "";
      const tooltip = typeof c.tooltip === "string" ? c.tooltip : "";
      const elapsed = parseLiveElapsed(text);
      if (elapsed === null) {
        return null;
      }
      if (tooltip.includes("라이브 시작")) {
        return { tier: 2, elapsed, tooltip };
      }
      if (/스트리밍\s*중/.test(text)) {
        return { tier: 1, elapsed, tooltip };
      }
      return null;
    };

    let best = null;
    let bestTier = -1;
    let bestDepth = -Infinity;
    for (const candidate of list) {
      const scored = score(candidate);
      if (!scored) {
        continue;
      }
      const depth = Number.isFinite(candidate.depth) ? candidate.depth : 0;
      if (scored.tier > bestTier || (scored.tier === bestTier && depth > bestDepth)) {
        best = scored;
        bestTier = scored.tier;
        bestDepth = depth;
      }
    }

    if (!best) {
      return { found: false, elapsedSec: null, liveStartMs: null };
    }
    return {
      found: true,
      elapsedSec: best.elapsed,
      liveStartMs: parseLiveStart(best.tooltip)
    };
  }

  function buildCopyText(options) {
    const time = formatTime(options.seconds);
    const format = options.format || FORMAT_CONTEXT;
    const videoNo = options.videoNo || "";

    if (format === FORMAT_TIME) {
      return time;
    }

    if (format === FORMAT_VOD && videoNo) {
      return `VOD ${videoNo} ${time}`;
    }

    if (format === FORMAT_VOD) {
      return time;
    }

    return `- [${time}] `;
  }

  return {
    FORMAT_CONTEXT,
    FORMAT_TIME,
    FORMAT_VOD,
    buildCopyText,
    clampSeconds,
    computeLiveRewindTarget,
    computeLiveSeekTarget,
    formatClock,
    formatTime,
    getVideoNo,
    parseHms,
    parseLiveElapsed,
    parseLiveStart,
    parseTimeInput,
    resolveLiveStartMs,
    selectLiveElapsedCandidate
  };
});
