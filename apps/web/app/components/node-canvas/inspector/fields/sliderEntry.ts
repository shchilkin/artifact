/** Range of a slider's numeric entry. `min` is the step origin, as for `<input type="range">`. */
export interface SliderEntryRange {
  min: number;
  max: number;
  step: number;
}

/** Decimal places in a number as written, so stepped values can be rounded back from float error. */
function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const [mantissa, exponent] = value.toExponential().split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.max(0, fraction - Number(exponent));
}

/** Decimal places the slider can produce: those of its step and of its step origin. */
export function sliderPrecision({ min, step }: Pick<SliderEntryRange, 'min' | 'step'>): number {
  return Math.max(decimalPlaces(step), decimalPlaces(min));
}

/** The nearest value on the slider's step grid, counted from `min`, within `[min, max]`. */
export function snapToStep(value: number, { min, max, step }: SliderEntryRange): number {
  const clamped = Math.min(max, Math.max(min, value));
  if (!(step > 0)) return clamped;
  const snapped = min + Math.round((clamped - min) / step) * step;
  const rounded = Number(snapped.toFixed(sliderPrecision({ min, step })));
  return Math.min(max, Math.max(min, rounded));
}

/**
 * The value typed into numeric entry, clamped and snapped like a slider value, or `null` when the text is not a
 * finite number (empty, `-`, `1e`).
 */
export function parseEntry(text: string, range: SliderEntryRange): number | null {
  if (text.trim() === '') return null;
  const typed = Number(text);
  return Number.isFinite(typed) ? snapToStep(typed, range) : null;
}

/** Shows a stored value at the slider's precision, so float error such as 0.30000000000000004 reads as 0.3. */
export function formatEntry(value: number, range: Pick<SliderEntryRange, 'min' | 'step'>): string {
  return String(Number(value.toFixed(sliderPrecision(range))));
}
