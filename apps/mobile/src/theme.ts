import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/** Extra semantic colours used by the calendar grid. */
export interface AppColors {
  weekend: string;
  todayColumn: string;
  gridLine: string;
  headerSurface: string;
}

export type AppTheme = MD3Theme & { app: AppColors };

// Deep teal accent — calm, water-inspired (Delta), Material 3 tonal palette.
export const lightTheme: AppTheme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#006A6A',
    onPrimary: '#FFFFFF',
    primaryContainer: '#9CF1F0',
    onPrimaryContainer: '#002020',
    secondary: '#4A6363',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#CCE8E7',
    onSecondaryContainer: '#051F1F',
    background: '#F6FAF9',
    onBackground: '#171D1D',
    surface: '#F6FAF9',
    onSurface: '#171D1D',
    surfaceVariant: '#DAE5E3',
    onSurfaceVariant: '#3F4948',
    outline: '#6F7978',
    outlineVariant: '#BEC9C8',
    elevation: {
      level0: 'transparent',
      level1: '#ECF4F3',
      level2: '#E5F0EF',
      level3: '#DEEBEA',
      level4: '#DCE9E8',
      level5: '#D7E6E5',
    },
  },
  app: {
    weekend: 'rgba(0, 106, 106, 0.045)',
    todayColumn: 'rgba(0, 106, 106, 0.12)',
    gridLine: '#E3EBEA',
    headerSurface: '#F6FAF9',
  },
};

export const darkTheme: AppTheme = {
  ...MD3DarkTheme,
  roundness: 4,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#80D5D4',
    onPrimary: '#003737',
    primaryContainer: '#004F4F',
    onPrimaryContainer: '#9CF1F0',
    secondary: '#B0CCCB',
    onSecondary: '#1B3434',
    secondaryContainer: '#324B4B',
    onSecondaryContainer: '#CCE8E7',
    background: '#0E1515',
    onBackground: '#DDE4E3',
    surface: '#0E1515',
    onSurface: '#DDE4E3',
    surfaceVariant: '#3F4948',
    onSurfaceVariant: '#BEC9C8',
    outline: '#889392',
    outlineVariant: '#3F4948',
    elevation: {
      level0: 'transparent',
      level1: '#162020',
      level2: '#1A2525',
      level3: '#1E2B2B',
      level4: '#1F2D2D',
      level5: '#223131',
    },
  },
  app: {
    weekend: 'rgba(128, 213, 212, 0.05)',
    todayColumn: 'rgba(128, 213, 212, 0.14)',
    gridLine: '#1F2A2A',
    headerSurface: '#0E1515',
  },
};

export interface BarColors {
  background: string;
  border: string;
  text: string;
  dot: string;
}

/** Booking bar colours for an apartment hue, tuned for each mode. */
export function barColors(hue: number, dark: boolean): BarColors {
  return dark
    ? {
        background: `hsl(${hue}, 32%, 24%)`,
        border: `hsl(${hue}, 50%, 58%)`,
        text: `hsl(${hue}, 60%, 90%)`,
        dot: `hsl(${hue}, 55%, 62%)`,
      }
    : {
        background: `hsl(${hue}, 70%, 91%)`,
        border: `hsl(${hue}, 45%, 52%)`,
        text: `hsl(${hue}, 55%, 20%)`,
        dot: `hsl(${hue}, 55%, 48%)`,
      };
}
