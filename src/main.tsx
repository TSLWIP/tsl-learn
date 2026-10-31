import { render } from 'preact';
import { App } from './ui/App.tsx';
import './ui/styles.css';

try {
  document.getElementById('boot-fallback')?.remove();
  render(<App />, document.getElementById('app')!);
} catch (err) {
  // Last line of defence: never leave a blank page.
  const p = document.createElement('p');
  p.style.cssText = 'font-family:system-ui;padding:24px';
  p.textContent = `TSL Learn could not start (${(err as Error).message}). Try reloading.`;
  document.getElementById('app')?.append(p);
}
