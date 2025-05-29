#!/usr/bin/env node
const Kitchen = require('./src/kitchen');
const execa = require('execa');
const fs = require('fs-extra');
const defaulProcessGroupName = 'appchef-agent';

const args = require('yargs')
    .command('start-agents [ecosystem] [options]', 'Starts agents', yargs => {
        yargs.positional('ecosystem', {
            describe: 'path of pm2 ecosystem file',
            default: __dirname + '/ecosystem.config.js',
            type: 'string'
        });
    }, async (argv) => {
        const args = process.argv.filter(a => a.startsWith('--'));
        args.unshift('start', argv['ecosystem'], '--', `--processGroup="${defaulProcessGroupName}"`);
        await execa('pm2', args, {
            stdout: process.stdout,
            stdin: process.stdin,
            stderr: process.stderr,
            shell: true
        });
    }).command('stop-agents', 'Stop agents', {}, async (argv) => {
        await execa('pm2', ['delete', defaulProcessGroupName]);
    }).command('manage [options]', 'takes and processes orders', async yargs => {
        const argv = yargs.argv;
        argv.appChefServers= argv.appChef.split(',');
        argv.platforms.split(',').forEach(v => {
            console.log("final argv ", argv)
            argv.platforms = v;
            new Kitchen(argv).manager.manage(argv.killTimeout);
        });
    })
    .command('process [options]', 'Process build one by one', yargs => {
        const args = yargs.argv;
        return new Kitchen(args).manager.process();
    })
    .command('processBuild [options]', 'Assemble cooks to prepare builds', yargs => {
        const args = yargs.argv;
        return new Kitchen(args).manager.processOrder(args.orderId);
    })
    .option('appChef', {
        describe: 'comma separated urls of AppChef servers',
        type: 'string'
    })
    .option('appChefKey', {
        describe: 'Secret key to access AppChef.',
        type: 'string'
    }).option('platforms', {
        describe: 'comma separated platforms to target',
        type: 'string',
        default: 'android'
    }).option('opi', {
        alias: 'orderPullInterval',
        describe: 'Minimum time to rest between builds.',
        default: 5000,
        type: 'number'
    }).option('oi', {
        alias: 'orderId',
        describe: 'id of order to process',
        type: 'string'
    }).option('wsDir', {
        describe: 'directory to use for builds',
        default: require('os').homedir() + '/.app_chef/ws/',
        type: 'string'
    })
    .help('h')
    .alias('h', 'help').argv;

process.on('unhandledRejection', (reason, p) => {
    console.log("Unhandled rejection at: ", p, " reason: ", reason);
});

process.on('uncaughtException', e => {
    console.error("Uncaught Exception: ", e);
});
