import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from '@playwright/test/reporter';

// The staging regression's only reporter (decision #92): one line per script step in the job
// summary and the log, ✅ / ❌ / ⏭. Worker output is dropped except GitHub's ::add-mask::
// commands (passed straight through so codes, links and tokens are hidden from the log), and
// every error message is redacted before it is printed or saved.

export function redact(text: string): string {
  return text
    .replace(/#token=[^\s"'<>)]+/g, '#token=[hidden]')
    .replace(/\/o\/[A-Za-z0-9_-]{12}/g, '/o/[hidden]')
    .replace(/\b\d{6}\b/g, '[code]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [hidden]')
    .replace(/\u001b\[[0-9;]*m/g, '');
}

const ICON = { passed: '✅', failed: '❌', timedOut: '❌', skipped: '⏭', interrupted: '⏭' };

export default class SummaryReporter implements Reporter {
  private lines: string[] = [];
  private counts = { passed: 0, failed: 0, skipped: 0 };

  printsToStdio() {
    return true;
  }

  onStdOut(chunk: string | Buffer) {
    for (const line of chunk.toString().split('\n')) {
      if (line.startsWith('::add-mask::')) process.stdout.write(`${line}\n`);
    }
  }

  onStdErr() {}

  onStepEnd(test: TestCase, _result: TestResult, step: TestStep) {
    if (step.category !== 'test.step') return;
    const line = `  - ${step.error ? '❌' : '✅'} ${step.title}`;
    this.lines.push(line);
    console.log(line);
    if (step.error) {
      const message = redact(step.error.message ?? String(step.error.value)).split('\n')[0];
      this.lines.push(`    - ${message}`);
      console.log(`    ${message}`);
    }
  }

  onTestBegin(test: TestCase) {
    const line = `**${test.title}**`;
    this.lines.push('', line);
    console.log(`\n${test.title}`);
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const status = result.status;
    if (status === 'passed') this.counts.passed++;
    else if (status === 'skipped' || status === 'interrupted') this.counts.skipped++;
    else this.counts.failed++;
    const line = `${ICON[status]} ${test.title}: ${status}`;
    this.lines.push(line);
    console.log(line);
    for (const error of result.errors) {
      const message = redact(error.message ?? String(error.value))
        .split('\n')
        .slice(0, 3);
      for (const m of message) {
        this.lines.push(`    ${m}`);
        console.log(`    ${m}`);
      }
    }
  }

  onEnd(result: FullResult) {
    const head = [
      '## Staging regression (M10 CP6, decision #92)',
      '',
      `Result: **${result.status}**: ${this.counts.passed} sections passed, ${this.counts.failed} failed, ${this.counts.skipped} skipped.`,
      'Screenshots of the buyer pages: the run’s `regression-screens` artifact (7 days).',
    ];
    const text = [...head, ...this.lines, ''].join('\n');
    const dir = path.resolve('regression-output');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'summary.md'), text);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    console.log(`\n${head[2]}`);
  }
}
