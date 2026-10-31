// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../src/ui/ErrorBoundary.tsx';

function Boom(): never {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('shows a recovery card and logs the error instead of crashing the tree', async () => {
    const logged: string[] = [];
    const repo = { logError: async (where: string, e: Error) => void logged.push(`${where}:${e.message}`) };
    const host = document.createElement('div');
    render(
      <div>
        <p id="sibling">still here</p>
        <ErrorBoundary where="quiz" repo={repo as never}>
          <Boom />
        </ErrorBoundary>
      </div>,
      host,
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(host.querySelector('[data-testid="screen-error"]')).not.toBeNull();
    expect(host.querySelector('#sibling')?.textContent).toBe('still here');
    expect(logged).toEqual(['screen:quiz:kaboom']);
  });
});
