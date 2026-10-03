import fs from 'node:fs';
import path from 'node:path';

const RATE = { audioInput: 6, audioOutput: 12, textInput: 1.5, textOutput: 4.5 };
export const emptyTokens = () => ({ audioInput: 0, audioOutput: 0, textInput: 0, textOutput: 0 });
export function parseUsage(usage) {
  if (!usage?.input_tokens_details || !usage?.output_tokens_details) return null;
  const tokens = {
    audioInput: usage.input_tokens_details.audio_tokens,
    audioOutput: usage.output_tokens_details.audio_tokens,
    textInput: usage.input_tokens_details.text_tokens,
    textOutput: usage.output_tokens_details.text_tokens,
  };
  return Object.values(tokens).every(value => Number.isSafeInteger(value) && value >= 0) ? tokens : null;
}
export function costOf(tokens) {
  return Object.entries(RATE).reduce((sum, [key, price]) => sum + (tokens[key] || 0) * price / 1e6, 0);
}
function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export class Ledger {
  constructor(dataDir) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    this.file = path.join(dataDir, 'usage.json');
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, responses: {}, days: {} };
    if (this.data.version !== 1 || !this.data.responses || !this.data.days) throw new Error('用量记录损坏，请先恢复记录，不能直接清零继续计费');
  }
  add(sessionId, responseId, usage) {
    const key = `${sessionId}:${responseId}`;
    if (this.data.responses[key]) return { duplicate: true };
    const tokens = parseUsage(usage);
    if (!tokens) return null;
    const yuan = costOf(tokens), day = dayKey();
    const next = {
      version: 1,
      responses: { ...this.data.responses, [key]: { tokens, yuan, day } },
      days: { ...this.data.days, [day]: (this.data.days[day] || 0) + yuan },
    };
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.data = next;
    return { tokens, yuan };
  }
  totals() {
    const day = dayKey();
    return {
      dailyYuan: this.data.days[day] || 0,
      monthlyYuan: Object.entries(this.data.days).filter(([date]) => date.startsWith(day.slice(0, 7))).reduce((sum, [, yuan]) => sum + yuan, 0),
    };
  }
}
