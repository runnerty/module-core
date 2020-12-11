'use strict';

const ms = require('millisecond');
const lodash = require('lodash');

const stringify = require('json-stringify-safe');
const interpreter = require('@runnerty/interpreter-core');

class Executor {
  constructor(args) {
    this.logger = args.logger;
    this.checkExecutorParams = args.checkExecutorParams;
    const params = Object.keys(args.process.exec);
    let paramsLength = params.length;

    while (paramsLength--) {
      if (params[paramsLength] === 'type') {
        this.logger.log(
          'error',
          `Params of "${args.process.id}" contains no allowed "type" parameter, will be ignored.`
        );
      } else {
        this[params[paramsLength]] = args.process.exec[params[paramsLength]];
      }
    }
    this.process = args.process;
    this.processId = args.process.id;
    this.processName = args.process.name;
    this.processUId = args.process.uId;
    this.runtime = args.runtime;
  }

  async init() {
    try {
      const configValues = await this.process.loadExecutorConfig();
      if (!this.type && configValues.type) {
        this.type = configValues.type;
      }
      this.config = configValues;
      const execToCheck = Object.assign({}, this.process.exec);
      execToCheck.config = configValues;
      execToCheck.type = this.type;
      this.checkExecutorParams(execToCheck);
      return this;
    } catch (err) {
      this.logger.log('error', `init Executor:`, err);
      throw err;
    }
  }

  async execMain(process_resolve, process_reject) {
    this.resolve = process_resolve;
    this.reject = process_reject;
    try {
      const values = await this.getValues();
      this.exec(values);
    } catch (err) {
      this.logger.log('error', `execMain Executor:`, err);
      this.process.execute_err_return = `execMain Executor: ${err}`;
      this.process.msg_output = '';
      await this.process.error();
      this.reject(`execMain Executor: ${err}`);
    }
  }

  async exec() {
    this.logger.log('error', 'Method exec (execution) must be rewrite in child class');
    this.process.execute_err_return = 'Method exec (execution) must be rewrite in child class';
    this.process.msg_output = '';
    await this.process.error();
    throw new Error('Method exec (execution) must be rewrite in child class');
  }

  async killMain(reason, options) {
    try {
      const values = await this.getValues();
      this.kill(values, reason, options);
    } catch (err) {
      this.logger.log('error', `killMain Executor:`, err);
      this.process.execute_err_return = `killMain Execution ${err}`;
      this.process.msg_output = '';
      await this.process.error();
      throw new Error(`killMain Execution ${err}`);
    }
  }

  kill(params, reason, options) {
    this.logger.log('warn', this.id, 'killed: ', reason);
    this.process.execute_err_return = this.id + ' - killed: ' + reason;
    this.process.msg_output = '';
    this.end(options);
  }

  async end(options) {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    if (!options) {
      options = {};
    }
    options.end = options.end || 'end';

    this.process.execute_arg = options.execute_arg;
    this.process.command_executed = options.command_executed;

    let outputParsed;
    //OUTPUT FILTER (data_output):
    if (this.process.output_filter && options.data_output) {
      try {
        if (options.data_output instanceof Object) {
          outputParsed = options.data_output;
        } else {
          outputParsed = JSON.parse(options.data_output);
        }
        //OVERRIDE DATA OUTPUT:
        options.data_output = await this.applyOuputFilter(this.process.output_filter, outputParsed);
        outputParsed = options.data_output;
      } catch (err) {
        this.logger.log('warn', `The output of process ${this.process.id}, is not a filterable object.`);
      }
    }

    //OUTPUT ORDER (data_output):
    if (this.process.output_order && options.data_output) {
      try {
        if (!outputParsed) {
          if (options.data_output instanceof Object) {
            outputParsed = options.data_output;
          } else {
            outputParsed = JSON.parse(options.data_output);
          }
        }
        //OVERRIDE DATA OUTPUT:
        options.data_output = this.applyOutputOrder(this.process.output_order, outputParsed);
      } catch (err) {
        this.logger.log('warn', `The output of process ${this.process.id}, is not a sortable object.`);
      }
    }

    let extraOutputParsed;
    //OUTPUT FILTER (extra_output):
    if (this.process.output_filter && options.extra_output) {
      try {
        if (options.extra_output instanceof Object) {
          extraOutputParsed = options.extra_output;
        } else {
          extraOutputParsed = JSON.parse(options.extra_output);
        }
        //OVERRIDE DATA OUTPUT:
        options.extra_output = await this.applyOuputFilter(this.process.output_filter, extraOutputParsed);
        extraOutputParsed = options.extra_output;
      } catch (err) {
        this.logger.log('warn', `The extra_output of process ${this.process.id}, is not a filterable object.`);
      }
    }

    //OUTPUT ORDER (extra_output):
    if (this.process.output_order && options.extra_output) {
      try {
        if (!extraOutputParsed) {
          if (options.data_output instanceof Object) {
            extraOutputParsed = options.extra_output;
          } else {
            extraOutputParsed = JSON.parse(options.extra_output);
          }
        }
        //OVERRIDE DATA OUTPUT:
        options.extra_output = this.applyOutputOrder(this.process.output_order, extraOutputParsed);
      } catch (err) {
        this.logger.log('warn', `The extra_output of process ${this.process.id}, is not a sortable object.`);
      }
    }

    //STANDARD OUPUT:
    this.process.data_output =
      options.data_output instanceof Object ? stringify(options.data_output) : options.data_output || '';
    this.process.msg_output = options.msg_output || '';

    //EXTRA DATA OUTPUT:
    if (options.extra_output) {
      this.process.extra_output = this.JSON2KV(options.extra_output, '_', 'PROCESS_EXEC');
    }

    switch (options.end) {
      case 'error':
        if (this.process.retries && !this.process.retries_count) this.process.retries_count = 0;

        // RETRIES:
        if (this.process.retries && this.process.retries_count < this.process.retries) {
          const willRetry = true;
          const writeOutput = true;
          this.process.err_output = options.err_output;
          // NOTIFICATE ONLY LAST FAIL: notificate_only_last_fail
          await this.process.error(!this.process.notificate_only_last_fail, writeOutput, willRetry);

          // RETRIES DELAY:
          setTimeout(() => {
            this.process.retries_count = (this.process.retries_count || 0) + 1;
            this.process.err_output = '';
            this.process.retry();
            this.execMain(this.resolve, this.reject);
          }, ms(this.process.retry_delay));
        } else {
          this.process.err_output = options.err_output;
          await this.process.error();
          this.reject(options.messageLog || '');
        }
        break;
      default:
        await this.process.end();
        this.resolve();
        break;
    }
  }

  async paramsReplace(input, options) {
    const useGlobalValues = options.useGlobalValues || true;
    const useProcessValues = options.useProcessValues || false;
    const useExtraValue = options.useExtraValue || false;

    const _options = {
      ignoreGlobalValues: !useGlobalValues
    };

    if (options.altValueReplace) {
      _options.altValueReplace = options.altValueReplace;
    }

    const replacerValues = {};
    //Process values
    if (useProcessValues) {
      Object.assign(replacerValues, this.process.values());
    }
    // Custom object values:
    if (useExtraValue) {
      Object.assign(replacerValues, useExtraValue);
    }

    try {
      const replacedValues = await interpreter(
        input,
        replacerValues,
        _options,
        this.runtime.config?.interpreter_max_size,
        this.runtime.config?.global_values
      );
      return replacedValues;
    } catch (err) {
      this.logger.log('error', 'Execution - Method getValues:', err);
      this.process.err_output = 'Execution - Method getValues:' + err;
      this.process.msg_output = '';
      await this.process.error();
      throw err;
    }
  }

  // Return config and params values:
  async getValues() {
    try {
      const configValues = await this.process.loadExecutorConfig();

      const values = {};
      Object.assign(values, configValues);
      Object.assign(values, this.process.exec);
      if (this.process.exec.type && configValues.type) {
        values.type = configValues.type;
      }
      const repacedValues = await interpreter(values, this.process.values());
      return repacedValues;
    } catch (err) {
      this.logger.log('error', 'Execution - Method getValues / loadExecutorConfig:', err);
      this.process.err_output = 'Execution - Method getValues / loadExecutorConfig:' + err;
      this.process.msg_output = '';
      await this.process.error();
      throw err;
    }
  }

  async getParamValues() {
    try {
      const res = await interpreter(
        this.process.exec,
        this.process.values(),
        undefined,
        this.runtime.config?.interpreter_max_size,
        this.runtime.config?.global_values
      );
      return res;
    } catch (err) {
      this.logger.log('error', 'Execution - Method getParamValues:', err);
      this.process.err_output = 'Execution - Method getParamValues:' + err;
      this.process.msg_output = '';
      await this.process.error();
      throw err;
    }
  }

  async getConfigValues() {
    try {
      const configValues = await this.chain.loadExecutorConfig();
      const replacedValues = await interpreter(
        configValues,
        this.process.values(),
        undefined,
        this.runtime.config?.interpreter_max_size,
        this.runtime.config?.global_values
      );
      return replacedValues;
    } catch (err) {
      this.logger.log('error', 'Execution - Method getConfigValues:', err);
      this.process.err_output = 'Execution - Method getConfigValues:' + err;
      this.process.msg_output = '';
      await this.process.error();
      throw err;
    }
  }

  JSON2KV(objectToPlain, separator, prefix) {
    const _self = this;
    const res = {};

    // Sub function: Recursive call to flatten objects:
    function _iterateObject(key, object2KV) {
      // Si el objeto no está vacio:
      if (Object.keys(object2KV).length) {
        // Recursive call to obtain key / value of the entire object tree:
        const sub_res = _self.JSON2KV(object2KV, separator);
        const sub_res_keys = Object.keys(sub_res);
        // Loop through the result to include in "res" all keys / value including current key:
        for (let i = 0; i < sub_res_keys.length; i++) {
          res[key + separator + sub_res_keys[i]] = sub_res[sub_res_keys[i]];
        }
      } else {
        // If the object is empty we return the current key with null value:
        res[key] = null;
      }
    }

    const eobjs = Object.keys(objectToPlain);

    // We iterate through the object to flatten:
    for (let i = 0; i < eobjs.length; i++) {
      // Generate the key from the key of the iteration item. In case of arriving prefix it is included and we always do uppercase:
      const key = prefix ? prefix + separator + eobjs[i].toUpperCase() : eobjs[i].toUpperCase();
      // Check if it is an object:
      if (
        objectToPlain[eobjs[i]] &&
        typeof objectToPlain[eobjs[i]] === 'object' &&
        objectToPlain[eobjs[i]].constructor === Object
      ) {
        // Call to the sub-function:
        _iterateObject(key, objectToPlain[eobjs[i]]);
      } else {
        // If instead of an object it is an array, as many key / value will be created as there are items in the array, including the position of the value in the key:
        if (Array.isArray(objectToPlain[eobjs[i]])) {
          const arrValues = objectToPlain[eobjs[i]];
          const arrLength = arrValues.length;
          for (let z = 0; z < arrLength; z++) {
            // In case the array has objects:
            if (arrValues[z] && typeof arrValues[z] === 'object' && arrValues[z].constructor === Object) {
              // Call to the sub-function, including the position of the array in the key:
              _iterateObject(key + separator + z, arrValues[z]);
            } else {
              // If it is not an object, we include in res the value in the key with the position of the array:
              res[key + separator + z] = arrValues[z];
            }
          }
        } else {
          // If it is neither object nor array, we return the value with the key:
          res[key] = objectToPlain[eobjs[i]];
        }
      }
    }
    // Returns the accumulated values in res of the entire object tree:
    return res;
  }

  applyOutputOrder(orderBy, output) {
    if (orderBy.length) {
      const orderFields = [];
      const orderFieldsOrder = [];
      orderBy.forEach(orderField => {
        const [field, order] = orderField.split(' ');
        orderFields.push(field);
        orderFieldsOrder.push(order || 'asc');
      });
      return lodash.orderBy(output, orderFields, orderFieldsOrder);
    } else {
      return output;
    }
  }

  async applyOuputFilter(filter, output) {
    if (filter instanceof Object) {
      const operator = Object.keys(filter)[0];
      let res;
      if (filter[operator] instanceof Array) {
        switch (operator) {
          case '$or':
            res = [];
            for (const conditionFilter of filter[operator]) {
              const resFilter = await this.applyOuputFilter(conditionFilter, output);
              res = lodash.uniqWith([...res, ...resFilter], lodash.isEqual);
            }
            break;
          case '$and':
            res = output;
            for (const conditionFilter of filter[operator]) {
              res = await this.applyOuputFilter(conditionFilter, res);
            }
            break;
          default:
            break;
        }
      } else {
        res = await this.applyConditionOuputFilter(filter, output);
      }
      return res;
    } else {
      throw new Error('Check output_filter, is not valid object.');
    }
  }

  regExpFromString(q) {
    let flags = q.replace(/.*\/([gimuy]*)$/, '$1');
    if (flags === q) flags = '';
    const pattern = flags ? q.replace(new RegExp('^/(.*?)/' + flags + '$'), '$1') : q;
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      return null;
    }
  }

  async applyConditionOuputFilter(condition, output) {
    const item = Object.keys(condition)[0];
    const operator = Object.keys(condition[item])[0];
    const value = await interpreter(
      condition[item][operator],
      undefined,
      undefined,
      this.runtime.config?.interpreter_max_size,
      this.runtime.config?.global_values
    );
    switch (operator) {
      case '$eq':
        return output.filter(i => i[item] == value);
      case '$match':
        return output.filter(i => typeof i[item] === 'string' && i[item].match(this.regExpFromString(value)));
      case '$lt':
        return output.filter(i => i[item] < value);
      case '$lte':
        return output.filter(i => i[item] <= value);
      case '$gt':
        return output.filter(i => i[item] > value);
      case '$gte':
        return output.filter(i => i[item] >= value);
      case '$ne':
        return output.filter(i => i[item] != value);
      case '$in':
        return output.filter(i => value.includes(i[item]));
      case '$nin':
        return output.filter(i => !value.includes(i[item]));
      default:
        return [];
    }
  }
}

module.exports = Executor;
