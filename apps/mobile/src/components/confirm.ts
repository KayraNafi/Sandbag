import { Alert, Platform } from 'react-native';

/** Alert.alert does nothing on the web, so destructive actions need both. */
export function confirm(title: string, message: string, action: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: action, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
