import cron from "node-cron";

const DEFAULT_TIME = "08:00";
const DEFAULT_TZ = "Asia/Seoul";

/** "HH:MM" → cron 식 "M H * * *" 으로 변환. */
function timeToCron(time: string): string {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    throw new Error(`SEND_TIME 형식이 잘못되었습니다: "${time}" (예: 08:00)`);
  }
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) {
    throw new Error(`SEND_TIME 시각 범위가 잘못되었습니다: "${time}"`);
  }
  return `${minute} ${hour} * * *`;
}

/** .env 의 SEND_CRON / SEND_TIME 에서 최종 cron 식과 시간대를 산출한다. */
export function resolveSchedule(): { expression: string; timezone: string; label: string } {
  const timezone = process.env.SEND_TIMEZONE?.trim() || DEFAULT_TZ;
  const explicitCron = process.env.SEND_CRON?.trim();

  if (explicitCron) {
    if (!cron.validate(explicitCron)) {
      throw new Error(`SEND_CRON cron 식이 유효하지 않습니다: "${explicitCron}"`);
    }
    return { expression: explicitCron, timezone, label: `cron "${explicitCron}"` };
  }

  const time = process.env.SEND_TIME?.trim() || DEFAULT_TIME;
  const expression = timeToCron(time);
  return { expression, timezone, label: `매일 ${time}` };
}

/** 사람이 읽는 스케줄 설명. */
export function describeSchedule(): string {
  const { label, timezone } = resolveSchedule();
  return `${label} (${timezone}) 자동 발송`;
}

/** node-cron 으로 매일 정기 작업을 등록한다. */
export function startScheduler(task: () => Promise<void> | void): void {
  const { expression, timezone } = resolveSchedule();
  cron.schedule(expression, () => void task(), { timezone });
}
