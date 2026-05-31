import '@vitejs/plugin-react/preamble';

declare global {
  var $RefreshReg$: ((type: unknown, id: string) => void) | undefined;
  var $RefreshSig$: (() => (type: unknown) => unknown) | undefined;
}

globalThis.$RefreshReg$ ??= () => {};
globalThis.$RefreshSig$ ??= () => (type: unknown) => type;

export {};
