import { useState } from 'preact/hooks';
import type { AppContext } from '../boot/boot.ts';
import { picturesFor, type SignPicture } from '../pictures/types.ts';

const HAS_CJK = /[㐀-鿿]/;

function Tile({ pic }: { pic: SignPicture }) {
  const [failed, setFailed] = useState(false);
  const isHand = pic.kind === 'hand';
  const title = isHand ? 'Hand shape 手形' : 'Location 位置';
  const showImage = pic.file && !failed;
  return (
    <figure class="pic" data-testid={`pic-${pic.kind}`} data-custom={pic.custom ? 'true' : undefined}>
      <div class="pic-frame">
        {showImage ? (
          <img
            src={pic.file}
            alt={`${isHand ? 'Hand shape' : 'Location'} drawing: ${pic.label}`}
            width="480"
            height="480"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <span class="pic-empty" data-testid="pic-empty">
            No drawing yet
          </span>
        )}
      </div>
      <figcaption>
        <strong>{title}</strong>
        <span lang={HAS_CJK.test(pic.label) ? 'zh-Hant' : undefined}>
          {pic.label}
          {pic.hand ? ` · hand ${pic.hand}` : ''}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The dictionary's hand-shape and location drawings for one sign, shown under the clip. A drawing that is missing
 * (or fails to load) keeps its place as an empty labelled tile, so a replacement can be dropped in without any layout change.
 */
export function SignPictures({ ctx, entryId }: { ctx: AppContext; entryId: string }) {
  const { hands, places } = picturesFor(ctx.pictures, entryId);
  if (!hands.length && !places.length) return null;
  return (
    <section class="pics" aria-label="Hand shape and location drawings" data-testid="pictures">
      {[...hands, ...places].map((p) => (
        <Tile key={`${p.kind}-${p.number}-${p.hand ?? 0}`} pic={p} />
      ))}
    </section>
  );
}
