// src/tests/jest.setup.ts

// Increase timeout for all tests
jest.setTimeout(10000);

// Mock console methods to capture output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Store logs for test analysis
global.testLogs = {
  logs: [] as string[],
  errors: [] as string[],
  warnings: [] as string[],
  
  clear() {
    this.logs = [];
    this.errors = [];
    this.warnings = [];
  }
};

// Override console methods
console.log = (...args: any[]) => {
  const message = args.join(' ');
  global.testLogs.logs.push(message);
  originalConsoleLog(...args);
};

console.error = (...args: any[]) => {
  const message = args.join(' ');
  global.testLogs.errors.push(message);
  originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
  const message = args.join(' ');
  global.testLogs.warnings.push(message);
  originalConsoleWarn(...args);
};

// Restore console methods after tests
afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Add custom matchers
expect.extend({
  toHaveBeenLoggedWith(received: string) {
    const pass = global.testLogs.logs.some(log => log.includes(received));
    return {
      pass,
      message: () => pass
        ? `Expected "${received}" not to have been logged`
        : `Expected "${received}" to have been logged, but it wasn't`
    };
  },
  
  toHaveBeenErroredWith(received: string) {
    const pass = global.testLogs.errors.some(error => error.includes(received));
    return {
      pass,
      message: () => pass
        ? `Expected "${received}" not to have been logged as error`
        : `Expected "${received}" to have been logged as error, but it wasn't`
    };
  }
});

// Declare global types
declare global {
  namespace NodeJS {
    interface Global {
      testLogs: {
        logs: string[];
        errors: string[];
        warnings: string[];
        clear(): void;
      };
    }
  }
  
  namespace jest {
    interface Matchers<R> {
      toHaveBeenLoggedWith(text: string): R;
      toHaveBeenErroredWith(text: string): R;
    }
  }
}