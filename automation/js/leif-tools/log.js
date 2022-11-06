'use strict'

class leifLogger {
    constructor(_name, _prefix, _logDebugOnInfo) {
        this._name = _name
        this._prefix = _prefix
        this._debugOnInfo = _logDebugOnInfo
        this._logger = Java.type('org.slf4j.LoggerFactory').getLogger(this._name.toString())
        // this._logger.info('Logger created with _name: {}, _prefix: {}, _debugOnInfo: {}'.toString(), _name, _prefix, _logDebugOnInfo)
    }
    e = (...args) => {
        this._logger.error(this._prefix + ': ' + args[0], ...args.slice(1))
    }
    w = (...args) => {
        this._logger.warn(this._prefix + ': ' + args[0], ...args.slice(1))
    }
    i = (...args) => {
        this._logger.info(this._prefix + ': ' + args[0], ...args.slice(1))
    }
    d = (...args) => {
        if (this._debugOnInfo) {
            this.i(...args)
        } else {
            this._logger.debug(this._prefix + ': ' + args[0], ...args.slice(1))
        }
    }
}

createLogger = (_name, _prefix, _logDebugOnInfo) => {
    return new leifLogger(_name, _prefix, _logDebugOnInfo)
}

module.exports = { createLogger }
