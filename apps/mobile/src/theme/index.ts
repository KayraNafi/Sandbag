export const colors = {
  bg: '#0b0c09',
  surface: '#15170f',
  surface2: '#1f2218',
  line: '#2d3123',
  ink: '#f4f6ec',
  ink2: '#b0b5a3',
  ink3: '#868b7a',
  volt: '#d4ff3a',
  voltInk: '#0d1002',
  chart: '#b9e628',
  warn: '#f1d75e',
  warnBg: '#1d1a0c',
  warnLine: '#5c5213',
  doneBg: '#171b0c',
  doneLine: '#3f4d14',
  danger: '#ff8a70',
  /** The ends of the effort scale, easy to max. The middle steps are chart, warn and danger. */
  effortEasy: '#7fd1c0',
  effortMax: '#ff5f4d',
} as const;

export const fonts = {
  body: 'Barlow_400Regular',
  bodyStrong: 'Barlow_600SemiBold',
  label: 'BarlowCondensed_600SemiBold',
  display: 'BarlowCondensed_800ExtraBold_Italic',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 18, xl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20 } as const;
