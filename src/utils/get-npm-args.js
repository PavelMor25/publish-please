'use strict';
const npmCommand = require('./fluent-syntax').npmCommand;

// NOTE: the following code was partially adopted from https://github.com/iarna/in-publish
module.exports = function getNpmArgs(processEnv) {
    const npmArgs = {};
    try {
        npmArgs.install = npmCommand(processEnv).hasCommand('install');
        npmArgs.publish = npmCommand(processEnv).hasCommand('publish');
        npmArgs.runScript = npmCommand(processEnv).hasCommand('run-script');
        npmArgs['--save-dev'] = npmCommand(processEnv).hasArg('save_dev');
        npmArgs['--save'] = npmCommand(processEnv).hasArg('save');
        npmArgs['--global'] = npmCommand(processEnv).hasArg('global');
        npmArgs['--dry-run'] = npmCommand(processEnv).hasArg('dry_run');
        npmArgs['--ci'] = npmCommand(processEnv).hasArg('ci');
        npmArgs['config'] = npmCommand(processEnv).hasArg('config');
        npmArgs.npx = npmCommand(processEnv).hasCommand('exec');
        // prettier-ignore
        npmArgs['--with-publish-please'] = npmCommand(processEnv).hasArg('with_publish_please');
    } catch (err) {
        return {};
    }

    return npmArgs;
};
