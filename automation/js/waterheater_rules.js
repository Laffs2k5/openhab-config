'use strict'

// custom logger class through leifLog.createLogger
const { leifLog, leifRules } = require('leif-tools')

// Meta and logger for this script
const SCRIPT = {
    name: 'waterheater_rules.js',
    tags: () => {
        return ['programmatically created by ' + SCRIPT.name]
    },
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

const ruleHelperLogDebugOnInfo = false
const ruleHelper = leifRules.createHelper(SCRIPT.logger.name, ruleHelperLogDebugOnInfo || SCRIPT.logger.globalLogDebugOnInfo)

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
        tags: SCRIPT.tags(),
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
        tags: SCRIPT.tags(),
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
