import { Command } from 'commander';
import { agentPost } from '../agent-client.js';
import { spinner, box, personality, isJson, jsonOut, g, w, r, white, d } from '../output.js';
import { safetyCleanMessages, safetyWarningMessages, pickMessage } from '../messages.js';

interface SafetyWarning {
  severity: string;
  category: string;
  message: string;
  file?: string;
  line?: number;
  context?: string;
}

export const checkCommand = new Command('check')
  .description('Run safety scan on uncommitted changes')
  .action(async () => {
    const cwd = process.cwd();

    if (isJson()) {
      const data = await agentPost<{ warnings: SafetyWarning[] }>('/safety/check', { workspacePath: cwd });
      jsonOut(data);
      return;
    }

    const s = spinner('scanning for threats...');
    const data = await agentPost<{ warnings: SafetyWarning[] }>('/safety/check', { workspacePath: cwd });
    s.stop();

    if (data.warnings.length === 0) {
      console.log(g('+ ') + white('no anomalies detected'));
      await personality(pickMessage(safetyCleanMessages));
      return;
    }

    const lines = data.warnings.map(sw => {
      const sev = sw.severity === 'critical' ? r('CRITICAL') : sw.severity === 'warning' ? w('WARNING') : d('INFO');
      const loc = sw.file ? `\n            ${white(String(sw.file))}${sw.line ? ':' + sw.line : ''}` : '';
      const ctx = sw.context ? `\n            ${d('> ' + String(sw.context).trim())}` : '';
      return `  ${sev}  ${white(sw.message)}${loc}${ctx}`;
    }).join('\n\n');

    box(lines, { title: 'ANOMALY DETECTED', borderColor: 'red' });
    await personality(pickMessage(safetyWarningMessages));
  });
