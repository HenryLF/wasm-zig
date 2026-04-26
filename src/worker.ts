import { WasmExecutable } from "./WasmExecutable";

let wasm: WasmExecutable<Record<string, WebAssembly.ExportValue>> | null = null;

self.onmessage = async (e: MessageEvent) => {
  const { id, type, ...data } = e.data;
  try {
    let result: unknown;

    switch (type) {
      case "init": {
        const callbackEnv: WebAssembly.ModuleImports = {};
        for (const name of (data.callbackNames ?? []) as string[]) {
          callbackEnv[name] = (...args: unknown[]) => {
            self.postMessage({ type: "callback", name, args });
          };
        }
        const sharedOptions = {
          ...data.options,
          envImport: { ...data.options?.envImport, ...callbackEnv },
          memoryOptions: { ...data.options?.memoryOptions, shared: true },
        };
        wasm = await WasmExecutable.create(data.url, sharedOptions);
        const pointers: Record<string, number> = {};
        for (const [key, val] of Object.entries(wasm.exports)) {
          if (val && typeof val !== "function")
            pointers[key] = val.valueOf() as number;
        }
        result = { sab: wasm.memory.memory.buffer, pointers };
        break;
      }
      case "call": {
        if (!wasm) throw new Error("WASM not initialized");
        result = wasm.call(data.fn as never, ...data.args);
        break;
      }
      default:
        throw new Error(`Unknown message type: ${type}`);
    }

    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};
