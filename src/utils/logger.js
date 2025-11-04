/**
 * Simple logger utility
 */
class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (typeof message === 'string') {
      return `${prefix} ${message}${args.length ? ' ' + args.join(' ') : ''}`;
    } else {
      return `${prefix} ${JSON.stringify(message)}`;
    }
  }

  info(message, ...args) {
    console.log(this.formatMessage('info', message, ...args));
  }

  warn(message, ...args) {
    console.warn(this.formatMessage('warn', message, ...args));
  }

  error(message, ...args) {
    console.error(this.formatMessage('error', message, ...args));
  }

  debug(message, ...args) {
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, ...args));
    }
  }
}

module.exports = new Logger();