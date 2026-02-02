/**
 * server/logger.ts
 * 
 * Lightweight structured logging system for production monitoring.
 * Outputs JSON-formatted logs compatible with popular log processors
 * like Fluent Bit, Logstash, Vector, and cloud-native platforms.
 * 
 * Features:
 * - Structured JSON output (machine-readable)
 * - Multiple log levels (debug, info, warn, error)
 * - Request context tracking
 * - Environment-aware (verbose in dev, minimal in prod)
 * - Compatible with open-source log forwarders
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  source?: string;
  context?: Record<string, any>;
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface LoggerConfig {
  minLevel: LogLevel;
  verbose: boolean;
  source?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    const isDevelopment = process.env.NODE_ENV !== "production";
    this.config = {
      minLevel: config.minLevel || (isDevelopment ? "debug" : "info"),
      verbose: config.verbose ?? isDevelopment,
      source: config.source || "app",
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  private formatEntry(entry: LogEntry): string {
    if (this.config.verbose) {
      // Clean single-line format for development readability
      const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
      const err = entry.error ? ` [ERROR: ${entry.error.message}]` : '';
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${ctx}${err}`;
    }
    // Single-line JSON in production (compatible with log forwarders)
    return JSON.stringify(entry);
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      source: this.config.source,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = context;
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    const output = this.formatEntry(entry);

    // Route to appropriate console method
    switch (level) {
      case "error":
        console.error(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "debug":
        console.debug(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log("warn", message, context);
  }

  error(message: string, context?: Record<string, any>, error?: Error): void {
    this.log("error", message, context, error);
  }

  // Request-specific logging helper
  request(method: string, path: string, statusCode: number, duration: number, context?: Record<string, any>): void {
    this.info(`${method} ${path}`, {
      method,
      path,
      statusCode,
      duration,
      ...context,
    });
  }

  // Create a child logger with additional context
  child(source: string): Logger {
    return new Logger({
      ...this.config,
      source: `${this.config.source}:${source}`,
    });
  }
}

// Export singleton instance
export const logger = new Logger({ source: "server" });

// Export factory for custom loggers
export function createLogger(config: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}
