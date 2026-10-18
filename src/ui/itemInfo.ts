import type { Content } from '../sim';

export function itemCategory(c: Content, id: string): string {
  return (
    c.itemById.get(id)?.category ??
    c.cursedById.get(id)?.category ??
    c.holyById.get(id)?.category ??
    ''
  );
}
