const CordovaCook = require('./cordovaCook');
const ReactnativeCook = require('./reactnativeCook');
const logger = require('@wavemaker/wm-cordova-cli/src/logger');
const fs = require('fs');
const fs_extra = require('fs-extra');


const loggerLabel = 'Manager';

class Manager {
    constructor(kitchen) {
        this.kitchen = kitchen;
        this.ownsLock = false;
    }

    async manage(maxAllowedTime) {
        {
            console.log("chef servers",this.kitchen.chefServers);
            for (const chefServer of this.kitchen.chefServers) {
                console.log("chef server", chefServer);
                try {
                    if (!this.ownsLock && fs.existsSync(this.kitchen.lockFile)) {
                        process.exit();
                    }
                    this.ownsLock = true;
                    fs.writeFileSync(this.kitchen.lockFile, 'locked');
                    const orderId = await this.kitchen.waiter.takeOrderFromAppChef(chefServer);
                    fs.unlinkSync(this.kitchen.lockFile);
                    this.ownsLock = false;
                    if (!orderId) {
                        logger.info({label: loggerLabel, message: "No Work !!!"});
                        continue;
                    }
                    this.checkIfSettingsFileExists(orderId)
                    await this.processOrder(chefServer, orderId, maxAllowedTime);
                    logger.info({label: loggerLabel, message: "Work is completed."});
                } catch (error) {
                    logger.error({
                        label: loggerLabel,
                        message: `Failed: ${error.message}`
                    });
                } finally {
                    if (this.ownsLock && fs.existsSync(this.kitchen.lockFile)) {
                        fs.unlinkSync(this.kitchen.lockFile);
                        this.ownsLock = false;
                    }

                }
            }
            logger.info({
                label: loggerLabel,
                message: `Will check again in ${this.kitchen.orderPullInterval}ms`
            });
            process.exit();
        }
    }

    async process() {
        const orderId = await this.kitchen.waiter.takeOrder();
        await this.processOrder(orderId);
    }

    checkIfSettingsFileExists(orderId){
        const buildFolder = `${this.kitchen.wsDir}${orderId}/`;
        const settingsFile = buildFolder + '_br/settings.json';
        let existsSettings = fs.existsSync(settingsFile);
        logger.info({
            label: loggerLabel,
            message: `Settings file ${settingsFile} exists : ${existsSettings}`
        });
        if (existsSettings){
            const rawData = fs.readFileSync(settingsFile, 'utf-8');
            const settings = JSON.parse(rawData);
            logger.info({
                label: loggerLabel,
                message: `Content of settings file ${settingsFile} : ${settings}`
            });
        }
    }

    async processOrder(chefserver, orderId, maxAllowedTime) {
        const buildFolder = `${this.kitchen.wsDir}${orderId}/`;
        const settingsFile = buildFolder + '_br/settings.json';
        this.checkIfSettingsFileExists(orderId);
        const settings = require(settingsFile);
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                logger.info({
                    label: loggerLabel,
                    message: `max time ${maxAllowedTime}ms reached.`
                });
                this.kitchen.waiter.serve(false, orderId, buildFolder, settings).then(reject);
            }, maxAllowedTime || 20 * 60 * 1000);

            fs_extra.removeSync(settingsFile);
            if (settings.recipe === 'REACT_NATIVE') {
                new ReactnativeCook(this.kitchen).doWork(chefserver, orderId, settings, buildFolder).then(resolve, reject);
            } else {
                new CordovaCook(this.kitchen).doWork(chefserver, orderId, settings, buildFolder).then(resolve, reject);
            }
        });
    }
}

module.exports = Manager;
