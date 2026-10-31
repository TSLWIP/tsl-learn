import { useEffect, useRef, useState } from 'preact/hooks';
import type { Prefs } from '../state/prefs.ts';

const GOALS = [
  { n: 10, label: 'Light', note: 'about 2 minutes' },
  { n: 20, label: 'Steady', note: 'about 5 minutes' },
  { n: 40, label: 'Keen', note: 'about 10 minutes' },
];

/** Three short screens: what this is, an honest note about TSL, then dialect and daily goal. */
export function Onboarding({ prefs, onDone }: { prefs: Prefs; onDone: (p: Prefs) => void }) {
  const [step, setStep] = useState(0);
  const [dialect, setDialect] = useState<Prefs['dialect']>(prefs.dialect);
  const [goal, setGoal] = useState(prefs.dailyGoal);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), [step]);

  const finish = () => onDone({ ...prefs, dialect, dailyGoal: goal, onboarded: true });

  return (
    <main class="onboarding" data-testid="onboarding" aria-labelledby="ob-h">
      <ol class="dots" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map((i) => (
          <li key={i} class={i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined} />
        ))}
      </ol>

      {step === 0 && (
        <>
          <p class="mark" aria-hidden="true">
            手
          </p>
          <h1 id="ob-h" tabIndex={-1} ref={heading}>
            Learn Taiwan Sign Language
          </h1>
          <p>
            Watch short clips from the TSL Online Dictionary, look signs up in English or Chinese, and practise with quick quizzes that come back at the right time.
          </p>
          <p class="note">Everything works offline once your clips are saved on this device. There are no accounts and nothing is sent anywhere.</p>
        </>
      )}

      {step === 1 && (
        <>
          <h1 id="ob-h" tabIndex={-1} ref={heading}>
            A note about TSL
          </h1>
          <p>
            TSL is a language of its own, not signed English. It has its own word order and uses the face, head and body as part of its grammar.
          </p>
          <p>
            So the <strong>Lookup</strong> screen shows the dictionary sign for each word you type, in the order you typed it. That is a study aid, not a translation. If the dictionary has no sign for a word, the app says so instead of guessing.
          </p>
          <p class="note">There are two main dialects, northern (Taipei) and southern (Tainan). Where a word has both, you will see both.</p>
        </>
      )}

      {step === 2 && (
        <>
          <h1 id="ob-h" tabIndex={-1} ref={heading}>
            Make it yours
          </h1>
          <h2 id="ob-dialect">Which dialect first?</h2>
          <div class="choices" role="group" aria-labelledby="ob-dialect">
            <button class="btn" aria-pressed={dialect === 'north'} data-testid="ob-north" onClick={() => setDialect('north')}>
              Northern (Taipei) 北部
            </button>
            <button class="btn" aria-pressed={dialect === 'south'} data-testid="ob-south" onClick={() => setDialect('south')}>
              Southern (Tainan) 南部
            </button>
          </div>
          <h2 id="ob-goal">Daily goal</h2>
          <div class="choices" role="group" aria-labelledby="ob-goal">
            {GOALS.map((g) => (
              <button key={g.n} class="btn" aria-pressed={goal === g.n} data-testid={`ob-goal-${g.n}`} onClick={() => setGoal(g.n)}>
                {g.label} · {g.n} answers{' '}
                <span class="note">({g.note})</span>
              </button>
            ))}
          </div>
          <p class="note">You can change both later in Settings. On an iPhone, tap Share, then “Add to Home Screen” to use this like an app.</p>
        </>
      )}

      <div class="ob-nav">
        {step > 0 ? (
          <button class="btn" data-testid="ob-back" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button class="btn primary" data-testid="ob-next" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button class="btn primary" data-testid="ob-start" onClick={finish}>
            Start learning
          </button>
        )}
      </div>
    </main>
  );
}
