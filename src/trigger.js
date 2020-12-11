'use strict';

const interpreter = require('@runnerty/runnerty-interpreter');

class Trigger {
  constructor(args) {
    this.queue = args.queue;
    this.runtime = args.runtime;
    this.checkCalendar = args.checkCalendar;
    this.logger = args.logger;
    this.chain = args.chain;
    this.params = args.params;
    if (this.params.config.server && this.params.server) {
      this.params.server = Object.assign(this.params.config.server, this.params.server);
    }
  }

  async init() {
    try {
      this.params = await interpreter(this.params, this.chain.values(), undefined, this.runtime.config?.interpreter_max_size, this.runtime.config?.global_values);
      // SERVER:
      if (this.params.server) {
        if (this.runtime.servers[this.params.server.id]) {
          this.params.server = Object.assign(this.params.server, this.runtime.servers[this.params.server.id]);
        } else {
          this.logger.log('error', `Trigger Error. Server Id ${this.params.server.id} not found.`);
          throw new Error(`Trigger Error. Server Id ${this.params.server.id} not found.`);
        }
      }
      return this;
    } catch (err) {
      this.logger.log('error', `init Notification:`, err);
      throw err;
    }
  }

  async start() {
    if (this.params.server) {
      this.params.server.router[this.params.server.method.toLowerCase()](this.params.server.path || '/', (req, res) => {
        this.params.server.req = req;
        this.params.server.res = res;
        return this.on_request(req);
      });
    } else {
      this.logger.log('error', 'Method start (execution) must be rewrite in child class');
      this.process.execute_err_return = 'Method start (trigger) must be rewrite in child class';
      this.process.msg_output = '';
      this.process.error();
      throw new Error('Method start (trigger) must be rewrite in child class');
    }
  }

  async on_request() {
    this.logger.log('error', 'Method on_request (execution) must be rewrite in child class');
    this.process.execute_err_return = 'Method on_request (trigger) must be rewrite in child class';
    this.process.msg_output = '';
    this.process.error();
    throw new Error('Method on_request (trigger) must be rewrite in child class');
  }

  async startChain(_checkCalendar = true, inputValues, customValues, responseServerObject) {
    let start = false;

    if (this.params.server) {
      let statusCode = 200;
      let resObject = responseServerObject;

      if (responseServerObject && responseServerObject.statusCode) {
        statusCode = responseServerObject.statusCode;
        resObject = {};
      }

      if (responseServerObject && responseServerObject.object) {
        resObject = responseServerObject.object;
      }

      this.params.server.res.status(statusCode).json(resObject);
    }

    if (_checkCalendar && this.params.calendars) {
      try {
        const dateEnableOnDate = await this.checkCalendar(this.params.calendars);
        if (dateEnableOnDate) start = true;
      } catch (err) {
        start = false;
        logger.log('debug', `Chain ${this.id} not started: Date not enable in calendar.`);
        throw err;
      }
    } else {
      start = true;
    }

    if (start && !this.runtime.forcedInitChainsIds) {
      this.queue.queueChain(this.chain, inputValues, customValues);
    }
  }

  async getParamValues() {
    try {
      const values = await interpreter(this.params, this.chain.values(), undefined, this.runtime.config?.interpreter_max_size, this.runtime.config?.global_values);
      return values;
    } catch (err) {
      this.logger.log('error', `Trigger - Method getParamValues: ${err}`);
      this.chain.err_output = 'Trigger - Method getParamValues:' + err;
      this.chain.msg_output = '';
      this.chain.error();
      throw err;
    }
  }
}

module.exports = Trigger;
