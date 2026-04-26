import { SIZE_OF_, WASM_TYPE } from "./wasmTypes";

export class WasmMemory {
  memory: WebAssembly.Memory;

  /** Returns a `DataView` scoped to the given byte range in WASM linear memory. */
  view(ptr?: number, len?: number) {
    return new DataView(this.memory.buffer, ptr, len);
  }

  constructor(memory: WebAssembly.Memory) {
    this.memory = memory;
  }

  /** Reads a single `u8` at `ptr`. */
  getU8(ptr: number): number {
    return this.view(ptr, SIZE_OF_[WASM_TYPE.U8]).getUint8(0);
  }
  /** Returns a `Uint8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getU8Array(ptr?: number, len?: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single `u8` at `ptr`. */
  setU8(ptr: number, val: number) {
    this.view(ptr, SIZE_OF_[WASM_TYPE.U8]).setUint8(0, val);
  }
  /** Writes multiple `u8` values starting at `ptr`. */
  setU8Array(ptr: number, ...vals: number[]) {
    new Uint8Array(this.memory.buffer, ptr, vals.length).set(vals);
  }

  /** Reads a single `i8` at `ptr`. */
  getI8(ptr: number): number {
    return this.view(ptr, SIZE_OF_[WASM_TYPE.I8]).getInt8(0);
  }
  /** Returns a `Int8Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getI8Array(ptr?: number, len?: number): Int8Array {
    return new Int8Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single `i8` at `ptr`. */
  setI8(ptr: number, val: number) {
    this.view(ptr, SIZE_OF_[WASM_TYPE.I8]).setInt8(0, val);
  }
  /** Writes multiple `i8` values starting at `ptr`. */
  setI8Array(ptr: number, ...vals: number[]) {
    new Int8Array(this.memory.buffer, ptr, vals.length).set(vals);
  }

  /** Reads a single little-endian `u32` at `ptr`. */
  getU32(ptr: number): number {
    return this.view(ptr, SIZE_OF_[WASM_TYPE.U32]).getUint32(0, true);
  }
  /** Returns a `Uint32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getU32Array(ptr?: number, len?: number): Uint32Array {
    return new Uint32Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single little-endian `u32` at `ptr`. */
  setU32(ptr: number, val: number) {
    this.view(ptr, SIZE_OF_[WASM_TYPE.U32]).setUint32(0, val, true);
  }
  /** Writes multiple little-endian `u32` values starting at `ptr`. */
  setU32Array(ptr: number, ...vals: number[]) {
    new Uint32Array(this.memory.buffer, ptr, vals.length).set(vals);
  }

  /** Reads a single little-endian `f32` at `ptr`. */
  getF32(ptr: number): number {
    return this.view(ptr, SIZE_OF_[WASM_TYPE.F32]).getFloat32(0, true);
  }
  /** Returns a `Float32Array` view into WASM memory bounded to `[ptr, ptr+len)`. */
  getF32Array(ptr?: number, len?: number): Float32Array {
    return new Float32Array(this.memory.buffer, ptr, len);
  }
  /** Writes a single little-endian `f32` at `ptr`. */
  setF32(ptr: number, val: number) {
    this.view(ptr, SIZE_OF_[WASM_TYPE.F32]).setFloat32(0, val, true);
  }
  /** Writes multiple little-endian `f32` values starting at `ptr`. */
  setF32Array(ptr: number, ...vals: number[]) {
    new Float32Array(this.memory.buffer, ptr, vals.length).set(vals);
  }

  /** Returns a `Uint8ClampedArray` view into WASM memory at `ptr`, suitable for use as `ImageData` pixel data. */
  getImgBuffer(ptr: number, len: number): Uint8ClampedArray<ArrayBuffer> {
    return new Uint8ClampedArray(this.memory.buffer, ptr, len);
  }
}
