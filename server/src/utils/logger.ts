export type DebugLogger = {
  debug: (details: Record<string, unknown>, message?: string) => void;
};

export const noopDebugLogger: DebugLogger = {
  debug: () => {}
};
