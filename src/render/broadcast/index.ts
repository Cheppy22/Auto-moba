import { TableView, wantsTable } from '../table';
import { BroadcastView as BroadcastScene } from './scene';

/** The Tournament Table is the default; `?look=grand` swaps in the legacy Grand Board. Both views share the public API. */
export const BroadcastView = (wantsTable()
  ? TableView
  : BroadcastScene) as unknown as typeof BroadcastScene;
export { Director } from './director';
export type * from './types';
