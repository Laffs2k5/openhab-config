'use strict'

// custom logger class through leifLog.createLogger
const { leifLog, leifRules } = require('leif-tools')

// Meta and logger for this script
const SCRIPT = {
    name: 'laundry_room_lights_rules.js',
    tags: () => {
        return ['programmatically created by ' + SCRIPT.name]
    },
    logger: {
        name: 'org.openhab.leif.laundryroom',
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

// rkoshak ftw
l.i('loading openhab_rules_tools ...')
const { deferred, rateLimit } = require('openhab_rules_tools')

// l.i('loading runtime ...')
// const { ON } = require('@runtime')

const ruleHelperLogDebugOnInfo = false
const ruleHelper = leifRules.createHelper(SCRIPT.logger.name, ruleHelperLogDebugOnInfo || SCRIPT.logger.globalLogDebugOnInfo)

// const lightsMotionTriggerActiveCheckCron = '0/10 * * * * ? *' // For debug: Every 10 seconds every day
const lightsMotionTriggerActiveCheckCron = '0 0/5 * * * ?' // Every 5 minutes every day - https://www.programmertools.online/generator/cron_expression.html

const rulesUidPrefix = 'LaundryRoomLights'

const itemNames = {
    motionOnHour: 'LaundryRoom_Lights_MotionTrigger_startHour',
    motionOffHour: 'LaundryRoom_Lights_MotionTrigger_endHour',
    motionEnabledControl: 'LaundryRoom_Lights_MotionTrigger_control',
    motionStatus: 'LaundryRoom_Lights_MotionTrigger_config',
    motionActive: 'LaundryRoom_Lights_MotionTrigger_active',
    motionSensor1: 'Sensor_CL_LaundryRoom_SensorBinary',
    motionSensor2: 'Sensor_CL_LaundryRoom_sensor2alarmMotion',
    doorSensor: 'Sensor_CL_LaundryRoom_Door_Sensor_state',

    autoOffControl: 'LaundryRoom_Lights_AutoOff_control',
    autoOffTime: 'LaundryRoom_Lights_AutoOff_setTime',
    autoOffStatus: 'LaundryRoom_Lights_AutoOff_setTime_config',

    lightsSwitch: 'Relay_CL_LaundryRoom_MainLights_switch', // use this to actually turn on/off
    lightsSwitchSensor: 'Relay_CL_LaundryRoom_switchBinary1', // triggers on UI update and physical click on switch
}

const autoOffCommands = {
    NOCHANGE: -1, // indicates "no change needed"
    DISABLE: 0, // indicates to deactivate auto off functionality
    START: 1, // indicates start/restart auto off timer
}

const RuleManager = osgi.getService('org.openhab.core.automation.RuleManager')
const ruleRegistry = osgi.getService('org.openhab.core.automation.RuleRegistry')

const rulesToCreate = {
    [`${rulesUidPrefix}ActiveCheckTrigger`]: {
        ruleName: 'Laundry room lights: motion trigger active check trigger',
        ruleDescription: 'Check if laundry room lights motion trigger should be enabled based on current config and time of day.',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.motionEnabledControl), // when user changes config
            triggers.ItemStateChangeTrigger(itemNames.motionOnHour), // when user changes config
            triggers.ItemStateChangeTrigger(itemNames.motionOffHour), // when user changes config
            triggers.GenericCronTrigger(lightsMotionTriggerActiveCheckCron), // on a schedule
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // updates virtual item with to ON/OFF depending on time of day and user config
        // updates UI item text
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'ActiveCheckTrigger', localLogDebugOnInfo)

            // resolve all configured items
            const _itemNames = Object.keys(itemNames)
            l.d('triggered, looking for {} item(s) ...', _itemNames.length)
            let _items = {}
            _itemNames.forEach((itemName) => {
                l.d('getting item {} ...', itemName)
                _items[itemName] = items.getItem(itemNames[itemName])
                l.d('state of item {} is: {}', itemName, _items[itemName].state)
            })

            const hourOfday = time.ZonedDateTime.now().hour().toFixed() // int
            const onHour = Number(_items.motionOnHour.state) // int
            const offHour = Number(_items.motionOffHour.state) // int
            l.d('hourOfday: {}', hourOfday)
            l.d('onHour: {}', onHour)
            l.d('offHour: {}', offHour)

            // note: onHour = offHour means always on
            let triggerActive = 'OFF'
            if (_items.motionEnabledControl.state == 'ON' && (onHour === offHour || (hourOfday >= onHour && hourOfday < offHour))) {
                triggerActive = 'ON'
            }
            if (_items.motionActive.state != triggerActive) {
                l.i('Changing motion trigger active from {} to {} ...', _items.motionActive.state, triggerActive)
                _items.motionActive.sendCommand(triggerActive)
            }

            // update UI item
            const statusText = 'ON ' + (onHour === offHour ? 'always' : 'from ' + onHour.toString().padStart(2, '0') + ' to ' + offHour.toString().padStart(2, '0'))
            if (_items.motionStatus.state != statusText) {
                l.i('Changing motion UI text from {} to {} ...', _items.motionStatus.state, statusText)
                _items.motionStatus.postUpdate(statusText)
            }
        },
    },
    [`${rulesUidPrefix}AutoOffControlUpdate`]: {
        ruleName: 'Laundry room lights: auto off control item received update',
        ruleDescription: 'When user clicks sitemap, update config and reset UI item.',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.autoOffControl), // when user clicks i UI
        ],

        // updates virtual item with configured auto off timeout
        // reset UI item
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'AutoOffControlUpdate', localLogDebugOnInfo)

            // resolve items
            const controlItem = items.getItem(itemNames.autoOffControl)
            const timeItem = items.getItem(itemNames.autoOffTime)
            l.d('controlItem state: {}', controlItem.state)
            l.d('timeItem state: {}', timeItem.state)

            // the received "command"
            const controlValue = Number(controlItem.state)
            l.d('controlValue: {}', controlValue)

            // act on received "command"
            if (controlValue != autoOffCommands.NOCHANGE) {
                // Determine new set time
                // Failsafe default to timer off in case of problems
                let setTimeValue = 0
                if (timeItem.state == 'NULL' || timeItem.state == 'UNDEF') {
                    l.w('Item "{}" has state NULL or UNDEF, default set time {} will be used!', timeItem.name, setTimeValue)
                } else {
                    setTimeValue = Number(timeItem.state) // int
                }
                l.d('Current set time value is {}', setTimeValue)

                let newSetTime = Math.max(0, setTimeValue + controlValue) // never negative
                if (controlValue == autoOffCommands.START) {
                    newSetTime = setTimeValue // no change, just start/restart auto off timer
                } else if (controlValue == autoOffCommands.DISABLE) {
                    newSetTime = 0 // 0 will result in termination of auto off timer
                }
                l.d('New set time value is {}', newSetTime)

                // Apply new set time
                timeItem.postUpdate(newSetTime)

                // To prevent the UI showing button in "pressed" state
                controlItem.postUpdate(autoOffCommands.NOCHANGE)
            }
        },
    },
    [`${rulesUidPrefix}AutoOffTimeUpdate`]: {
        ruleName: 'Laundry room lights: auto off configured time update',
        ruleDescription: 'When configured time for auto off receives an update.',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.autoOffTime),
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // updates virtual item with configured auto off timeout
        // start/stop auto off timer
        // reset UI item
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'AutoOffTimeUpdate', localLogDebugOnInfo)

            // resolve items
            const timeItem = items.getItem(itemNames.autoOffTime)
            const statusItem = items.getItem(itemNames.autoOffStatus)
            const lightsItem = items.getItem(itemNames.lightsSwitchSensor)
            l.d('timeItem state: {}', timeItem.state)
            l.d('statusItem state: {}', statusItem.state)
            l.d('lightsItem state: {}', lightsItem.state)

            // the configured time, in minutes
            const autoOffMinutes = Number(timeItem.state)
            l.d('autoOffMinutes: {}', autoOffMinutes)

            let statusText = 'OFF'
            if (autoOffMinutes < 1) {
                l.i('Auto off time is {} minutes, cancelling auto off timer if it exists.', autoOffMinutes)
                autoOffTimerStop()
            } else {
                l.i('Auto off time updated to {} minutes.', autoOffMinutes)
                if (lightsItem.state == 'ON') {
                    l.d('Lights are on, (re-)starting auto off timer ...', autoOffMinutes)
                    // autoOffTimerStart()
                    autoOffTimerStartRateLimited()
                }
                statusText = autoOffMinutes.toString() + ' min'
            }

            l.d('Auto off UI text is: {}', statusText)
            statusItem.postUpdate(statusText)
        },
    },
    [`${rulesUidPrefix}LightSwitchOn`]: {
        ruleName: 'Laundry room lights: switch received update ON',
        ruleDescription: 'When lights are turned on (manual and by motion), (re-)start auto off timer as needed.',
        tags: SCRIPT.tags(),
        triggerEvents: [triggers.ItemStateUpdateTrigger(itemNames.lightsSwitchSensor, 'ON')],

        // if auto off is enabled, (re-)start auto off timer
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'LightSwitchOn', localLogDebugOnInfo)
            l.d('switch received update ON')

            // resolve items
            const timeItem = items.getItem(itemNames.autoOffTime)
            l.d('timeItem state: {}', timeItem.state)

            // the configured time, in minutes
            const autoOffMinutes = Number(timeItem.state)
            l.d('autoOffMinutes: {}', autoOffMinutes)

            if (autoOffMinutes < 1) {
                l.d('Cancelling auto off timer ...')
                autoOffTimerStop()
            } else {
                l.d('(re-)starting auto off timer ...')
                // autoOffTimerStart()
                autoOffTimerStartRateLimited()
            }
        },
    },
    [`${rulesUidPrefix}LightSwitchOff`]: {
        ruleName: 'Laundry room lights: switch received update OFF',
        ruleDescription: 'When lights are turned off (manual and by motion), cancel auto off timer.',
        tags: SCRIPT.tags(),
        triggerEvents: [triggers.ItemStateUpdateTrigger(itemNames.lightsSwitchSensor, 'OFF')],

        // cancel auto off timer
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'LightSwitchOff', localLogDebugOnInfo)
            l.d('switch received command OFF, cancelling auto off timer ...')
            autoOffTimerStop()
        },
    },
    [`${rulesUidPrefix}MotionDetected`]: {
        ruleName: 'Laundry room lights: motion sensor trigger',
        ruleDescription: 'When motion sensor trigger, turn lights on if motion trigger is active.',
        tags: SCRIPT.tags(),
        triggerEvents: [triggers.ItemStateUpdateTrigger(itemNames.motionSensor1, 'ON'), triggers.ItemStateUpdateTrigger(itemNames.motionSensor2, 'ON')],

        // make this as quick as possible
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'MotionDetected', localLogDebugOnInfo)
            l.d('motion detected')
            if (items.getItem(itemNames.motionActive).state == 'ON') {
                items.getItem(itemNames.lightsSwitch).sendCommand('ON')
            }

            const activeState = items.getItem(itemNames.motionActive).state
            l.d('Item that detected motion: {}', event.itemName)
            l.d('Active state was: {}', activeState)
        },
    },
    [`${rulesUidPrefix}DoorOpened`]: {
        ruleName: 'Laundry room lights: door sensor trigger',
        ruleDescription: 'When door opens, turn lights on if motion trigger is active.',
        tags: SCRIPT.tags(),
        triggerEvents: [triggers.ItemStateUpdateTrigger(itemNames.doorSensor, 'OPEN')],

        // make this as quick as possible
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'DoorOpened', localLogDebugOnInfo)
            l.d('door became open')
            if (items.getItem(itemNames.motionActive).state == 'ON') {
                items.getItem(itemNames.lightsSwitch).sendCommand('ON')
            }

            const activeState = items.getItem(itemNames.motionActive).state
            l.d('Item that detected motion: {}', event.itemName)
            l.d('Active state was: {}', activeState)
        },
    },
}

const autoOffTimerStartRateLimited = () => {
    // don't call timer start too often
    rl.run(autoOffTimerStart, 'PT30s')
}

const autoOffTimerStart = () => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('AutoOffTimerStart', localLogDebugOnInfo)
    l.d('in autoOffTimerStart, calling stop ...')
    autoOffTimerStop()
    const autoOffMinutes = Number(items.getItem(itemNames.autoOffTime).state)
    const autoOffTimeSpec = 'PT' + autoOffMinutes.toString() + 'm'
    l.d('(re-)creating timer ...)')
    l.d('autoOffMinutes: {}', autoOffMinutes)
    l.d('autoOffTimeSpec: {}', autoOffTimeSpec)
    defer.defer(itemNames.lightsSwitch, 'OFF', autoOffTimeSpec, true)
}

const autoOffTimerStop = () => {
    const localLogDebugOnInfo = false
    const l = SCRIPT.logger.create('AutoOffTimerStop', localLogDebugOnInfo)
    l.d('in autoOffTimerStop, stopping timer ...')
    defer.cancel(itemNames.lightsSwitch)
}

this.scriptUnloaded = () => {
    l.i('unloading script {} ...', SCRIPT.name)
    ruleHelper.removeKnownExistingRules(rulesToCreate)
    defer.cancelAll()
    l.i('script unloaded.')
}

// "entry point", called from scriptLoaded
this.scriptLoaded = () => {
    l.i('script {} loaded.', SCRIPT.name)
    ruleHelper.removeKnownExistingRules(rulesToCreate)
    ruleHelper.createRules(rulesToCreate)
    this.defer = new deferred.Deferred()
    this.rl = new rateLimit.RateLimit()
}
