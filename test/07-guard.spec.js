'use strict';

/* eslint-disable no-unused-vars */
const should = require('should');
const guard = require('../lib/guard');
const envType = require('../lib/reporters/env-type');
const lineSeparator = '----------------------------------';

describe('Guard Execution', () => {
    let originalEnv;
    let nativeExit;
    let nativeConsoleLog;
    let exitCode;
    let output;

    beforeEach(() => {
        originalEnv = Object.assign({}, process.env);
        console.log(`${lineSeparator} begin test ${lineSeparator}`);
        process.argv = [];
        exitCode = undefined;
        output = '';
        nativeExit = process.exit;
        nativeConsoleLog = console.log;
        process.exit = (val) => {
            // nativeConsoleLog(val);
            if (exitCode === undefined) exitCode = val;
        };
        console.log = (p1, p2) => {
            p2 === undefined ? nativeConsoleLog(p1) : nativeConsoleLog(p1, p2);
            output = output + p1;
        };
    });
    afterEach(() => {
        process.exit = nativeExit;
        console.log = nativeConsoleLog;
        console.log(`${lineSeparator} end test ${lineSeparator}\n`);
        process.env = Object.assign({}, originalEnv);
    });

    it('Should return an error message (elegant status reporter) on `npm publish`', () => {
        // Given
        process.env['npm_command'] = 'publish';
        // When
        guard(process.env);
        // Then
        exitCode.should.be.equal(1);
        output.should.containEql("'npm publish' is forbidden for this package");
        if (
            typeof process.env.APPVEYOR === 'undefined' &&
            envType.isCI() === false
        ) {
            output.should.containEql('\u001b[31m\u001b[39m');
        }
    });

    it('Should return an error message (CI reporter) on `npm publish --ci`', () => {
        // Given
        process.env['npm_command'] = 'publish';
        process.env['npm_config_ci'] = 'true';
        // When
        guard(process.env);
        // Then
        exitCode.should.be.equal(1);
        output.should.containEql("'npm publish' is forbidden for this package");
        output.should.not.containEql('\u001b');
        output.should.not.containEql('[31m');
        output.should.not.containEql('[39m');
        output.should.not.containEql('[41m');
        output.should.not.containEql('[49m');
    });

    it('Should not return an error message on `npm publish --with-publish-please`', () => {
        // Given
        process.env['npm_command'] = 'publish';
        process.env['npm_config_with_publish_please'] = 'true';
        // When
        guard(process.env);
        // Then
        exitCode.should.be.equal(0);
        output.should.not.containEql(
            "'npm publish' is forbidden for this package"
        );
    });
});
