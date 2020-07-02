'use strict';

/*
 * SERVERLESS COMPONENTS: CLI
 */

const os = require('os');
const chalk = require('chalk');
const ansiEscapes = require('ansi-escapes');
const stripAnsi = require('strip-ansi');
const figures = require('figures');
const prettyoutput = require('prettyoutput');
const chokidar = require('chokidar');
const { version } = require('../../package.json');

// CLI Colors
const grey = chalk.dim;
const white = (str) => str; // we wanna use the default terimanl color, so we just return the string as is with no color codes
const { green } = chalk;
const red = chalk.rgb(255, 99, 99);
const blue = chalk.rgb(199, 232, 255);

/**
 * Utility - Sleep
 */
const sleep = async (wait) => new Promise((resolve) => setTimeout(() => resolve(), wait));

/**
 * CLI
 * - Controls the CLI experience in the framework.
 * - Once instantiated, it starts a single, long running process.
 */
class CLI {
  constructor(config) {
    // Defaults
    this._ = {};
    this._.entity = 'Serverless';
    this._.status = 'Initializing';
    this._.statusColor = grey;
    this._.lastStatus = null;
    this._.debug = config.debug || false;
    this._.timer = config.timer || false;
    this._.timerStarted = Date.now();
    this._.timerSeconds = 0;
    this._.loadingDots = '';
    this._.loadingDotCount = 0;
  }

  /**
   * Renders a persistent, animated status bar in the CLI which remains visible until 'sessionClose()' is called.  Useful for deployments and other long-running processes where the user needs to know something is happening and what that is.
   * @param {string} status Update the status text in the status bar.
   * @param {string} options.timer Shows a timer for how long the session has been running.
   * @param {function} options.closeHandler A function to call when the session is closed.
   */
  sessionStart(status, options = {}) {
    // Prevent commands from accidently starting multiple sessions
    if (this._.sessionActive) {
      return null;
    }

    if (options.timer) {
      this._.timer = true;
    } else {
      this._.timer = false;
    }

    // Hide cursor, to keep it clean
    process.stdout.write(ansiEscapes.cursorHide);

    if (this._.debug) {
      // Create a white space immediately
      this.log();
    }

    // Start counting seconds
    setInterval(() => {
      this._.timerSeconds = Math.floor((Date.now() - this._.timerStarted) / 1000);
    }, 1000).unref();

    // Set default close handler, if one was not provided
    if (!options.closeHandler) {
      const self = this;
      options.closeHandler = async () => {
        return self.sessionStop('cancel', 'Canceled');
      };
    }

    // Set Event Handler: Control + C to cancel session
    process.on('SIGINT', async () => {
      await options.closeHandler();
      process.exit();
    });

    if (status) {
      this.sessionStatus(status);
    }

    this._.sessionActive = true;

    // Start render engine
    return this._renderEngine();
  }

  /**
   * Stops rendering the persistent status bar in the CLI with a final status message.
   * @param {string} reason This tells the status bar how to display its final message. Can be 'error', 'cancel', 'close', 'success', 'silent'.
   * @param {string || error} message Can be a final message to the user (string) or an error.
   */
  sessionStop(reason, message = 'Closed') {
    // Set color
    let color = white;
    if (reason === 'error' || reason === 'cancel') {
      color = red;
    }
    if (reason === 'close') {
      color = white;
    }
    if (reason === 'success') {
      color = green;
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.cursorLeft);
    process.stdout.write(ansiEscapes.eraseDown);

    // Render stack trace (if debug is on)
    if (reason === 'error') {
      this.logErrorStackTrace(message);
    }

    // Silent is used to skip the "Done" message
    if (reason !== 'silent') {
      // Write content
      this.log();
      let content = '';
      if (this._.timer) {
        content += `${`${this._.timerSeconds}s`}`;
        content += ` ${figures.pointerSmall} `;
      }
      content += `${this._.entity} `;
      content += `${figures.pointerSmall} ${message}`;
      process.stdout.write(color(content));
    }
    // Put cursor to starting position for next view
    console.log(os.EOL);
    process.stdout.write(ansiEscapes.cursorLeft);
    process.stdout.write(ansiEscapes.cursorShow);

    this._.sessionActive = false;
  }

  /**
   * Is the persistent status bar in the CLI active
   */
  isSessionActive() {
    return this._.sessionActive;
  }

  /**
   * Set the status of the persistent status display.
   * @param {string} status The text the status should show.  Keep this short.
   * @param {string} entity The entitiy (e.g. Serverless) that is sending the message.
   * @param {string} statusColor 'green', 'white', 'red', 'grey'
   */
  sessionStatus(status = null, entity = null, statusColor = null) {
    this._.status = status || this._.status;
    this._.entity = entity || this._.entity;
    if (statusColor === 'green') {
      statusColor = green;
    }
    if (statusColor === 'red') {
      statusColor = red;
    }
    if (statusColor === 'white') {
      statusColor = white;
    }
    this._.statusColor = statusColor || grey;
  }

  /**
   * Log an error and optionally a stacktrace
   * @param {error} error An instance of the Error class
   */
  logError(error) {
    // If no argument, skip
    if (!error || error === '') {
      return null;
    }

    if (typeof error === 'string') {
      error = new Error(error);
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);

    // Render stack trace (if debug is on)
    this.logErrorStackTrace(error);

    let content = `${this._.entity} `;
    content += `${figures.pointerSmall} ${error.message}`;
    process.stdout.write(red(content));
    // Put cursor to starting position for next view
    console.log(os.EOL);
    process.stdout.write(ansiEscapes.cursorLeft);

    return null;
  }

  /**
   * Log an error's stack trace
   * @param {error} error An instance of the Error class
   */
  logErrorStackTrace(error) {
    if (!this._.debug || !error.stack) {
      return null;
    }

    // If no argument, skip
    if (!error || error === '') {
      return null;
    }

    if (!(error instanceof Error)) {
      error = new Error(error);
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);

    // Render stack trace
    console.log();
    console.log('', red(error.stack));
    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);

    return null;
  }

  /**
   * TODO: REMOVE THIS.  SHOULD NOT BE IN HERE.  THIS IS NOT A GENERAL UTILS LIBRARY
   * Watch
   * - Watches the specified directory with the given options
   */
  watch(dir, opts) {
    this.watcher = chokidar.watch(dir, opts);
  }

  /**
   * TODO: REMOVE THIS.  SHOULD NOT BE IN HERE.  THIS IS NOT A GENERAL UTILS LIBRARY
   */
  debugMode() {
    return this._.debug;
  }

  /**
   * Log
   * - Render log statements cleanly
   */
  log(msg, color = null) {
    if (!msg) {
      console.log();
      return;
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);

    // Write log
    if (typeof msg === 'string') {
      msg = `${msg}\n`;
      if (!color || color === 'white') {
        process.stdout.write(white(msg));
      }
      if (color === 'grey') {
        process.stdout.write(grey(msg));
      }
      if (color === 'red') {
        process.stdout.write(red(msg));
      }
      if (color === 'green') {
        process.stdout.write(green(msg));
      }
      if (color === 'blue') {
        process.stdout.write(blue(msg));
      }
    } else {
      console.log(msg);
    }

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);
  }

  /**
   * Log Serverless Framework Logo
   */
  logLogo() {
    let logo = os.EOL;
    logo += 'serverless';
    logo += red(' ⚡');
    logo += 'framework';

    if (process.env.SERVERLESS_PLATFORM_STAGE === 'dev') {
      logo += grey(' (dev)');
    }

    this.log(logo);
  }

  /**
   * Log Serverless Framework Registry Logo
   */
  logRegistryLogo(text) {
    let logo = os.EOL;
    logo += white('serverless');
    logo += red(' ⚡');
    logo += white('registry');

    if (process.env.SERVERLESS_PLATFORM_STAGE === 'dev') {
      logo += grey(' (dev)');
    }

    if (text) {
      logo += text;
    }
    this.log(logo);
  }

  /**
   * Log Serverless Framework Components Version
   */
  logVersion() {
    this.logLogo();
    this.log();
    this.log(`components version: ${version}`);
    this.log();
  }

  logAdvertisement() {
    this.logLogo();
    let ad = grey(
      'This is a Serverless Framework Component.  Sign-in to use it for free with these features:'
    );
    ad += os.EOL;
    ad = ad + os.EOL + grey('  • Registry Access');
    ad = ad + os.EOL + grey('  • Instant Deployments & Logs');
    ad = ad + os.EOL + grey('  • State Storage, Output Sharing & Secrets');
    ad = ad + os.EOL + grey('  • And Much More: https://serverless.com/components');
    this.log(ad);
  }

  /**
   * Debug
   * - Render debug statements cleanly
   */
  debug(msg) {
    if (!this._.debug || !msg) {
      return;
    }

    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);

    console.log(`${msg}`);

    // Put cursor to starting position for next view
    process.stdout.write(ansiEscapes.cursorLeft);
  }

  /**
   * Outputs
   * - Render outputs cleanly.
   */
  logOutputs(outputs) {
    if (!outputs || typeof outputs !== 'object' || Object.keys(outputs).length === 0) {
      this.sessionStop('done', 'Success');
    }
    // Clear any existing content
    process.stdout.write(ansiEscapes.eraseDown);
    process.stdout.write(
      white(
        prettyoutput(
          outputs,
          {
            colors: {
              keys: 'bold',
              dash: null,
              number: null,
              string: null,
              true: null,
              false: null,
            },
          },
          0
        )
      )
    );
  }

  /**
   * Handles the rendering of the the persistent status bar in the CLI. Repetitively updates the CLI view on a regular interval
   */
  async _renderEngine() {
    if (!this._.sessionActive) return null;
    /**
     * Debug Mode
     */
    if (this._.debug) {
      // Print Status
      if (this._.status !== this._.lastStatus) {
        this.log(`${this._.status}...`);
        this._.lastStatus = `${this._.status}`;
      }
    }

    /**
     * Non-Debug Mode
     */
    if (!this._.debug) {
      // Update active dots
      if (this._.loadingDotCount === 0) {
        this._.loadingDots = '.';
      } else if (this._.loadingDotCount === 2) {
        this._.loadingDots = '..';
      } else if (this._.loadingDotCount === 4) {
        this._.loadingDots = '...';
      } else if (this._.loadingDotCount === 6) {
        this._.loadingDots = '';
      }
      this._.loadingDotCount++;
      if (this._.loadingDotCount > 8) {
        this._.loadingDotCount = 0;
      }

      // Clear any existing content
      process.stdout.write(ansiEscapes.eraseDown);

      // Write status content
      console.log();
      let content = '';
      if (this._.timer) {
        content += `${this._.statusColor(`${this._.timerSeconds}s`)} `;
        content += `${this._.statusColor(figures.pointerSmall)} `;
      }
      content += `${this._.statusColor(this._.entity)} `;
      content += `${this._.statusColor(figures.pointerSmall)} ${this._.statusColor(this._.status)}`;
      content += ` ${this._.statusColor(this._.loadingDots)}`;
      process.stdout.write(content);
      console.log();

      // Put cursor to starting position for next view
      const startingPosition = this._getRelativeVerticalCursorPosition(content);
      process.stdout.write(ansiEscapes.cursorUp(startingPosition));
      process.stdout.write(ansiEscapes.cursorLeft);
    }

    await sleep(100);
    return this._renderEngine();
  }

  /**
   * Get Relative Vertical Cursor Position
   * Get cursor starting position according to terminal & content width
   */
  _getRelativeVerticalCursorPosition(contentString) {
    const base = 1;
    const terminalWidth = process.stdout.columns;
    const contentWidth = stripAnsi(contentString).length;
    const nudges = Math.ceil(Number(contentWidth) / Number(terminalWidth));
    return base + nudges;
  }
}

module.exports = CLI;
