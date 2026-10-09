import { GUIDE, Legend, type Guide } from '../charts';

/** One line saying what the vertical guides on every time chart mean (shown when there are any). */
export function GuideKey(props: { guides: Guide[] }) {
  const acts = props.guides.some((g) => g.kind === 'act');
  const pressure = props.guides.some((g) => g.kind === 'pressure');
  if (!acts && !pressure) return null;
  return (
    <div class="rp-guidekey" data-testid="guide-key">
      <span class="tiny dim">Guides on every chart</span>
      <Legend
        items={[
          ...(acts ? [{ label: 'Act begins', color: GUIDE.act, shape: 'tick' as const }] : []),
          ...(pressure
            ? [{ label: 'Pressure event', color: GUIDE.pressure, shape: 'dash' as const }]
            : []),
        ]}
      />
    </div>
  );
}
