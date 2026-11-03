export const MUSCLES = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'glutes', 'quads', 'hamstrings', 'calves'] as const;
export type Muscle = (typeof MUSCLES)[number];
