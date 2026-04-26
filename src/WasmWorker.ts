import {
  WASM_TYPE,
  type WasmWorkerOptions,
  type FnKeys,
  type GlobalKeys,
} from "./wasmTypes";

type Resolve<R> = { resolve: (v: R) => void; reject: (e: string) => void };

export class WasmWorker<T extends WebAssembly.Exports> {
  buffer: SharedArrayBuffer | null = null;
  private _pointers: Partial<Record<keyof T, number>> = {};
  private mainCallbacks = new Map<string, (...args: unknown[]) => void>();

  /** Maps exported global names to their memory addresses in the shared WASM buffer. */
  get exports(): Partial<Record<keyof T, number>> {
    return this._pointers;
  }
  private worker: Worker;
  private pending = new Map<number, Resolve<unknown>>();
  private seq = 0;

  private constructor() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }: MessageEvent) => {
      if (data.type === "callback") {
        this.mainCallbacks.get(data.name)?.(...(data.args ?? []));
        return;
      }
      const cb = this.pending.get(data.id);
      if (!cb) return;
      this.pending.delete(data.id);
      data.error ? cb.reject(data.error) : cb.resolve(data.result);
    };
    this.worker.onerror = (e) => console.error("WasmWorker error:", e);
  }

  /** Creates a `WasmWorker`, loads the `.wasm` binary inside a dedicated Web Worker with shared memory, and resolves once ready. */
  static async create<T extends WebAssembly.Exports = {}>(
    url: string,
    options?: WasmWorkerOptions<T>,
  ): Promise<WasmWorker<T>> {
    const w = new WasmWorker<T>();
    await w.init(url, options);
    return w;
  }

  private async init(url: string, options?: WasmWorkerOptions<T>): Promise<void> {
    const { envImport, ...restOptions } = options ?? {};
    const callbackNames: string[] = [];
    for (const [name, fn] of Object.entries(envImport ?? {})) {
      if (typeof fn === "function") {
        this.mainCallbacks.set(name, fn as (...args: unknown[]) => void);
        callbackNames.push(name);
      }
    }
    const { sab, pointers } = await this.send<{
      sab: SharedArrayBuffer;
      pointers: Record<string, number>;
    }>("init", { url, options: restOptions, callbackNames });
    this.buffer = sab;
    this._pointers = pointers as Partial<Record<keyof T, number>>;
  }

  private send<R>(type: string, data: object): Promise<R> {
    const id = this.seq++;
    return new Promise<R>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
      });
      this.worker.postMessage({ id, type, ...data });
    });
  }

  private ptr(key: GlobalKeys<T>): number {
    if (!this.buffer) throw new Error("not initialized");
    const ptr = this._pointers[key];
    if (ptr === undefined) throw new Error(`no pointer for "${String(key)}"`);
    return ptr;
  }

  // --- direct SAB reads ---

  /** Returns a typed array view directly into the shared WASM memory — zero-copy, synchronous. */
  getArr(
    key: GlobalKeys<T>,
    asType: WASM_TYPE,
    len: number,
  ): Uint8Array | Uint32Array | Float32Array | Int8Array {
    const ptr = this.ptr(key);
    switch (asType) {
      case WASM_TYPE.U8:
        return new Uint8Array(this.buffer!, ptr, len);
      case WASM_TYPE.I8:
        return new Int8Array(this.buffer!, ptr, len);
      case WASM_TYPE.U32:
        return new Uint32Array(this.buffer!, ptr, len);
      case WASM_TYPE.F32:
        return new Float32Array(this.buffer!, ptr, len);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Reads a single numeric value directly from the shared WASM memory. */
  get(key: GlobalKeys<T>, asType: WASM_TYPE): number {
    const ptr = this.ptr(key);
    const view = new DataView(this.buffer!);
    switch (asType) {
      case WASM_TYPE.U8:
        return view.getUint8(ptr);
      case WASM_TYPE.I8:
        return view.getInt8(ptr);
      case WASM_TYPE.U32:
        return view.getUint32(ptr, true);
      case WASM_TYPE.F32:
        return view.getFloat32(ptr, true);
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Copies pixel data out of shared WASM memory into a regular `ArrayBuffer`, ready for use with `ImageData`. */
  getImg(key: GlobalKeys<T>, len: number): Uint8ClampedArray<ArrayBuffer> {
    return new Uint8ClampedArray(this.buffer!, this.ptr(key), len).slice();
  }

  /** Decodes UTF-8 text directly from the shared WASM memory. */
  getText(key: GlobalKeys<T>, len: number): string {
    return new TextDecoder().decode(
      new Uint8Array(this.buffer!, this.ptr(key), len),
    );
  }

  /** Parses a JSON string directly from the shared WASM memory. */
  getJSON(key: GlobalKeys<T>, len: number): unknown {
    try {
      return JSON.parse(this.getText(key, len));
    } catch (err) {
      console.error(`Invalid JSON: ${err}`);
    }
  }

  // --- direct SAB writes ---

  /** Writes a single numeric value directly into the shared WASM memory. */
  set(key: GlobalKeys<T>, asType: WASM_TYPE, val: number): void {
    const ptr = this.ptr(key);
    const view = new DataView(this.buffer!);
    switch (asType) {
      case WASM_TYPE.U8:
        view.setUint8(ptr, val);
        break;
      case WASM_TYPE.I8:
        view.setInt8(ptr, val);
        break;
      case WASM_TYPE.U32:
        view.setUint32(ptr, val, true);
        break;
      case WASM_TYPE.F32:
        view.setFloat32(ptr, val, true);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Writes multiple values into the shared WASM memory starting at the exported symbol's address. */
  setArr(key: GlobalKeys<T>, asType: WASM_TYPE, ...vals: number[]): void {
    const base = this.ptr(key);
    switch (asType) {
      case WASM_TYPE.U8:
        new Uint8Array(this.buffer!, base, vals.length).set(vals);
        break;
      case WASM_TYPE.I8:
        new Int8Array(this.buffer!, base, vals.length).set(vals);
        break;
      case WASM_TYPE.U32:
        new Uint32Array(this.buffer!, base, vals.length).set(vals);
        break;
      case WASM_TYPE.F32:
        new Float32Array(this.buffer!, base, vals.length).set(vals);
        break;
      default:
        throw new Error(`Unknown WASM_TYPE: ${asType}`);
    }
  }

  /** Executes an exported WASM function in the worker thread and returns its result. */
  call(fn: FnKeys<T>, ...args: unknown[]): Promise<unknown> {
    return this.send("call", { fn, args });
  }

  /** Terminates the underlying Web Worker and rejects any in-flight `call()` promises. */
  terminate(): void {
    for (const { reject } of this.pending.values()) {
      reject("Worker terminated");
    }
    this.pending.clear();
    this.worker.terminate();
  }
}
