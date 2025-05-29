const fs = require('fs-extra');
const logger = require('@wavemaker/wm-cordova-cli/src/logger');
const {
    findFile
} = require('@wavemaker/wm-cordova-cli/src/utils');
const FormData = require('form-data');
const execa = require('execa');
const axios = require('axios');
const loggerLabel = 'Waiter';
const MAX_FILE_SIZE_FOR_UPLOAD = 500 * 1024 * 1024;
const MAX_REQUEST_ALLOWED_TIME = 3 * 60 * 1000;
const path = require('path');

const canUploadFile = (path) => {
    const stats = fs.statSync(path);
    return !!(stats && stats['size'] && stats['size'] < MAX_FILE_SIZE_FOR_UPLOAD);
};

class Waiter {
    constructor(kitchen) {
        this.kitchen = kitchen;
    }

    /**
     * Sometimes, downloaded zip is not getting decompressed.
     * This is observerd on Apple Silicon Mac Pro systems.
     */
    downloadOrder(url, dest) {
        const tempFile = this.kitchen.tempDir + `mobile_${Date.now()}.zip`;
        return axios.get(url, {
            timeout: MAX_REQUEST_ALLOWED_TIME,
            responseType: 'stream'
        }).then(res => {
            return new Promise((resolve, reject) => {
                const fw = fs.createWriteStream(tempFile);
                res.data.pipe(fw);
                fw.on('error', err => {
                    reject(err);
                    fw.close();
                });
                fw.on('close', resolve);
            });
        }).then(() => {
            fs.emptyDirSync(dest);
            fs.mkdirSync(dest + "src", {
                recursive: true
            });
            logger.info({
                label: loggerLabel,
                message: "Work is found and required input is gonna be at " + dest
            });
            return execa('unzip', [
                '-o',
                tempFile,
                '-d',
                dest + 'src'
            ]);
        }).then(() => {
            fs.removeSync(tempFile);
            logger.info({
                label: loggerLabel,
                message: "unzipped the zip file at " + tempFile
            });
            fs.mkdirsSync(dest + '_br');
            fs.renameSync(dest + 'src/_br', dest + '_br');
        });
    }

    takeOrderFromAppChef(appChefUrl) {
        let url = `${appChefUrl}services/chef/assignWork?`
        url += `platforms=${this.kitchen.targetPlatforms}&key=${this.kitchen.appChefKey}`;
        logger.info({
            label: loggerLabel,
            message: `Invoking url to take order ${url}`
        });
        return axios.get(url, {
            responseType: 'json'
        }).then(res => {
            if (res.data.taskToken) {
                return this.downloadOrder(
                    res.data.zipUrl,
                    `${this.kitchen.wsDir}${res.data.taskToken}/`,
                    5).then(() => res.data.taskToken);
            }
        }, (err) => {
            logger.error({
                label: loggerLabel,
                message: `error while taking order from appchef ${appChefUrl} error: ${err.message}`
            });
        });
    }

    async serve(success, chefserver, buildTaskToken, buildFolder, settings) {
        success = !!success;
        const platform = settings.platform;
        const buildData = {};
        return Promise.resolve()
            .then(() => {
                let artifact = null;
                if (success && platform == "ios") {
                    artifact = findFile(buildFolder + "build/output/" + platform, /\.ipa?/);
                }
                if (success && platform == "android") {
                    artifact = findFile(buildFolder + "build/output/" + platform, /(\.apk?|\.aab?)/);
                }
                if (artifact) {
                    if (canUploadFile(artifact)) {
                        buildData['outputName'] = path.basename(artifact);
                        if (settings.upload && settings.upload.to === 's3') {
                            const params = settings.upload;
                            buildData['outputAt'] = params.key;
                            return axios.put(params.uploadUrl, fs.readFileSync(artifact), {
                                headers: {
                                    'Content-Type': 'application/octet-stream'
                                },
                                timeout: MAX_REQUEST_ALLOWED_TIME,
                                maxContentLength: Infinity,
                                maxBodyLength: Infinity
                            });
                        } else {
                            form.append("output", fs.createReadStream(artifact));
                        }
                    } else {
                        logger.error({
                            label: loggerLabel,
                            message: "Could not upload the archive as maximum size that can be uploaded is  " + (MAX_FILE_SIZE_FOR_UPLOAD / (1024 * 1024)) + " MB."
                        });
                        success = false;
                    }
                }
            }).then(() => {
                buildData['buildFolder'] = buildFolder;
                buildData['buildTaskToken'] = buildTaskToken;
                buildData['success'] = success;
                return this.upload(chefserver, buildData, 5);
            }).then(() => {
                logger.info({
                    label: loggerLabel,
                    message: "successfully served the order."
                });
            }).catch((msg) => {
                logger.error({
                    label: loggerLabel,
                    message: "failed to serve the order with response as follows : " + msg
                });
            }).then(() => {
                fs.removeSync(buildFolder);
            });
    }

    upload(chefserver, data, retryCount) {
        const buildLog = findFile(data.buildFolder + "build/output/logs/", /build.log?/);
        const form = new FormData();
        data.outputName && form.append('outputName', data.outputName);
        data.outputAt && form.append('outputAt', data.outputAt);
        form.append("log", fs.createReadStream(buildLog));
        form.append("success", "" + data.success);
        form.append("token", data.buildTaskToken);
        form.append("key", this.kitchen.appChefKey);
        return axios.post(`${chefserver}services/chef/onBuildFinish`, form, {
            headers: form.getHeaders(),
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }).catch((msg) => {
            if (retryCount) {
                logger.error({
                    label: loggerLabel,
                    message: "failed to serve the order. Trying for another time."
                });
                return new Promise((res, rej) => {
                    setTimeout(() => {
                        this.upload(data, --retryCount).then(res, rej);
                    }, 30000);
                });
            } else {
                return Promise.reject(msg);
            }
        });
    }
}

module.exports = Waiter;
