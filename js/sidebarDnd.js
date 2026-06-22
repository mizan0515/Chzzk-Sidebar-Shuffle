(function() {
  'use strict';

  function uniqueIds(values) {
    return Array.from(new Set((values || []).filter(Boolean)));
  }

  function computeOrderedDropIds(currentIds, channelId, targetId, insertBefore) {
    const movingId = String(channelId || '');
    if (!movingId) return uniqueIds(currentIds);

    const ordered = uniqueIds(currentIds).filter(id => id !== movingId);
    const targetIndex = targetId ? ordered.indexOf(targetId) : -1;
    if (targetIndex < 0) return [...ordered, movingId];

    const insertIndex = insertBefore ? targetIndex : targetIndex + 1;
    return [
      ...ordered.slice(0, insertIndex),
      movingId,
      ...ordered.slice(insertIndex)
    ];
  }

  function computeAutoScrollDelta(pointerY, viewportHeight, edgeSize = 72, maxDelta = 28) {
    const y = Number(pointerY);
    const height = Number(viewportHeight);
    if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) return 0;

    const edge = Math.max(24, Math.min(Number(edgeSize) || 72, Math.floor(height / 3)));
    const max = Math.max(4, Number(maxDelta) || 28);
    if (y < edge) {
      return -Math.ceil(((edge - y) / edge) * max);
    }
    if (y > height - edge) {
      return Math.ceil(((y - (height - edge)) / edge) * max);
    }
    return 0;
  }

  const api = { computeAutoScrollDelta, computeOrderedDropIds };

  if (typeof window !== 'undefined') {
    window.ChzzkSidebarDnd = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
