export type RuntimeRoomConfig = {
  maxRank: number;
  orderStartMinute: number;
  orderStopMinute: number;
  enableChallenge: boolean;
  challengeTtlSeconds: number;
};

export function buildRuntimeRoomConfig(configs: Array<{ configKey: string; configValue: unknown }>): RuntimeRoomConfig {
  const configMap = new Map<string, unknown>();

  for (const item of configs) {
    configMap.set(item.configKey, item.configValue);
  }

  const challengeTtlSeconds = Number(configMap.get('challenge_ttl_seconds') ?? 120);

  return {
    maxRank: Number(configMap.get('max_rank') ?? 7),
    orderStartMinute: Number(configMap.get('order_start_minute') ?? 0),
    orderStopMinute: Number(configMap.get('order_stop_minute') ?? 10),
    enableChallenge: Boolean(configMap.get('enable_challenge') ?? false),
    challengeTtlSeconds: Number.isFinite(challengeTtlSeconds) && challengeTtlSeconds > 0 ? challengeTtlSeconds : 120,
  };
}

export function getCurrentSlotDate(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function buildSlotTimes(slotDate: Date, slotHour: number, config: RuntimeRoomConfig) {
  const startAt = new Date(slotDate);
  startAt.setHours(slotHour, config.orderStartMinute, 0, 0);

  const speedCloseAt = new Date(slotDate);
  speedCloseAt.setHours(slotHour, config.orderStopMinute, 0, 0);

  const finalCloseAt = new Date(speedCloseAt);
  finalCloseAt.setMinutes(finalCloseAt.getMinutes() + 10);

  return {
    startAt,
    speedCloseAt,
    finalCloseAt,
  };
}
