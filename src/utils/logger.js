/**
 * Simple logger utility
 */
class Logger {
  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    
    this.styles = {
      reset: "\x1b[0m",
      bright: "\x1b[1m",
      dim: "\x1b[2m",
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      white: "\x1b[37m"
    };

    this.icons = {
      info: '✨',
      warn: '⚠️ ',
      error: '🚨',
      debug: '🐛'
    };
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const icon = this.icons[level] || '';
    
    let color = this.styles.white;
    if (level === 'info') color = this.styles.cyan;
    if (level === 'warn') color = this.styles.yellow;
    if (level === 'error') color = this.styles.red;
    if (level === 'debug') color = this.styles.magenta;

    const prefix = `${this.styles.dim}[${timestamp}]${this.styles.reset} ${color}${icon} [${level.toUpperCase()}]${this.styles.reset}`;
    
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