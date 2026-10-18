import { whitePieces } from '../Orders';
import { TallyList } from '../builds/TallyList';
import { tallyRows, topRows } from '../builds/tally';
import { useSession } from '../session';

/**
 * The Act report's "What your Techniques did": the top three of the Act that just ended, by what
 * they added (damage, healing and shields), read from the builds tally. It reads the tally map,
 * not the held list, so a Technique swapped out at this break still shows.
 */
export function TechniquesDid() {
  const s = useSession();
  const m = s.match!;
  const mine = new Map(whitePieces(s).map((u) => [u.id, u.hero!.defId]));
  const rows = tallyRows(s.content, m.state.builds.lastAct, (id) => mine.get(id) ?? null);
  const top = topRows(rows, 3);
  return (
    <section class="bs-sec" data-testid="break-techniques">
      <h3 class="bs-h">What your Techniques did</h3>
      {top.length > 0 ? (
        <TallyList c={s.content} rows={top} testid="break-techniques-list" />
      ) : (
        <p class="bs-line dim">None of your Techniques counted a number this Act.</p>
      )}
    </section>
  );
}
