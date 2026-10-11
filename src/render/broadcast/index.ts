import { TableView, wantsTable } from '../table';
import { BroadcastView as BroadcastScene } from './scene';

/** `?look=table` swaps in the Tournament Table prototype; both views share the public API. */
export const BroadcastView = (wantsTable()
  ? TableView
  : BroadcastScene) as unknown as typeof BroadcastScene;
export { Director } from './director';
export type * from './types';
