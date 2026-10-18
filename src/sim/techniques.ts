// Techniques as content (SPEC-PIECE-BUILDS-2026-10-18 4.1, 4.3): slots, grades, the graded copy a
// piece plays with, card text with its numbers filled in, and the content checks. Pure: no state.
import type { Content } from './content/loader';
import {
  GRADES,
  TECHNIQUE_SLOTS,
  type EffectDef,
  type Grade,
  type ModDef,
  type TechniqueDef,
  type TechniqueSlot,
  type TriggerDef,
  type Tuning,
} from './content/schema';
import type { HeldTechnique } from './types';

/** The skill a slot changes: Skill I-III are the base skills 0-2, the Signature is skill 3. */
export const SLOT_ABILITY: Record<TechniqueSlot, number | null> = {
  attack: null,
  skill1: 0,
  skill2: 1,
  skill3: 2,
  signature: 3,
  trait: null,
};

export const gradeIndex = (g: Grade): number => GRADES.indexOf(g);

export function gradeMult(t: Tuning, g: Grade): number {
  return t.builds.grades[g];
}

/** The skill a Technique's ability tweak acts on, or null. */
export function techniqueAbility(def: TechniqueDef): number | null {
  return def.ability ?? SLOT_ABILITY[def.slot];
}

const scaleMul = (v: number, k: number): number => 1 + (v - 1) * k;

function scaleMod(m: ModDef, k: number): ModDef {
  return { ...m, value: m.kind === 'mul' ? scaleMul(m.value, k) : m.value * k };
}

function scaleEffect(e: EffectDef, k: number): EffectDef {
  switch (e.type) {
    case 'damage':
    case 'dot':
    case 'shield':
      return { ...e, base: e.base * k, bladeScale: e.bladeScale * k, soulScale: e.soulScale * k };
    case 'heal':
      return {
        ...e,
        base: e.base * k,
        bladeScale: e.bladeScale * k,
        soulScale: e.soulScale * k,
        maxHpPct: e.maxHpPct * k,
        fractionOfDamage: e.fractionOfDamage * k,
      };
    case 'statMod':
    case 'aura':
      return { ...e, value: e.kind === 'mul' ? scaleMul(e.value, k) : e.value * k };
    default:
      return e;
  }
}

function scaleTrigger(tr: TriggerDef, k: number, param: boolean): TriggerDef {
  return {
    ...tr,
    effects: tr.effects.map((e) => scaleEffect(e, k)),
    ...(param && tr.param !== undefined ? { param: tr.param * k } : {}),
  };
}

const graded = new WeakMap<TechniqueDef, Map<number, TechniqueDef>>();

/**
 * The Technique at a grade: every bonus (ability tweaks, mods, trigger amounts and stat changes)
 * moves `mult` times as far from "no change"; counts, durations, radii and the Dubious price stay.
 */
export function gradedTechnique(def: TechniqueDef, mult: number): TechniqueDef {
  if (mult === 1) return def;
  let byMult = graded.get(def);
  if (!byMult) graded.set(def, (byMult = new Map()));
  const hit = byMult.get(mult);
  if (hit) return hit;
  const out: TechniqueDef = {
    ...def,
    powerMul: scaleMul(def.powerMul, mult),
    rangeMul: scaleMul(def.rangeMul, mult),
    radiusMul: scaleMul(def.radiusMul, mult),
    cooldownMul: Math.max(0.2, scaleMul(def.cooldownMul, mult)),
    mods: def.mods.map((m) => scaleMod(m, mult)),
    triggers: def.triggers.map((tr) => scaleTrigger(tr, mult, def.scaleParam)),
  };
  byMult.set(mult, out);
  return out;
}

/** The graded definitions a piece plays with, in its held order. */
export function heldDefs(c: Content, t: Tuning, held: readonly HeldTechnique[]): TechniqueDef[] {
  const out: TechniqueDef[] = [];
  for (const h of held) {
    const def = c.techniqueById.get(h.id);
    if (def) out.push(gradedTechnique(def, gradeMult(t, h.grade)));
  }
  return out;
}

/** Ability tweak multipliers from held Techniques on one skill. */
export function techniqueAbilityMods(
  c: Content,
  t: Tuning,
  held: readonly HeldTechnique[] | undefined,
  idx: number,
): { cooldownMul: number; powerMul: number; rangeMul: number; radiusMul: number } {
  const m = { cooldownMul: 1, powerMul: 1, rangeMul: 1, radiusMul: 1 };
  if (!held || held.length === 0) return m;
  for (const d of heldDefs(c, t, held)) {
    if (techniqueAbility(d) !== idx) continue;
    m.cooldownMul *= d.cooldownMul;
    m.powerMul *= d.powerMul;
    m.rangeMul *= d.rangeMul;
    m.radiusMul *= d.radiusMul;
  }
  return m;
}

const PLACEHOLDER = /\{([A-Za-z][\w.]*)\|(pct|mul|less|num)\}/g;

function lookup(root: unknown, path: string): number | null {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : null;
}

/** A number as card text: whole numbers plain, else one decimal place. */
function shown(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function format(v: number, fmt: string): string {
  switch (fmt) {
    case 'pct':
      return shown(v * 100);
    case 'mul':
      return shown(Math.abs(v - 1) * 100);
    case 'less':
      return shown((1 - v) * 100);
    default:
      return shown(v);
  }
}

/** Fills `{path|format}` placeholders from a Technique's own data; a path that is not a number stays visible as `?`. */
export function fillText(text: string, def: TechniqueDef): string {
  return text.replace(PLACEHOLDER, (_m, path: string, fmt: string) => {
    const v = lookup(def, path);
    return v === null ? '?' : format(v, fmt);
  });
}

/** The placeholders of a text that do not name a number of the Technique (content check). */
export function badPlaceholders(text: string, def: TechniqueDef): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (lookup(def, m[1]) === null) out.push(m[1]);
  return out;
}

/** Card text at a grade: the rule and the Dubious price, numbers filled in. */
export function techniqueText(
  def: TechniqueDef,
  mult: number,
): { desc: string; price: string | null } {
  const g = gradedTechnique(def, mult);
  return { desc: fillText(def.desc, g), price: def.dubious ? fillText(def.dubious.text, g) : null };
}

/** The held Technique a card would replace (a Combination replaces its first parent, in its slot). */
export function replacedBy(
  c: Content,
  held: readonly HeldTechnique[],
  id: string,
): HeldTechnique | null {
  const d = c.techniqueById.get(id);
  if (!d) return null;
  return held.find((h) => c.techniqueById.get(h.id)?.slot === d.slot) ?? null;
}

/** A piece's held list after taking a card: one per slot, in slot order. */
export function withTechnique(
  c: Content,
  held: readonly HeldTechnique[],
  id: string,
  grade: Grade,
): HeldTechnique[] {
  const old = replacedBy(c, held, id);
  const out = held.filter((h) => h !== old).concat([{ id, grade }]);
  const at = (h: HeldTechnique): number =>
    TECHNIQUE_SLOTS.indexOf(c.techniqueById.get(h.id)?.slot ?? 'trait');
  return out.sort((a, b) => at(a) - at(b));
}

/** Combinations that name this Technique as a parent. */
export function combinationsOf(c: Content, id: string): TechniqueDef[] {
  return c.techniques.filter((d) => d.parents?.includes(id));
}

/** Checks the Techniques file against the pieces, styles and its own rules. */
export function validateTechniques(c: Content): string[] {
  const errs: string[] = [];
  for (const d of c.techniques) {
    const at = `technique ${d.id}`;
    switch (d.pool) {
      case 'common':
        if (d.piece) errs.push(`${at}: a common Technique names no piece`);
        if (d.slot !== 'attack' && d.slot !== 'trait')
          errs.push(`${at}: a common Technique takes the Attack or Trait slot`);
        break;
      case 'piece':
        if (!d.piece) errs.push(`${at}: needs a piece`);
        if (d.slot === 'signature') errs.push(`${at}: the Signature slot is for archetypes`);
        break;
      case 'archetype':
        if (!d.piece || !d.archetype || !c.styleByKey.has(`${d.piece}/${d.archetype}`))
          errs.push(`${at}: needs a piece and one of its archetypes`);
        if (d.slot !== 'signature')
          errs.push(`${at}: an archetype Technique takes the Signature slot`);
        break;
      case 'combination': {
        const ps = (d.parents ?? []).map((id) => c.techniqueById.get(id));
        if (!d.parents || ps.some((p) => !p)) {
          errs.push(`${at}: needs two known parents`);
          break;
        }
        const [p1, p2] = ps as TechniqueDef[];
        if (p1.pool === 'combination' || p2.pool === 'combination')
          errs.push(`${at}: a parent cannot be a Combination`);
        if (p1.slot === p2.slot)
          errs.push(`${at}: its parents share a slot, so one piece cannot hold both`);
        if (d.slot !== p1.slot) errs.push(`${at}: takes its first parent's slot (${p1.slot})`);
        for (const p of [p1, p2])
          if (p.piece && d.piece && p.piece !== d.piece)
            errs.push(`${at}: parent ${p.id} is another piece's`);
        const pieces = new Set([p1.piece, p2.piece].filter((x) => x));
        if (pieces.size > 1) errs.push(`${at}: its parents belong to different pieces`);
        break;
      }
    }
    if (d.parents && d.pool !== 'combination') errs.push(`${at}: only a Combination has parents`);
    if (!(TECHNIQUE_SLOTS as readonly string[]).includes(d.slot)) errs.push(`${at}: unknown slot`);
    const ab = techniqueAbility(d);
    const tweaks = d.powerMul !== 1 || d.cooldownMul !== 1 || d.rangeMul !== 1 || d.radiusMul !== 1;
    if (tweaks && ab === null) errs.push(`${at}: a skill tweak needs a skill slot or \`ability\``);
    for (const text of [d.desc, d.playsLike, d.dubious?.text ?? '']) {
      const bad = badPlaceholders(text, d);
      if (bad.length) errs.push(`${at}: text names no number at ${bad.join(', ')}`);
      if (/\d/.test(text.replace(PLACEHOLDER, '')))
        errs.push(`${at}: write every number in its text as a placeholder into its data`);
    }
    if (d.school === 'sacrifice' && d.dubious && !/price/i.test(d.dubious.text))
      errs.push(`${at}: a Dubious price says "The price"`);
  }
  return errs;
}
