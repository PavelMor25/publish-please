'use strict';

/* eslint-disable no-unused-vars */
const should = require('should');
const assert = require('assert');
const del = require('del');
const writeFile = require('fs').writeFileSync;
const readFile = require('fs').readFileSync;
const exec = require('cp-sugar').exec;
const packageName = require('./utils/publish-please-version-under-test');
const nodeInfos = require('../lib/utils/get-node-infos').getNodeInfosSync();
const EOL = require('os').EOL;
const lineSeparator = '----------------------------------';
const packagePath = `../${packageName.replace('@','-')}.tgz`;

/* eslint-disable max-nested-callbacks */
describe('npx integration tests with npm audit', () => {
    function colorGitOutput() {
        const gitColorCommands = [
            'git config color.branch.current blue',
            'git config color.branch.local blue',
            'git config color.branch.remote blue',
            'git config color.diff.meta blue',
            'git config color.diff.frag blue',
            'git config color.diff.old blue',
            'git config color.diff.new blue',
            'git config color.status.added blue',
            'git config color.status.changed blue',
            'git config color.status.untracked blue',
        ];

        return gitColorCommands.reduce(
            (p, c) => p.then(() => exec(c)),
            Promise.resolve()
        );
    }
    before(() => {
        const projectDir = process.cwd();
        if (projectDir.includes('testing-repo')) {
            return Promise.resolve()
                .then(() => process.chdir('..'))
                .then(() => exec('npm run package'))
                .then(() => del('testing-repo'))
                .then(() =>
                    exec(
                        'git clone https://github.com/inikulin/testing-repo.git testing-repo'
                    )
                )
                .then(() => process.chdir('testing-repo'))
                .then(() => console.log(`tests will run in ${process.cwd()}`))
                .then(() => (process.env.PUBLISH_PLEASE_TEST_MODE = 'true'));
        }

        return del('testing-repo')
            .then(() => exec('npm run package'))
            .then(() =>
                exec(
                    'git clone https://github.com/inikulin/testing-repo.git testing-repo'
                )
            )
            .then(() => process.chdir('testing-repo'))
            .then(() => console.log(`tests will run in ${process.cwd()}`))
            .then(() => (process.env.PUBLISH_PLEASE_TEST_MODE = 'true'));
    });

    after(() => delete process.env.PUBLISH_PLEASE_TEST_MODE);

    beforeEach(() =>
        colorGitOutput().then(() =>
            console.log(`${lineSeparator} begin test ${lineSeparator}`)
        ));

    afterEach(() => {
        const projectDir = process.cwd();
        if (projectDir.includes('testing-repo')) {
            return exec('git reset --hard HEAD')
                .then(() => exec('git clean -f -d'))
                .then(() =>
                    console.log(`${lineSeparator} end test ${lineSeparator}\n`)
                );
        }
        console.log('protecting publish-please project against git reset');
        return Promise.resolve().then(() => process.chdir('testing-repo'));
    });

    if (nodeInfos.npmAuditHasJsonReporter) {
        it('Should handle missing .auditignore and audit.opts files when vulnerability check is enabled in .publishrc config file', () => {
            return Promise.resolve()
                .then(() => {
                    writeFile(
                        '.publishrc',
                        JSON.stringify({
                            confirm: false,
                            validations: {
                                vulnerableDependencies: true,
                                sensitiveData: false,
                                uncommittedChanges: false,
                                untrackedFiles: false,
                                branch: 'master',
                                gitTag: false,
                            },
                            publishTag: 'latest',
                            prePublishScript:
                                'echo "running script defined in .publishrc ..."',
                            postPublishScript: false,
                        })
                    );
                })
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    pkg.dependencies = {
                        'publish-please': '2.4.1',
                    };
                    writeFile('package.json', JSON.stringify(pkg, null, 2));
                })
                .then(() => console.log(`> npx ${packageName}`))
                .then(() =>
                    exec(
                        /* prettier-ignore */
                        `npx ${packagePath} > ./publish08.log`
                    )
                )
                .catch(() => {
                    const publishLog = readFile('./publish08.log').toString();
                    console.log(publishLog);
                    return publishLog;
                })
                .then((publishLog) => {
                    /* prettier-ignore */
                    assert(publishLog.includes('Running pre-publish script'));
                    /* prettier-ignore */
                    assert(publishLog.includes('running script defined in .publishrc ...'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Running validations'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Checking for the vulnerable dependencies'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Validating branch'));
                    /* prettier-ignore */
                    assert(publishLog.includes('ERRORS'));
                    /* prettier-ignore */
                    assert(publishLog.includes('ggit -> node_modules -> lodash'));
                    /* prettier-ignore */
                    assert(publishLog.includes('https-proxy-agent'));
                    /* prettier-ignore */
                    assert(publishLog.includes('hoek'));
                    /* prettier-ignore */
                    assert(publishLog.includes('moment'));
                    /* prettier-ignore */
                    assert(publishLog.includes('boom'));
                    /* prettier-ignore */
                    assert(publishLog.includes('publish-please'));
                    /* prettier-ignore */
                    assert(publishLog.includes('wreck'));
                });
        });

        it('Should handle .auditignore and audit.opts files when vulnerability check is enabled in .publishrc config file', () => {
            return Promise.resolve()
                .then(() => {
                    writeFile(
                        '.publishrc',
                        JSON.stringify({
                            confirm: false,
                            validations: {
                                vulnerableDependencies: true,
                                sensitiveData: false,
                                uncommittedChanges: false,
                                untrackedFiles: false,
                                branch: 'master',
                                gitTag: false,
                            },
                            publishTag: 'latest',
                            prePublishScript:
                                'echo "running script defined in .publishrc ..."',
                            postPublishScript: false,
                        })
                    );
                })
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    pkg.dependencies = {
                        'publish-please': '2.4.1',
                    };
                    writeFile('package.json', JSON.stringify(pkg, null, 2));
                })
                .then(() => {
                    // will remove low and moderate vulnerabilities
                    const auditOptions = `
                        --audit-level=high
                        `;
                    writeFile('audit.opts', auditOptions);
                })
                .then(() => {
                    // will remove moment high vulnerabilities
                    const auditIgnore = [
                        'https://github.com/advisories/GHSA-wc69-rhjr-hc9g',
                        'https://github.com/advisories/GHSA-8hfj-j24r-96c4',
                    ];
                    writeFile('.auditignore', auditIgnore.join(EOL));
                })
                .then(() => console.log(`> npx ${packageName}`))
                .then(() =>
                    exec(
                        /* prettier-ignore */
                        `npx ${packagePath} > ./publish09.log`
                    )
                )
                .catch(() => {
                    const publishLog = readFile('./publish09.log').toString();
                    console.log(publishLog);
                    return publishLog;
                })
                .then((publishLog) => {
                    /* prettier-ignore */
                    assert(publishLog.includes('Running pre-publish script'));
                    /* prettier-ignore */
                    assert(publishLog.includes('running script defined in .publishrc ...'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Running validations'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Checking for the vulnerable dependencies'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Validating branch'));
                    /* prettier-ignore */
                    assert(publishLog.includes('ERRORS'));
                    /* prettier-ignore */
                    assert(publishLog.includes('https-proxy-agent'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('latest-version'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('moment-timezone'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('optimist'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('moment'));
                });
        });

        it('Should publish when --audit-level is set to critical and vulnerability check is enabled in .publishrc config file', () => {
            return Promise.resolve()
                .then(() => {
                    writeFile(
                        '.publishrc',
                        JSON.stringify({
                            confirm: false,
                            validations: {
                                vulnerableDependencies: true,
                                sensitiveData: false,
                                uncommittedChanges: false,
                                untrackedFiles: false,
                                branch: 'master',
                                gitTag: false,
                            },
                            publishTag: 'latest',
                            prePublishScript:
                                'echo "running script defined in .publishrc ..."',
                            postPublishScript: false,
                        })
                    );
                })
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    pkg.dependencies = {
                        braces: '3.0.0',
                    };
                    writeFile('package.json', JSON.stringify(pkg, null, 2));
                })
                .then(() => {
                    // will remove low+moderate+high vulnerabilities
                    const auditOptions = `
                        --audit-level=critical 
                        `;
                    writeFile('audit.opts', auditOptions);
                })
                .then(() => console.log(`> npx ${packageName}`))
                .then(() =>
                    exec(
                        /* prettier-ignore */
                        `npx ${packagePath} > ./publish10.log`
                    )
                )
                .catch(() => {
                    const publishLog = readFile('./publish10.log').toString();
                    console.log(publishLog);
                    return publishLog;
                })
                .then((publishLog) => {
                    /* prettier-ignore */
                    assert(publishLog.includes('Running pre-publish script'));
                    /* prettier-ignore */
                    assert(publishLog.includes('running script defined in .publishrc ...'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Running validations'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Checking for the vulnerable dependencies'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Validating branch'));
                    /* prettier-ignore */
                    assert(publishLog.includes('ERRORS'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('braces'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Release info'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Command `npm` exited with code'));
                });
        });

        it('Should not publish when --audit-level is set to critical and vulnerability check is enabled in .publishrc config file', () => {
            return Promise.resolve()
                .then(() => {
                    writeFile(
                        '.publishrc',
                        JSON.stringify({
                            confirm: false,
                            validations: {
                                vulnerableDependencies: true,
                                sensitiveData: false,
                                uncommittedChanges: false,
                                untrackedFiles: false,
                                branch: 'master',
                                gitTag: false,
                            },
                            publishTag: 'latest',
                            prePublishScript:
                                'echo "running script defined in .publishrc ..."',
                            postPublishScript: false,
                        })
                    );
                })
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    pkg.dependencies = {
                        'publish-please': '2.4.1',
                    };
                    writeFile('package.json', JSON.stringify(pkg, null, 2));
                })
                .then(() => {
                    // will remove low+moderate+high vulnerabilities
                    const auditOptions = `
                        --audit-level=critical 
                        `;
                    writeFile('audit.opts', auditOptions);
                })
                .then(() => console.log(`> npx ${packageName}`))
                .then(() =>
                    exec(
                        /* prettier-ignore */
                        `npx ${packagePath} > ./publish10.log`
                    )
                )
                .catch(() => {
                    const publishLog = readFile('./publish10.log').toString();
                    console.log(publishLog);
                    return publishLog;
                })
                .then((publishLog) => {
                    /* prettier-ignore */
                    assert(publishLog.includes('Running pre-publish script'));
                    /* prettier-ignore */
                    assert(publishLog.includes('running script defined in .publishrc ...'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Running validations'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Checking for the vulnerable dependencies'));
                    /* prettier-ignore */
                    assert(publishLog.includes('Validating branch'));
                    /* prettier-ignore */
                    assert(publishLog.includes('ERRORS'));
                    /* prettier-ignore */
                    assert(publishLog.includes('https-proxy-agent'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('hoek'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('moment'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('nsp'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('got'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('Release info'));
                    /* prettier-ignore */
                    assert(!publishLog.includes('Command `npm` exited with code'));
                });
        });
    }
});
