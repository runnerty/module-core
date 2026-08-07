'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ms = require('millisecond');
const Executor = require('../index.js').Executor;

// Drives the real Executor class the same way runnerty core does
// (lib/classes/process.js): arm the process timeout, then execMain().
// `execBehaviour` decides what each attempt does; `hang` never settles.
function runProcess({ execBehaviour, retries, timeout }) {
  const counters = { timeouts: 0, retries: 0, attempts: 0 };

  const fakeProcess = {
    id: 'FAKE-PROCESS',
    name: 'Fake process',
    uId: 'fake-process-uid',
    exec: { id: 'fake_default' },
    retries,
    retry_delay: '50ms',
    timeout,
    notificate_only_last_fail: true,
    err_output: '',
    msg_output: '',
    values: () => ({}),
    loadExecutorConfig: () => Promise.resolve({ type: '@runnerty-executor-fake' }),
    error: async () => {},
    end: async () => {},
    retry: () => {
      counters.retries++;
    },
    time_out: () => {
      counters.timeouts++;
    }
  };

  class FakeExecutor extends Executor {
    exec() {
      counters.attempts++;
      if (execBehaviour === 'fail') {
        this.end({ end: 'error', err_output: 'boom', messageLog: 'boom' });
      }
      // 'hang': never calls this.end(), like a connection stalled forever
    }
  }

  const executor = new FakeExecutor({
    logger: { log: () => {} },
    checkExecutorParams: () => {},
    runtime: {},
    process: fakeProcess
  });

  const settled = new Promise((resolve, reject) => {
    if (fakeProcess.timeout) {
      executor.timeout = setTimeout(
        () => {
          executor.killMain('timeout', { end: fakeProcess.timeout.action });
          fakeProcess.time_out();
        },
        ms('' + fakeProcess.timeout.delay)
      );
    }
    executor.execMain(resolve, reject);
  });

  return { settled, counters };
}

// Fails fast instead of hanging the test runner if the process never settles.
function withWatchdog(settled, afterMs) {
  let timer;
  const watchdog = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`process did not settle within ${afterMs}ms`));
    }, afterMs);
  });
  return Promise.race([settled, watchdog]).finally(() => clearTimeout(timer));
}

describe('process timeout across retries', () => {
  it('bounds every attempt, not only the first one', async () => {
    const { settled, counters } = runProcess({
      execBehaviour: 'hang',
      retries: 2,
      timeout: { delay: '100ms', action: 'error' }
    });

    // Without re-arming, the timeout fires once, the first retry hangs
    // forever and this await never settles.
    await assert.rejects(
      () => withWatchdog(settled, 3000),
      err => {
        assert.notEqual(
          err.message,
          'process did not settle within 3000ms',
          'the retry ran unbounded: the process timeout was not re-armed'
        );
        return true;
      }
    );

    assert.equal(counters.attempts, 3, 'initial attempt + 2 retries');
    assert.equal(counters.timeouts, 3, 'every attempt was killed by the timeout');
    assert.equal(counters.retries, 2);
  });

  it('settles a hung process with no retries configured', async () => {
    const { settled, counters } = runProcess({
      execBehaviour: 'hang',
      retries: undefined,
      timeout: { delay: '100ms', action: 'error' }
    });

    await assert.rejects(() => withWatchdog(settled, 3000));
    assert.equal(counters.timeouts, 1);
    assert.equal(counters.retries, 0);
  });

  it('does not arm timers on retries when the process has no timeout', async () => {
    const { settled, counters } = runProcess({
      execBehaviour: 'fail',
      retries: 2,
      timeout: undefined
    });

    await assert.rejects(() => withWatchdog(settled, 3000));
    assert.equal(counters.attempts, 3);
    assert.equal(counters.timeouts, 0, 'no process timeout configured: nothing should fire');
    assert.equal(counters.retries, 2);
  });
});
