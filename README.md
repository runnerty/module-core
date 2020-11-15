<p align="center">
  <a href="http://runnerty.io">
    <img height="257" src="https://runnerty.io/assets/header/logo-stroked.png">
  </a>
  <p align="center">Smart Processes Management</p>
</p>

[![NPM version][npm-image]][npm-url] [![Downloads][downloads-image]][npm-url] [![Dependency Status][david-badge]][david-badge-url]
<a href="#badge">
  <img alt="code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg">
</a>

# Runnerty: Module Core
This module exposes the classes that Runnerty modules should extend from.


### Trigger example:
```javascript
const Trigger = require("@runnerty/module-core").Trigger;

class intervalTrigger extends Trigger {
  constructor(chain, params) {
    super(chain, params);
  }

  start() {
    const checkCalendar = true;
    const inputValues = [];
    const customValues = {};
    setTimeout(() => {
      // Run Chain 🚀:
      try {
        this.startChain(checkCalendar, inputValues, customValues);
      } catch (err) {
        this.logger.error('startChain (intervalTrigger):', err);
      }
    }, this.params.interval);
  }
}

module.exports = intervalTrigger;
```

### Executor example:
```javascript
const Executor = require("@runnerty/module-core").Executor;

class greetingExecutor extends Executor {
  constructor(process) {
    super(process);
    this.options = {};
    this.endOptions = { end: 'end' };
  }

  async exec(options) {
    this.options = options;
    try {
      // Greeting 👋:
      this.endOptions.messageLog = this.options.greeting;
      this.end(this.endOptions);
    } catch (err) {
      this.endOptions.end = 'error';
      this.endOptions.err_output = err.message;
      this.end(this.endOptions);
    }
  }
}

module.exports = greetingExecutor;
```

### Notifier example:
```javascript
const Notifier = require('@runnerty/module-core').Notifier;

class consoleNotifier extends Notifier {
  constructor(notification) {
    super(notification);
  }
  // Notification sender 📤:
  send(notification) {
    notification.mode = notification.mode ? notification.mode.toString() : 'info';
    notification.message = notification.message ? notification.message.toString() : '';
    this.logger.log(notification.mode, notification.message);
    this.end();
  }
}

module.exports = consoleNotifier;
```


[Runnerty]: http://www.runnerty.io
[downloads-image]: https://img.shields.io/npm/dm/@runnerty/module-core.svg
[npm-url]: https://www.npmjs.com/package/@runnerty/module-core
[npm-image]: https://img.shields.io/npm/v/@runnerty/module-core.svg
[david-badge]: https://david-dm.org/runnerty/module-core.svg
[david-badge-url]: https://david-dm.org/runnerty/module-core
