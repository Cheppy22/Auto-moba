import type { AbilityDef, UpgradeDef } from '../sim';

const trim = (v: number): string => String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);

const POWER_EFFECTS: Record<string, string> = {
  damage: 'damage',
  dot: 'damage per second',
  heal: 'healing',
  shield: 'shield',
};

export function upgradeChanges(ability: AbilityDef, up: UpgradeDef): string[] {
  const out: string[] = [];
  if (up.powerMul !== 1) {
    const eff = ability.effects.find((e) => e.type in POWER_EFFECTS && 'base' in e && e.base > 0);
    if (eff && 'base' in eff)
      out.push(`${trim(eff.base)} → ${trim(eff.base * up.powerMul)} ${POWER_EFFECTS[eff.type]}`);
    else out.push(`power +${Math.round((up.powerMul - 1) * 100)}%`);
  }
  if (up.cooldownMul !== 1)
    out.push(
      `cooldown ${trim(ability.cooldownSec)}s → ${trim(ability.cooldownSec * up.cooldownMul)}s`,
    );
  if (up.rangeMul !== 1 && ability.range > 0)
    out.push(`range ${trim(ability.range)} → ${trim(ability.range * up.rangeMul)}`);
  if (up.radiusMul !== 1 && ability.radius > 0)
    out.push(`radius ${trim(ability.radius)} → ${trim(ability.radius * up.radiusMul)}`);
  return out;
}
