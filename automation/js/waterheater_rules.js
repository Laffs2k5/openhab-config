'use strict'

// custom logger class through leifLog.createLogger
const { leifLog } = require('leif-tools')

// Meta and logger for this script
const SCRIPT = {
    name: 'waterheater_rules.js',
    logger: {
        name: 'org.openhab.leif.waterheater',
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

// const waterheaterScheduleCron = '0/10 * * * * ? *' // For debug: Every 10 seconds every day
const waterheaterScheduleCron = '0 0 * * * ?' // Every hour every day - https://www.programmertools.online/generator/cron_expression.html

const rulesUidPrefix = 'LaundryRoomWaterHeater'

const itemNames = {
    control: 'Relay_CL_LaundryRoom_WaterHeater_switchBinary',
    scheduleSwitch: 'LaundryRoomWaterHeater_scheduleEnable',
    schedulePrefixWeekend: 'LaundryRoomWaterHeater_schedule_weekend_',
    schedulePrefixWeekdays: 'LaundryRoomWaterHeater_schedule_weekdays_',
}

const RuleManager = osgi.getService('org.openhab.core.automation.RuleManager')
const ruleRegistry = osgi.getService('org.openhab.core.automation.RuleRegistry')

const rulesToCreate = {
    [`${rulesUidPrefix}ScheduleEnabled`]: {
        ruleName: 'Laundry room water heater: schedule enabled/disabled',
        ruleDescription: 'Set desired water heater setting when schedule is enabled, immediately dont wait for next cron trigger.',
        triggerEvents: [triggers.ItemStateChangeTrigger(itemNames.scheduleSwitch)],

        // log and call function from LaundryRoomWaterHeaterScheduleRunner
        func: (event) => {
            const localLogDebugOnInfo = false
            const l = SCRIPT.logger.create(rulesUidPrefix + 'ScheduleEnabled', localLogDebugOnInfo)
            l.d('received event of type: {}', event.eventType)
            const newState = event.newState // when trigger is ItemStateChangeTrigger
            if (newState == 'ON') {
                l.i('schedule enabled, updating water heater with desired setting ...')
                rulesToCreate[`${rulesUidPrefix}ScheduleRunner`].func(null)
            } else {
                l.d('no action will be performed, schedule is not enabled.')
            }
        },
    },
    [`${rulesUidPrefix}ScheduleRunner`]: {
        ruleName: 'Laundry room water heater: schedule',
        ruleDescription: 'Each hour this checks if water heater setting should be changed and changes it as needed.',
        triggerEvents: [
            triggers.GenericCronTrigger(waterheaterScheduleCron),
            triggers.SystemStartlevelTrigger(100), // System start level - 100 - Startup is fully complete, ref. https://www.openhab.org/docs/configuration/rules-dsl.html#system-based-triggers
        ],

        // compares current setting with scheduled setting
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
                    const waterheaterSettingItem = items.getItem(itemNames.control)
                    l.i('current setting is "{}", desired setting is "{}".', waterheaterSettingItem.state, hourItem.state)
                    if (hourItem.state != waterheaterSettingItem.state) {
                        l.d('sending "{}" to {}', hourItem.state, waterheaterSettingItem.name)
                        waterheaterSettingItem.sendCommand(hourItem.state)
                    } else {
                        l.i('no action will be performed, water heater already at desired setting.')
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
