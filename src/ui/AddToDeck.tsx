import { useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import type { LexEntry } from '../lexicon/types.ts';
import { makeDeck, toggleInDeck } from '../state/learning.ts';
import type { Deck } from '../storage/types.ts';

/** "Add to deck" from anywhere a sign is shown. */
export function AddToDeck({ ctx, entry }: { ctx: AppContext; entry: LexEntry }) {
  const { repo } = ctx;
  const [open, setOpen] = useState(false);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [name, setName] = useState('');
  if (!repo) return null;

  const load = async () => setDecks(await repo.allDecks());
  const toggleOpen = async () => {
    if (!open) await load();
    setOpen(!open);
  };
  const toggle = async (d: Deck) => {
    await repo.putDeck(toggleInDeck(d, entry.id));
    await load();
  };
  const create = async (ev: Event) => {
    ev.preventDefault();
    if (!name.trim()) return;
    await repo.putDeck(toggleInDeck(makeDeck(name), entry.id));
    setName('');
    await load();
  };

  return (
    <div class="add-deck">
      <button class="btn" aria-expanded={open} data-testid="add-to-deck" onClick={toggleOpen}>
        ＋ Add to deck
      </button>
      {open && (
        <div class="card" data-testid="deck-menu">
          {decks.length === 0 && <p class="note">You have no decks yet. Name one to start it with this sign.</p>}
          <ul class="plain">
            {decks.map((d) => (
              <li key={d.id}>
                <button class="btn" aria-pressed={d.signIds.includes(entry.id)} data-testid={`deck-toggle-${d.name}`} onClick={() => toggle(d)}>
                  {d.signIds.includes(entry.id) ? '✓ ' : ''}
                  {d.name} · {d.signIds.length}
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={create} class="lookup-form">
            <input class="input" data-testid="new-deck-name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="New deck name" aria-label="New deck name" maxLength={40} />
            <button class="btn" type="submit" data-testid="new-deck-create">
              Create
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
