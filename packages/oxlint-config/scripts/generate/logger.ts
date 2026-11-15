export interface Logger {
  readonly info: (message: string) => void;
  readonly warn: (message: string) => void;
  readonly error: (message: string, error?: unknown) => void;
}

export const consoleLogger: Logger = {
  info: (message) => {
    console.info(message);
  },
  warn: (message) => {
    console.warn(message);
  },
  error: (message, error) => {
    if (error === undefined) {
      console.error(message);
      return;
    }

    console.error(message, error);
  },
};
