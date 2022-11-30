'use strict'

// custom logger class through leifLog.createLogger
const { leifLog } = require('leif-tools')

// Meta and logger for this script
const SCRIPT = {
    name: 'bathroom_exhaust_rules.js',
    logger: {
        name: 'org.openhab.leif.bathroom',
        globalLogDebugOnInfo: false,
        create: (prefix, localLogDebugOnInfo = false) => {
            return leifLog.createLogger(SCRIPT.logger.name, prefix, localLogDebugOnInfo || SCRIPT.logger.globalLogDebugOnInfo)
        },
    },
}

// global logger and import deps
const l = SCRIPT.logger.create('module')
l.i('loading openhab-js ...')
const { actions, items, osgi, rules, time, triggers } = require('openhab')

// l.i('loading runtime ...')
// const { ON } = require('@runtime')

const rulesUidPrefix = 'BathRoomExhaust'

const itemNames = {
    humidityValue: 'Sensor_CL_Bathroom_TempHumidity_SensorRelhumidity',
    humidityLastreadOut: 'BathroomExhaustFan_Relhumidity_LastReadout',
    exhaustControlDirect: 'Relay_CL_Bathroom_ExhaustFan_switch',
    exhaustControlAutoOff: 'Relay_CL_Bathroom_ExhaustFan_AutoOff_15min_switch',
    triggerEnableSwitch: 'BathroomExhaustFan_humidityTriggerEnable',
    triggerPoint: 'BathroomExhaustFan_humidityTriggerControl',
    killSwitch: 'BathroomExhaustFan_killSwitch_AutoOn_50min',
}

const RuleManager = osgi.getService('org.openhab.core.automation.RuleManager')
const ruleRegistry = osgi.getService('org.openhab.core.automation.RuleRegistry')

const rulesToCreate = {
    [`${rulesUidPrefix}TriggerEnabled`]: {
        ruleName: 'Bathroom exhaust: humidity trigger enabled/disabled',
        ruleDescription: 'Check if fan should be enabled when trigger is enabled, immediately don\'t wait for next humidity value update.',
        triggerEvents: [triggers.ItemStateChangeTrigger(itemNames.triggerEnableSwitch)],

        // log and call function from BathRoomExhaustHumidityTrigger
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'TriggerEnabled', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger
            l.d('new state is: {}', newState)
            if (newState == 'ON') {
                l.i('trigger enabled, calling function to check if fan should be enabled ...')
                rulesToCreate[`${rulesUidPrefix}HumidityTrigger`].func(null)
            } else {
                l.d('no action will be performed, trigger is not enabled.')
            }
        },
    },
    [`${rulesUidPrefix}TriggerPointChanged`]: {
      ruleName: 'Bathroom exhaust: humidity trigger point changed',
      ruleDescription: 'Check if fan should be enabled when set point changes, immediately don\'t wait for next humidity value update.',
      triggerEvents: [triggers.ItemStateChangeTrigger(itemNames.triggerPoint)],

      // log and call function from BathRoomExhaustHumidityTrigger
      func: (event) => {
          const localLogDebugOnInfo = false
          const l = SCRIPT.logger.create(rulesUidPrefix + 'TriggerPointChanged', localLogDebugOnInfo)
          l.d('received event of type: {}', event.eventType)
          const newState = event.newState // when trigger is ItemStateChangeTrigger
          l.d('new state is: {}', newState)
          rulesToCreate[`${rulesUidPrefix}HumidityTrigger`].func(null)
      },
  },
    [`${rulesUidPrefix}KillSwitchChanged`]: {
        ruleName: 'Bathroom exhaust: kill switch enabled/disabled',
        ruleDescription: 'Turn off the fan if kill switch is ON.',
        triggerEvents: [triggers.ItemStateChangeTrigger(itemNames.killSwitch)],

        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'KillSwitchChanged', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger
            l.d('new state is: {}', newState)
            if (newState == 'ON') {
                l.i('kill switch on, disabling fan ...')
                items.getItem(itemNames.exhaustControlDirect).sendCommand('OFF')
            } else {
                l.i('kill switch off, calling function to check if fan should be enabled ...')
                rulesToCreate[`${rulesUidPrefix}HumidityTrigger`].func(null)
            }
        },
    },
    [`${rulesUidPrefix}HumidityTrigger`]: {
        ruleName: 'Bathroom exhaust: humidity trigger',
        ruleDescription: 'Check if exhaust fan should be enabled based on current config and humidity.',
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.humidityValue), // when humidity changes
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // compares current setting with scheduled setting
        // if they differ and schedule is enabled, update current setting to desired value
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'HumidityTrigger', localLogDebugOnInfo)
            const _itemNames = Object.keys(itemNames)
            l.d('triggered, looking for {} item(s) ...', _itemNames.length)
            let _items = {}
            _itemNames.forEach(itemName => {
                l.d('getting item {} ...', itemName)
                _items[itemName] = items.getItem(itemNames[itemName])
                l.d('state of item {} is: {}', itemName, _items[itemName])
            })

            // update last readout time
            var date = Date.now()
            l.d('sending humidity value last update time {} to item {} ...', date, itemNames.humidityLastreadOut)
            _items.humidityLastreadOut.postUpdate(date)

            // if kill switch is not set, default to OFF
            if (_items.killSwitch.isUninitialized) {
                l.d('sending "OFF" to {}', _items.killSwitch.isUninitialized)
                _items.killSwitch.postUpdate('OFF')
            }

            if (_items.killSwitch.state == 'OFF') {
                if (_items.triggerEnableSwitch.state == 'ON') {
                    if (parseFloat(_items.humidityValue.state) >= parseFloat(_items.triggerPoint.state)) {
                        l.i('enabling fan, humidity {} is higher than the trigger point {}', _items.humidityValue.state, _items.triggerPoint.state)
                        _items.exhaustControlAutoOff.sendCommand('ON')
                    } else {
                        l.i('no action will be performed, humidity {} is lower than the trigger point {}', _items.humidityValue.state, _items.triggerPoint.state)
                    }
                } else {
                    l.i('no action will be performed, trigger on humidity is disabled.')
                }
            } else {
                l.i('no action will be performed, kill switch is on.')
            }
        },
    },
}

this.scriptLoaded = () => {
    l.i('script {} loaded.', SCRIPT.name)
    removeKnownExistingRules()
    main()
}

this.scriptUnloaded = () => {
    l.i('unloading script {} ...', SCRIPT.name)
    removeKnownExistingRules()
    l.i('script unloaded.')
}

// TODO: move to leif-tools
const ruleExists = (uid) => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('ruleExists', localLogDebugOnInfo)
    l.d('looking for rule with uid {} ...', uid)
    return !(RuleManager.getStatusInfo(uid) == null)
}

// TODO: move to leif-tools
const removeRule = (uid) => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('removeRule', localLogDebugOnInfo)
    if (ruleExists(uid)) {
        l.i('removing rule with uid {} ...', uid)
        ruleRegistry.remove(uid)
        return !ruleExists(uid)
    } else {
        return false
    }
}

// TODO: move to leif-tools
const removeKnownExistingRules = () => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('removeKnownExistingRules', localLogDebugOnInfo)
    let rules = Object.keys(rulesToCreate)
    l.d('looking for {} definition(s) ...', rules.length)
    rules.forEach((ruleUid) => {
        l.d('looking for rule {} ...', ruleUid)
        if (ruleExists(ruleUid)) removeRule(ruleUid)
    })
}

// TODO: move to leif-tools
const createRules = () => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('createRules', localLogDebugOnInfo)

    return Object.keys(rulesToCreate).map((ruleUid) => {
        let ruleDef = rulesToCreate[ruleUid]
        l.d('lets create the rule "{}"!', ruleDef.ruleName)

        l.d('ruleUid {}', ruleUid)
        l.d('ruleDescription {}', ruleDef.ruleDescription)
        l.d('triggerEvents {}', ruleDef.triggerEvents[0])
        l.d('tags {}', ['programmatically created by ' + SCRIPT.name])
        l.d('updateCurrentSettingsTextTrigger {}', ruleDef.func)

        // remove previous version of rule if exists
        if (ruleExists(ruleUid)) {
            l.i('previous version of rule exists, removing ...')
            removeRule(ruleUid)
        }

        return rules.JSRule({
            name: ruleDef.ruleName,
            description: ruleDef.ruleDescription,
            id: ruleUid,
            triggers: ruleDef.triggerEvents,
            tags: ['programmatically created by ' + SCRIPT.name],
            execute: ruleDef.func,
        })
    })
}

// "entry point", called from scriptLoaded
const main = () => {
    createRules()
}
