import { render } from 'preact';
import type { PieceId } from '../../sim';
import { PieceGlyph } from '../pieces';
import type { Session } from '../session';

/** What the 3D view says about a capture: the piece and where it lies on screen (client px). */
export interface CaptureDetail {
  id: number;
  team: string;
  piece: string | null;
  x: number;
  y: number;
}

/** Milliseconds the token takes from the board to the tray. */
const FLIGHT_MS = 720;
/** How high (px) the token's arc rises above the straight line, at most. */
const ARC_PX = 140;

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A captured piece's token flies from where it landed on the board into the HUD capture tray: it
 * pops up off the board, arcs over and drops into its slot, and the tray item appears under it.
 * With no tray on screen (or reduced motion) the tray item simply shows.
 */
export function flyToken(s: Session, d: CaptureDetail): void {
  const team = d.team === 'B' ? 'B' : 'A';
  const piece = s.match?.unitById(d.id)?.hero?.defId as PieceId | undefined;
  const tray = document.querySelector<HTMLElement>(`[data-testid="tray-${team}"]`);
  if (!tray || !piece || reducedMotion() || typeof Element.prototype.animate !== 'function') {
    s.captureLanded(d.id);
    return;
  }
  const slot =
    tray.querySelector<HTMLElement>(`[data-testid="tray-item-${team}-${piece}"]`) ?? tray;
  const r = slot.getBoundingClientRect();
  const tx = r.left + r.width / 2;
  const ty = r.top + Math.min(r.height, 30) / 2;
  const el = document.createElement('div');
  el.className = `cap-token cap-${team}`;
  el.dataset.testid = 'capture-token';
  el.setAttribute('aria-hidden', 'true');
  render(<PieceGlyph piece={piece} team={team} size={30} />, el);
  document.body.appendChild(el);
  // a quadratic arc from the board to the slot, its top above the higher end
  const cx = (d.x + tx) / 2;
  const cy = Math.min(d.y, ty) - Math.min(ARC_PX, Math.abs(d.y - ty) * 0.5 + 40);
  const frames: Keyframe[] = [];
  const N = 8;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    // ease the travel: a quick pop off the board, a long glide, a firm drop into the slot
    const t = k < 0.15 ? 0 : (k - 0.15) / 0.85;
    const e = t * t * (3 - 2 * t);
    const x = (1 - e) * (1 - e) * d.x + 2 * (1 - e) * e * cx + e * e * tx;
    const y = (1 - e) * (1 - e) * d.y + 2 * (1 - e) * e * cy + e * e * ty;
    const lift = k < 0.15 ? (k / 0.15) * 26 : 0;
    const sc = k < 0.15 ? 0.5 + (k / 0.15) * 1.1 : 1.6 - e * 0.75;
    const spin = (team === 'B' ? -1 : 1) * (1 - e) * 200;
    frames.push({
      offset: k,
      opacity: k === 0 ? 0 : 1,
      transform: `translate(${x - 15}px, ${y - 15 - lift}px) rotate(${spin}deg) scale(${sc})`,
    });
  }
  const anim = el.animate(frames, { duration: FLIGHT_MS, easing: 'linear', fill: 'forwards' });
  const done = (): void => {
    render(null, el);
    el.remove();
    s.captureLanded(d.id);
    tray.classList.remove('tray-catch');
    // restart the catch pulse even when two tokens land close together
    void tray.offsetWidth;
    tray.classList.add('tray-catch');
    window.setTimeout(() => tray.classList.remove('tray-catch'), 600);
  };
  anim.onfinish = done;
  anim.oncancel = done;
}
