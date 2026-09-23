/* tslint:disable */
/* eslint-disable */

export class WebSession {
    free(): void;
    [Symbol.dispose](): void;
    editor_state_json(): string;
    execute(command_json: string): boolean;
    export_json(): string;
    constructor(source: string);
    redo(): boolean;
    render_plan_json(width: number, height: number): string;
    set_image(layer_id: string, patch_json: string): boolean;
    set_scanlines(layer_id: string, amount: number): boolean;
    set_text(layer_id: string, patch_json: string): boolean;
    summary_json(): string;
    undo(): boolean;
}

export function new_project(): string;

export function patch_layer(layer_json: string, patch_json: string): string;

export function render_effect(pixels: Uint8Array, width: number, height: number, layer_json: string, seed: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_websession_free: (a: number, b: number) => void;
    readonly new_project: () => [number, number];
    readonly patch_layer: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly render_effect: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly websession_editor_state_json: (a: number) => [number, number];
    readonly websession_execute: (a: number, b: number, c: number) => [number, number, number];
    readonly websession_export_json: (a: number) => [number, number];
    readonly websession_new: (a: number, b: number) => [number, number, number];
    readonly websession_redo: (a: number) => number;
    readonly websession_render_plan_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly websession_set_image: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly websession_set_scanlines: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly websession_set_text: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly websession_summary_json: (a: number) => [number, number];
    readonly websession_undo: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
