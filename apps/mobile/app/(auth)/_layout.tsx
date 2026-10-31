import { Stack } from 'expo-router';
import { stackOptions } from '@/components/header';

export default function AuthLayout() {
  return <Stack screenOptions={{ ...stackOptions, headerShown: false }} />;
}
