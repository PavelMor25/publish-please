'use strict';

module.exports.arg = function(input) {
    return {
        is: (predicate) => {
            return predicate(input);
        },
    };
};

module.exports.npmCommand = function(args) {
    return {
        hasCommand: (command) => {
            return args['npm_command'] === command;
        },
        hasArg: (arg) => {
            return args[`npm_config_${arg}`] === 'true';
        },
    };
};
