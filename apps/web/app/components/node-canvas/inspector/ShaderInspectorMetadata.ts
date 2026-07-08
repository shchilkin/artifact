export const SHADER_COLOR_CONTROL_FIELDS = ['colorA', 'colorB', 'colorC', 'colorD'] as const;
export const SHADER_PATTERN_CONTROL_FIELDS = ['distortion', 'grain', 'swirl', 'scale', 'seedOffset'] as const;
export const SHADER_PLACEMENT_CONTROL_FIELDS = ['rotation', 'offsetX', 'offsetY'] as const;
export const SHADER_COMPOSITE_CONTROL_FIELDS = ['blendMode', 'opacity'] as const;

export const SHADER_PRESET_CONTROL_GROUPS = [
  { id: 'colors', title: 'Colors', fields: SHADER_COLOR_CONTROL_FIELDS },
  { id: 'pattern', title: 'Pattern', fields: SHADER_PATTERN_CONTROL_FIELDS },
  { id: 'placement', title: 'Placement', fields: SHADER_PLACEMENT_CONTROL_FIELDS },
  { id: 'composite', title: 'Composite', fields: SHADER_COMPOSITE_CONTROL_FIELDS },
] as const;
