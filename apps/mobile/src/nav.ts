import { router } from 'expo-router';

/** Back where you came from, or Home when the page was opened straight from a link and there's nowhere to go back to. */
export function leave(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
