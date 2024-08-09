'use strict';

/* eslint-disable no-unused-vars */
const should = require('should');
const { mkdirp } = require('mkdirp');
const pathJoin = require('path').join;
const del = require('del');
const audit = require('../lib/utils/npm-audit');
const nodeInfos = require('../lib/utils/get-node-infos').getNodeInfosSync();
const writeFile = require('fs').writeFileSync;
const existsSync = require('fs').existsSync;
const readDir = require('fs').readdirSync;
const EOL = require('os').EOL;
const exec = require('cp-sugar').exec;

const lineSeparator = '----------------------------------';

if (nodeInfos.npmAuditHasJsonReporter) {
    describe('npm audit analyzer when npm is >= 6.1.0', () => {
        let originalWorkingDirectory;
        let projectDir;

        before(() => {
            originalWorkingDirectory = process.cwd();
            projectDir = pathJoin(__dirname, 'tmp', 'audit02');
            mkdirp.sync(projectDir);
        });
        beforeEach(() => {
            console.log(`${lineSeparator} begin test ${lineSeparator}`);
            del.sync(pathJoin(projectDir, 'package.json'));
            del.sync(pathJoin(projectDir, 'package-lock.json'));
            del.sync(pathJoin(projectDir, '.auditignore'));
            del.sync(pathJoin(projectDir, 'audit.opts'));
        });
        afterEach(() => {
            process.chdir(originalWorkingDirectory);
            console.log(`${lineSeparator} end test ${lineSeparator}\n`);
        });

        it('Should report an error when package.json is badly formatted and there is no lock file', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: 'yo123',
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );

            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            error: {
                                code: 'EAUDITNOLOCK',
                                summary:
                                    'package.json file is missing or is badly formatted. Neither npm-shrinkwrap.json nor package-lock.json found: Cannot audit a project without a lockfile',
                                detail:
                                    'Try creating one first with: npm i --package-lock-only',
                            },
                        };
                        result.error.summary.should.containEql(
                            'package.json file is missing or is badly formatted'
                        );
                    })
            );
        });

        it('Should audit a project without a lockfile', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                scripts: {},
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 0,
                                    critical: 0,
                                },
                                dependencies: {
                                    prod: 1,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 0,
                                },
                            },
                        };
                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should remove auto-generated package-lock.json to prevent further validations to fail', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                scripts: {},
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const pakageLockFile = pathJoin(
                            projectDir,
                            'package-lock.json'
                        );
                        existsSync(pakageLockFile).should.be.false();
                    })
            );
        });

        it('Should create auto-generated log files in a temp folder to prevent further validations to fail', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {},
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const logFiles = readDir(projectDir).filter(
                            (filename) => filename.includes('.log')
                        );
                        logFiles.should.be.empty();
                    })
            );
        });

        it('Should audit a project that has no dependency', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                scripts: {},
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            const pkgLock = {
                name: 'testing-repo',
                lockfileVersion: 1,
            };
            writeFile(
                pathJoin(projectDir, 'package-lock.json'),
                JSON.stringify(pkgLock, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 0,
                                    critical: 0,
                                },
                                dependencies: {
                                    prod: 1,
                                    dev: 0,
                                    optional: 0,
                                    total: 0,
                                },
                            },
                        };
                        result.should.containDeep(expected);
                        const pakageLockFile = pathJoin(
                            projectDir,
                            'package-lock.json'
                        );
                        existsSync(pakageLockFile).should.be.true();
                    })
            );
        });

        it('Should report vulnerability on ms@0.7.0 dependency ', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    ms: '0.7.0',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            auditReportVersion: 2,
                            vulnerabilities: {
                                ms: {
                                    name: 'ms',
                                    severity: 'high',
                                    isDirect: true,
                                    via: [
                                        {
                                            source: 1094419,
                                            name: 'ms',
                                            dependency: 'ms',
                                            title:
                                                'Vercel ms Inefficient Regular Expression Complexity vulnerability',
                                            url:
                                                'https://github.com/advisories/GHSA-w9mr-4mfr-499f',
                                            severity: 'moderate',
                                            cwe: ['CWE-1333'],
                                            cvss: {
                                                score: 5.3,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
                                            },
                                            range: '<2.0.0',
                                        },
                                        {
                                            source: 1098340,
                                            name: 'ms',
                                            dependency: 'ms',
                                            title:
                                                'Regular Expression Denial of Service in ms',
                                            url:
                                                'https://github.com/advisories/GHSA-3fx5-fwvr-xrjg',
                                            severity: 'high',
                                            cwe: ['CWE-400', 'CWE-1333'],
                                            cvss: {
                                                score: 7.5,
                                                vectorString:
                                                    'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H',
                                            },
                                            range: '<0.7.1',
                                        },
                                    ],
                                    effects: [],
                                    range: '<=1.0.0',
                                    nodes: ['node_modules/ms'],
                                    fixAvailable: {
                                        name: 'ms',
                                        version: '2.1.3',
                                        isSemVerMajor: true,
                                    },
                                },
                            },
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 1,
                                    critical: 0,
                                    total: 1,
                                },
                                dependencies: {
                                    prod: 2,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 1,
                                },
                            },
                        };
                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should report vulnerability on lodash < 4.17.5 as transitive dependency', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    'ban-sensitive-files': '1.9.2',
                    nsp: '3.2.1',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            vulnerabilities: {
                                lodash: {
                                    name: 'lodash',
                                    severity: 'critical',
                                    isDirect: false,
                                    via: [
                                        {
                                            source: 1085674,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Regular Expression Denial of Service (ReDoS) in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-x5rq-j2xg-h7qm',
                                            severity: 'moderate',
                                            cwe: ['CWE-400'],
                                            cvss: {
                                                score: 0,
                                                vectorString: null,
                                            },
                                            range: '<4.17.11',
                                        },
                                        {
                                            source: 1094499,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-4xc9-xhrj-v574',
                                            severity: 'high',
                                            cwe: ['CWE-400'],
                                            cvss: {
                                                score: 0,
                                                vectorString: null,
                                            },
                                            range: '<4.17.11',
                                        },
                                        {
                                            source: 1094500,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Regular Expression Denial of Service (ReDoS) in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
                                            severity: 'moderate',
                                            cwe: ['CWE-400', 'CWE-1333'],
                                            cvss: {
                                                score: 5.3,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
                                            },
                                            range: '<4.17.21',
                                        },
                                        {
                                            source: 1096305,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-p6mc-m468-83gw',
                                            severity: 'high',
                                            cwe: ['CWE-770', 'CWE-1321'],
                                            cvss: {
                                                score: 7.4,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:H',
                                            },
                                            range: '>=3.7.0 <4.17.19',
                                        },
                                        {
                                            source: 1096996,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Command Injection in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
                                            severity: 'high',
                                            cwe: ['CWE-77', 'CWE-94'],
                                            cvss: {
                                                score: 7.2,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H',
                                            },
                                            range: '<4.17.21',
                                        },
                                        {
                                            source: 1097130,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-fvqr-27wr-82fm',
                                            severity: 'moderate',
                                            cwe: ['CWE-471', 'CWE-1321'],
                                            cvss: {
                                                score: 6.5,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N',
                                            },
                                            range: '<4.17.5',
                                        },
                                        {
                                            source: 1097140,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-jf85-cpcp-j695',
                                            severity: 'critical',
                                            cwe: ['CWE-20', 'CWE-1321'],
                                            cvss: {
                                                score: 9.1,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H',
                                            },
                                            range: '<4.17.12',
                                        },
                                    ],
                                    effects: ['cli-table2', 'ggit'],
                                    range: '<=4.17.20',
                                    nodes: [
                                        'node_modules/cli-table2/node_modules/lodash',
                                        'node_modules/lodash',
                                    ],
                                    fixAvailable: {
                                        name: 'nsp',
                                        version: '2.8.1',
                                        isSemVerMajor: true,
                                    },
                                },
                            },
                        };
                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should report vulnerability on lodash@4.16.4 as direct dependency', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    lodash: '4.16.4',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            auditReportVersion: 2,
                            vulnerabilities: {
                                lodash: {
                                    name: 'lodash',
                                    severity: 'critical',
                                    isDirect: true,
                                    via: [
                                        {
                                            source: 1085674,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Regular Expression Denial of Service (ReDoS) in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-x5rq-j2xg-h7qm',
                                            severity: 'moderate',
                                            cwe: ['CWE-400'],
                                            cvss: {
                                                score: 0,
                                                vectorString: null,
                                            },
                                            range: '<4.17.11',
                                        },
                                        {
                                            source: 1094499,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-4xc9-xhrj-v574',
                                            severity: 'high',
                                            cwe: ['CWE-400'],
                                            cvss: {
                                                score: 0,
                                                vectorString: null,
                                            },
                                            range: '<4.17.11',
                                        },
                                        {
                                            source: 1094500,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Regular Expression Denial of Service (ReDoS) in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
                                            severity: 'moderate',
                                            cwe: ['CWE-400', 'CWE-1333'],
                                            cvss: {
                                                score: 5.3,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
                                            },
                                            range: '<4.17.21',
                                        },
                                        {
                                            source: 1096305,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-p6mc-m468-83gw',
                                            severity: 'high',
                                            cwe: ['CWE-770', 'CWE-1321'],
                                            cvss: {
                                                score: 7.4,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:H',
                                            },
                                            range: '>=3.7.0 <4.17.19',
                                        },
                                        {
                                            source: 1096996,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Command Injection in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
                                            severity: 'high',
                                            cwe: ['CWE-77', 'CWE-94'],
                                            cvss: {
                                                score: 7.2,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H',
                                            },
                                            range: '<4.17.21',
                                        },
                                        {
                                            source: 1097130,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-fvqr-27wr-82fm',
                                            severity: 'moderate',
                                            cwe: ['CWE-471', 'CWE-1321'],
                                            cvss: {
                                                score: 6.5,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N',
                                            },
                                            range: '<4.17.5',
                                        },
                                        {
                                            source: 1097140,
                                            name: 'lodash',
                                            dependency: 'lodash',
                                            title:
                                                'Prototype Pollution in lodash',
                                            url:
                                                'https://github.com/advisories/GHSA-jf85-cpcp-j695',
                                            severity: 'critical',
                                            cwe: ['CWE-20', 'CWE-1321'],
                                            cvss: {
                                                score: 9.1,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H',
                                            },
                                            range: '<4.17.12',
                                        },
                                    ],
                                    effects: [],
                                    range: '<=4.17.20',
                                    nodes: ['node_modules/lodash'],
                                    fixAvailable: {
                                        name: 'lodash',
                                        version: '4.17.21',
                                        isSemVerMajor: false,
                                    },
                                },
                            },
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 0,
                                    critical: 1,
                                    total: 1,
                                },
                                dependencies: {
                                    prod: 2,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 1,
                                },
                            },
                        };

                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should not report vulnerability stored in .auditignore file', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    ms: '0.7.0',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            const auditIgnore = [
                'https://github.com/advisories/GHSA-3fx5-fwvr-xrjg',
                'https://github.com/advisories/GHSA-w9mr-4mfr-499f',
            ];
            writeFile(
                pathJoin(projectDir, '.auditignore'),
                auditIgnore.join(EOL)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            auditReportVersion: 2,
                            vulnerabilities: {},
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 1,
                                    critical: 0,
                                    total: 1,
                                },
                                dependencies: {
                                    prod: 2,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 1,
                                },
                            },
                        };
                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should report vulnerability that is not stored in .auditignore file', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    ms: '0.7.0',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            const auditIgnore = [
                'https://github.com/advisories/GHSA-3fx5-fwvr-xrjg',
            ];
            writeFile(
                pathJoin(projectDir, '.auditignore'),
                auditIgnore.join(EOL)
            );
            // When
            return (
                Promise.resolve()
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            auditReportVersion: 2,
                            vulnerabilities: {
                                ms: {
                                    name: 'ms',
                                    severity: 'high',
                                    isDirect: true,
                                    via: [
                                        {
                                            source: 1094419,
                                            name: 'ms',
                                            dependency: 'ms',
                                            title:
                                                'Vercel ms Inefficient Regular Expression Complexity vulnerability',
                                            url:
                                                'https://github.com/advisories/GHSA-w9mr-4mfr-499f',
                                            severity: 'moderate',
                                            cwe: ['CWE-1333'],
                                            cvss: {
                                                score: 5.3,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
                                            },
                                            range: '<2.0.0',
                                        },
                                    ],
                                    effects: [],
                                    range: '<=1.0.0',
                                    nodes: ['node_modules/ms'],
                                    fixAvailable: {
                                        name: 'ms',
                                        version: '2.1.3',
                                        isSemVerMajor: true,
                                    },
                                },
                            },
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 1,
                                    critical: 0,
                                    total: 1,
                                },
                                dependencies: {
                                    prod: 2,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 1,
                                },
                            },
                        };

                        result.should.containDeep(expected);
                    })
            );
        });

        it('Should report vulnerability that is not stored in .auditignore file (package-lock.json exists)', () => {
            // Given
            const pkg = {
                name: 'testing-repo',
                dependencies: {
                    ms: '0.7.0',
                },
            };
            writeFile(
                pathJoin(projectDir, 'package.json'),
                JSON.stringify(pkg, null, 2)
            );
            const auditIgnore = [
                'https://github.com/advisories/GHSA-3fx5-fwvr-xrjg',
            ];
            writeFile(
                pathJoin(projectDir, '.auditignore'),
                auditIgnore.join(EOL)
            );
            return (
                Promise.resolve()
                    .then(() => process.chdir(projectDir))
                    .then(() => exec('npm i --package-lock-only'))

                    // When
                    .then(() => audit(projectDir))

                    // Then
                    .then((result) => {
                        const expected = {
                            auditReportVersion: 2,
                            vulnerabilities: {
                                ms: {
                                    name: 'ms',
                                    severity: 'high',
                                    isDirect: true,
                                    via: [
                                        {
                                            source: 1094419,
                                            name: 'ms',
                                            dependency: 'ms',
                                            title:
                                                'Vercel ms Inefficient Regular Expression Complexity vulnerability',
                                            url:
                                                'https://github.com/advisories/GHSA-w9mr-4mfr-499f',
                                            severity: 'moderate',
                                            cwe: ['CWE-1333'],
                                            cvss: {
                                                score: 5.3,
                                                vectorString:
                                                    'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L',
                                            },
                                            range: '<2.0.0',
                                        },
                                    ],
                                    effects: [],
                                    range: '<=1.0.0',
                                    nodes: ['node_modules/ms'],
                                    fixAvailable: {
                                        name: 'ms',
                                        version: '2.1.3',
                                        isSemVerMajor: true,
                                    },
                                },
                            },
                            metadata: {
                                vulnerabilities: {
                                    info: 0,
                                    low: 0,
                                    moderate: 0,
                                    high: 1,
                                    critical: 0,
                                    total: 1,
                                },
                                dependencies: {
                                    prod: 2,
                                    dev: 0,
                                    optional: 0,
                                    peer: 0,
                                    peerOptional: 0,
                                    total: 1,
                                },
                            },
                        };
                        result.should.containDeep(expected);
                    })
            );
        });
    });
}
