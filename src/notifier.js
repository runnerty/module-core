'use strict';

const qnm = require('../lib/queue-notifications-memory');
const qnr = require('../lib/queue-notifications-redis');
const crypto = require('crypto');
const interpreter = require('@runnerty/interpreter-core');

class Notifier {
  constructor(args) {
    this.notification = args.notification;
    this.id = args.notification.id;
    this.checkNotifierParams = args.checkNotifierParams;
    this.runtime = args.runtime;
    this.logger = args.logger;
    this.config = args.notification.config;
  }

  async init() {
    try {
      if (!this.notification.type && this.notification.config.type) {
        this.notification.type = this.notification.config.type;
      }
      this.uId = await this.getUid();
      await this.checkNotifierParams(this.notification);
      return this;
    } catch (err) {
      throw err;
    }
  }

  async notificate(values) {
    try {
      const _values = await this.getValues(values);
      await this.queue(this.notification.channel, _values);
    } catch (err) {
      this.logger.log('error', `Notificate ${err}`);
    }
  }

  sendMain(notification) {
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.send(notification);
    });
  }

  send() {
    this.logger.log('error', 'Method send (notification) must be rewrite in child class');
  }

  end(options) {
    if (!options) options = {};
    options.end = options.end || 'end';

    switch (options.end) {
      case 'error':
        this.logger.log('error', options.messageLog);
        this.reject(options.messageLog || '');
        break;
      default:
        this.resolve();
        break;
    }
  }

  async getValues(values) {
    let notifValues = this.notification;
    Object.assign(notifValues, this.config);
    delete notifValues.config;
    try {
      const _values = await interpreter(
        notifValues,
        values,
        undefined,
        this.runtime.config?.interpreter_max_size,
        this.runtime.config?.global_values
      );
      return _values;
    } catch (err) {
      this.logger.log('error', `getValues Notifier: ${err}`);
      throw err;
    }
  }

  async queue(listName, notifToQueue) {
    const list = this.id + (listName ? '_' + listName : '');
    // QUEUE REDIS;
    if (this.runtime.config.queueNotifiersExternal && runtime.config.queueNotifiersExternal === 'redis') {
      //REDIS QUEUE:
      const qnrParams = {
        runtime: this.runtime,
        logger: this.logger
      };
      const _qnr = new qnr(qnrParams);
      await _qnr.queue(this, notifToQueue, list);
    } else {
      //MEMORY QUEUE:
      const qnmParams = {
        runtime: this.runtime,
        logger: this.logger
      };
      const _qnm = new qnm(qnmParams);
      await _qnm.queue(this, notifToQueue, list);
    }
  }

  async getUid() {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buffer) => {
        if (err) {
          this.logger.log('error', `setUid Notifier: ${err}`);
          reject(err);
        } else {
          resolve(this.id + '_' + buffer.toString('hex'));
        }
      });
    });
  }
}

module.exports = Notifier;
