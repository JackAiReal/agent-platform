import type { HostDashboardVO, RankResponseVO } from '@maixu/frontend-sdk';

export function rankToDashboard(rank: RankResponseVO): HostDashboardVO {
  return {
    slot: rank.slot,
    room: rank.room,
    summary: {
      totalEntries: rank.entries.length,
      topCount: rank.topEntries.length,
      maxRank: rank.maxRank,
      state: rank.slot.state,
      isFull: rank.slot.isFull,
    },
    entries: rank.entries,
    topEntries: rank.topEntries,
  };
}
