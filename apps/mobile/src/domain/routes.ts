import type { Href } from 'expo-router';

/** Where a notification leads. Unknown routes go nowhere rather than to a broken screen. */
export function hrefFor(route: string | null | undefined): Href | null {
  if (route === 'train') return '/';
  if (route === 'rankings') return '/rankings';
  if (route === 'invites') return '/invites';
  if (route === 'trophies') return '/trophies';
  const post = route?.match(/^post\/([0-9a-f-]{36})$/i)?.[1];
  return post ? `/post/${post}` : null;
}
