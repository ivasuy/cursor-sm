function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const startMessages = [
  'the matrix sees your code now.',
  'jacking in. signal locked.',
  'trace initialized. the watchers are live.',
  "you're in. make it count.",
  'connection established. tracking active.',
];

export const endMessages = [
  'not bad. the machine remembers everything.',
  'session archived. the trace is permanent.',
  'logged, sealed, remembered. see you next time.',
  'the record is clean. or is it?',
  'another session in the book. the matrix grows.',
];

export const statusMessages = [
  'the system is watching. keep going.',
  "still tracing. you're doing fine.",
  'signal strong. session active.',
  'the watchers report: all systems nominal.',
];

export const safetyCleanMessages = [
  'scan complete. the codebase is clean. for now.',
  'no anomalies. the code checks out.',
  'all clear. the matrix approves.',
];

export const safetyWarningMessages = [
  "i'd fix those before someone else finds them.",
  'the scan found something. you should look.',
  'red flags detected. your call, operator.',
  'anomalies in the codebase. proceed with caution.',
];

export const cardMessages = [
  'your proof of work. share it with the world.',
  'the record speaks for itself.',
  'captured. timestamped. verified.',
];

export const historyMessages = (count: number) => [
  `${count} sessions recovered from the archive.`,
  `${count} traces found in the memory banks.`,
  `the archive holds ${count} records.`,
];

export const loginMessages = (name: string) => [
  `welcome back, ${name}. the system recognizes you.`,
  `identity confirmed. hello, ${name}.`,
  `${name} authenticated. access granted.`,
];

export function pickMessage(pool: string[]): string {
  return pick(pool);
}
