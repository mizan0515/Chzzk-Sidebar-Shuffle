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

  const api = { computeOrderedDropIds };

  if (typeof window !== 'undefined') {
    window.ChzzkSidebarDnd = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
