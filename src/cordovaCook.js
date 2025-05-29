const command = require('@wavemaker/wm-cordova-cli/src/command');
const logger = require('@wavemaker/wm-cordova-cli/src/logger');
const semver = require('semver');

const loggerLabel = 'CordovaCook';

class CordovaCook {

    constructor(kitchen) {
        this.kitchen = kitchen;
    }

    setEnvironment(cordovaVersion, cordovaAndroidVersion, cordovaIosVersion) {
        if (cordovaAndroidVersion) {
            if (semver.gte(cordovaAndroidVersion, '13.0.0') && process.env.JAVA_17_HOME) {
                process.env.JAVA_HOME = process.env.JAVA_17_HOME;
                process.env.PATH = process.env.JAVA_HOME + ':' + process.env.PATH;
            } else if (semver.gte(cordovaAndroidVersion, '11.0.0') && process.env.JAVA_11_HOME) {
                process.env.JAVA_HOME = process.env.JAVA_11_HOME;
                process.env.PATH = process.env.JAVA_HOME + ':' + process.env.PATH;
            } else if (process.env.JAVA_8_HOME) {
                process.env.JAVA_HOME = process.env.JAVA_8_HOME;
            }
        }
    }

    async doWork(chefserver, buildTaskToken, settings, buildFolder) {
        const start = Date.now();
        logger.info({
            label: loggerLabel,
            message: "build is about to start in the next milliseconds."
        });
        const buildType = settings.buildType === 'production' ? 'release' : 'debug';
        this.setEnvironment(
            settings.cordovaVersion,
            settings.cordovaAndroidVersion,
            settings.cordovaIosVersion
        );
        let result = {};
        try {
            if (settings.platform === 'ios') {
                result = await command.build({
                    platform: settings.platform,
                    src: `${buildFolder}src/`,
                    dest: `${buildFolder}build/`,
                    iCertificate: buildFolder + settings.codesign.certificate,
                    iCertificatePassword: settings.codesign.unlockPassword,
                    iProvisioningFile: buildFolder + settings.codesign.provisioningProfile,
                    buildType: buildType,
                    packageType: settings.packageType,
                    cordovaVersion: settings.cordovaVersion,
                    cordovaIosVersion: settings.cordovaIosVersion,
                    allowHooks: true
                });
            } else if (settings.platform === 'android') {
                result = await command.build({
                    platform: settings.platform,
                    src: `${buildFolder}src/`,
                    dest: `${buildFolder}build/`,
                    aKeyStore: settings.codesign.keyStore ? buildFolder + settings.codesign.keyStore : null,
                    aStorePassword: settings.codesign.storePassword,
                    aKeyAlias: settings.codesign.keyAlias,
                    aKeyPassword: settings.codesign.keyPassword,
                    buildType: buildType,
                    packageType: settings.packageType,
                    cordovaVersion: settings.cordovaVersion,
                    cordovaAndroidVersion: settings.cordovaAndroidVersion,
                    androidXMigrationEnabled: true,
                    allowHooks: true
                });
            }
            ;
        } catch (e) {
            logger.error({
                label: loggerLabel,
                message: "build failed."
            });
            console.error(e);
        }
        logger.info({
            label: loggerLabel,
            message: `Build took ${(Date.now() - start) / 1000}s`
        });
        await this.kitchen.waiter.serve(result && result.success, chefserver, buildTaskToken, buildFolder, settings);
    }
}

module.exports = CordovaCook;
