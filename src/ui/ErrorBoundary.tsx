import { Component, type ComponentChildren } from 'preact';
import type { Repo } from '../storage/repo.ts';

interface Props {
  where: string;
  repo: Repo | null;
  children: ComponentChildren;
}

/** One broken screen must not take the whole app down. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  componentDidCatch(error: Error) {
    this.setState({ error });
    void this.props.repo?.logError(`screen:${this.props.where}`, error).catch(() => undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div class="card" role="alert" data-testid="screen-error">
        <h2>This screen hit a problem</h2>
        <p>The rest of the app still works. The details were saved to the error log in Settings.</p>
        <button class="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
