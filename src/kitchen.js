const https = require('https');
const http = require('http');
const fs = require('fs-extra');
const Waiter = require('./waiter');
const Manager = require('./manager');

class Kitchen {
    constructor(options) {
        this.wsDir = options.wsDir;
        this.tempDir = this.wsDir + 'temp/';
        this.chefServers = options.appChefServers;
        this.appChef = options.appChef;
        this.appChefKey = options.appChefKey;
        this.targetPlatforms = options.platforms;
        this.lockFile = this.wsDir + `../${this.targetPlatforms}.fetch.lock`;
        this.orderPullInterval = options.orderPullInterval;
        this.appChefHttp = this.appChef.startsWith('https') ? https : http;
        fs.mkdirSync(this.tempDir, {
            recursive: true
        });
        this.waiter = new Waiter(this);
        this.manager = new Manager(this, options.maxNoOfParallelBuilds);
    }
}

module.exports = Kitchen;
