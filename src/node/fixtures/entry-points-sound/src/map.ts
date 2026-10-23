/**
 * The broken package's map entry point with the dependency imported where it
 * is used, so importing this entry point does not load it.
 */
export async function createMap(element: HTMLElement): Promise<{ element: HTMLElement }> {
  const { map } = await import('fixture-map');
  return map(element);
}
