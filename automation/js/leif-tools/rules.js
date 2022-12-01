'use strict'

const leifLog = require('./log')

class leifHelpers {
    constructor(_loggerName, _logDebugOnInfo) {
        this._loggerName = _loggerName + '.leifHelpers'
        this._logDebugOnInfo = _logDebugOnInfo
        var _l = leifLog.createLogger(this._loggerName, 'constructor', this._logDebugOnInfo)
        _l.d('Helper class created, _logDebugOnInfo is {}', _logDebugOnInfo)
    }
    ruleExists = (_ruleUid) => {
        const _l = leifLog.createLogger(this._loggerName, 'ruleExists', this._logDebugOnInfo)
        _l.d('looking for rule with uid {} ...', _ruleUid)
        const _exists = !(RuleManager.getStatusInfo(_ruleUid) == null)
        _l.d('rule with uid {} exists = {}', _ruleUid, _exists)
        return _exists
    }
    removeRule = (_ruleUid) => {
        const _l = leifLog.createLogger(this._loggerName, 'removeRule', this._logDebugOnInfo)

        if (this.ruleExists(_ruleUid)) {
            _l.d('removing rule with uid {} ...', _ruleUid)
            ruleRegistry.remove(_ruleUid)
            return !this.ruleExists(_ruleUid)
        } else {
            return false
        }
    }
    removeKnownExistingRules = (_rulesToCreate) => {
        const _l = leifLog.createLogger(this._loggerName, 'removeKnownExistingRules', this._logDebugOnInfo)
        const _rules = Object.keys(_rulesToCreate)
        _l.d('looking for {} definition(s) ...', _rules.length)
        _rules.forEach((_ruleUid) => {
            _l.d('looking for rule {} ...', _ruleUid)
            if (this.ruleExists(_ruleUid)) this.removeRule(_ruleUid)
        })
    }
    createRules = (_rulesToCreate) => {
        const _l = leifLog.createLogger(this._loggerName, 'createRules', this._logDebugOnInfo)

        return Object.keys(_rulesToCreate).map((_ruleUid) => {
            const _ruleDef = _rulesToCreate[_ruleUid]
            _l.d('lets create the rule "{}"!', _ruleDef.ruleName)

            _l.d('ruleUid {}', _ruleUid)
            _l.d('ruleDescription {}', _ruleDef.ruleDescription)
            _l.d('triggerEvents count {}', _ruleDef.triggerEvents.length)
            _l.d('tags {}', _ruleDef.tags)

            // remove previous version of rule if exists
            if (this.ruleExists(_ruleUid)) {
                _l.d('previous version of rule exists, removing ...')
                this.removeRule(_ruleUid)
            }

            return rules.JSRule({
                name: _ruleDef.ruleName,
                description: _ruleDef.ruleDescription,
                id: _ruleUid,
                triggers: _ruleDef.triggerEvents,
                tags: _ruleDef.tags,
                execute: _ruleDef.func,
            })
        })
    }
}

createHelper = (_loggerName, _logDebugOnInfo) => {
    return new leifHelpers(_loggerName, _logDebugOnInfo)
}

module.exports = { createHelper }
