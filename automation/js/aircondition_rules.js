'use strict'

// custom logger class through leifLog.createLogger
const { leifLog, leifRules } = require('leif-tools')

// Meta and logger for this script
const SCRIPT = {
    name: 'aircondition_rules.js',
    tags: () => {
        return ['programmatically created by ' + SCRIPT.name]
    },
    logger: {
        name: 'org.openhab.leif.aircondition',
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

const ruleHelperLogDebugOnInfo = false
const ruleHelper = leifRules.createHelper(SCRIPT.logger.name, ruleHelperLogDebugOnInfo || SCRIPT.logger.globalLogDebugOnInfo)

// const airconditionScheduleCron = '0/10 * * * * ? *' // For debug: Every 10 seconds every day
const airconditionScheduleCron = '0 0 * * * ?' // Every hour every day - https://www.programmertools.online/generator/cron_expression.html

const airconditionCommands = {
    OFF: 'AC_OFF',
}

const rulesUidPrefix = 'LivingRoomAircondition'

const itemNames = {
    irBlaster: 'IR_GF_LivingRoom_Broadlink_RM3Mini_command',
    control: 'LivingRoomAircondition_control',
    guiString: 'LivingRoomAircondition_currentSettingString',
    scheduleSwitch: 'LivingRoomAircondition_scheduleEnable',
    schedulePrefixWeekend: 'LivingRoomAircondition_schedule_weekend_',
    schedulePrefixWeekdays: 'LivingRoomAircondition_schedule_weekdays_',
}

const RuleManager = osgi.getService('org.openhab.core.automation.RuleManager')
const ruleRegistry = osgi.getService('org.openhab.core.automation.RuleRegistry')

const rulesToCreate = {
    [`${rulesUidPrefix}UpdateProxyControlItem`]: {
        ruleName: 'Living room air condition: proxy control item',
        ruleDescription: 'When air condition control item changes send command to air condition using IR blaster',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.control),
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // send state to IR blaster item
        // not really required with proxy but gives future flexibility
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'UpdateProxyControlItem', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger
            const irItem = items.getItem(itemNames.irBlaster)
            l.i('sending command: "{}" to item {}', newState, irItem.name)
            irItem.sendCommand(newState)
        },
    },
    [`${rulesUidPrefix}UpdateCurrentSettingsText`]: {
        ruleName: 'Living room air condition: update gui text',
        ruleDescription: 'When air condition setting changes, this updates gui item with a friendly string',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.ItemStateChangeTrigger(itemNames.control),
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // parse current degree setting from control item and update gui string
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'UpdateCurrentSettingsText', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger

            // last two chars is degree setting
            let currentSettingText = newState.slice(-2) + '°C'

            // except if unit is turned off
            if (newState == airconditionCommands.OFF) {
                l.d('{} is off', itemNames.control)
                currentSettingText = 'Off'
            }
            l.i(rulesUidPrefix + 'UpdateCurrentSettingsText: updated text: {}', currentSettingText)
            items.getItem(itemNames.guiString).postUpdate(currentSettingText)
        },
    },
    [`${rulesUidPrefix}ScheduleEnabled`]: {
        ruleName: 'Living room air condition: schedule enabled/disabled',
        ruleDescription: 'Set desired air condition setting when schedule is enabled, immediately dont wait for next cron trigger.',
        tags: SCRIPT.tags(),
        triggerEvents: [triggers.ItemStateChangeTrigger(itemNames.scheduleSwitch)],

        // log and call function from LivingRoomAirconditionScheduleRunner
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'ScheduleEnabled', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger
            if (newState == 'ON') {
                l.i('schedule enabled, updating aircondition with desired setting ...')
                rulesToCreate[`${rulesUidPrefix}ScheduleRunner`].func(null)
            } else {
                l.d('no action will be performed, schedule is not enabled.')
            }
        },
    },
    [`${rulesUidPrefix}ScheduleRunner`]: {
        ruleName: 'Living room air condition: schedule',
        ruleDescription: 'Each hour this checks if air condition setting should be changed and changes it as needed.',
        tags: SCRIPT.tags(),
        triggerEvents: [
            triggers.GenericCronTrigger(airconditionScheduleCron),
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // compares current air condition setting with scheduled setting
        // if they differ and schedule is enabled, update current setting to desired value
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'ScheduleRunner', localLogDebugOnInfo)
            l.i('triggered, time is {}', time.ZonedDateTime.now().toString())

            const isWeekend = actions.Ephemeris.isWeekend()
            const isHoliday = actions.Ephemeris.isBankHoliday()
            const hourOfday = time.ZonedDateTime.now().hour().toFixed() // int

            l.d('isWeekend: {}', isWeekend)
            l.d('isHoliday: {}', isHoliday)
            l.d('hourOfday: {}', hourOfday)

            const prefix = isWeekend || isHoliday ? itemNames.schedulePrefixWeekend : itemNames.schedulePrefixWeekdays
            const hourItemName = prefix + hourOfday.toString()
            l.d('hourItemName: {}', hourItemName)

            const hourItem = items.getItem(hourItemName)
            if (!hourItem.isUninitialized) {
                const scheduleSwitchItem = items.getItem(itemNames.scheduleSwitch)
                l.d('scheduleSwitchItem.state: {}', scheduleSwitchItem.state)
                if (scheduleSwitchItem.state == 'ON') {
                    const airconditionSettingItem = items.getItem(itemNames.control)
                    l.i('current setting is "{}", desired setting is "{}".', airconditionSettingItem.state, hourItem.state)
                    if (hourItem.state != airconditionSettingItem.state) {
                        l.d('sending "{}" to {}', hourItem.state, airconditionSettingItem.name)
                        airconditionSettingItem.sendCommand(hourItem.state)
                    } else {
                        l.i('no action will be performed, air condition already at desired setting.')
                    }
                } else {
                    l.i('no action will be performed, schedule has been disabled.')
                }
            } else {
                l.i('cannot determine which setting to set as the item {} is uninitialized', hourItemName)
            }
        },
    },
}

this.scriptUnloaded = () => {
    l.i('unloading script {} ...', SCRIPT.name)
    ruleHelper.removeKnownExistingRules(rulesToCreate)
    l.i('script unloaded.')
}

// "entry point", called from scriptLoaded
this.scriptLoaded = () => {
    l.i('script {} loaded.', SCRIPT.name)
    ruleHelper.removeKnownExistingRules(rulesToCreate)
    ruleHelper.createRules(rulesToCreate)
}
