'use strict';

/* eslint-disable no-unused-vars */
const should = require('should');

const assert = require('assert');
const EOL = require('os').EOL;
const del = require('del');
const writeFile = require('fs').writeFileSync;
const readFile = require('fs').readFileSync;
const sep = require('path').sep;
const defaults = require('lodash/defaultsDeep');
const unset = require('lodash/unset');
const exec = require('cp-sugar').exec;
const readPkg = require('../lib/utils/read-package-json').readPkgSync;
const { mkdirp } = require('mkdirp');
const chalk = require('chalk');
const requireUncached = require('import-fresh');
const nodeInfos = require('../lib/utils/get-node-infos').getNodeInfosSync();
const shouldUsePrePublishOnlyScript = nodeInfos.shouldUsePrePublishOnlyScript;
const envType = require('../lib/reporters/env-type');
const lineSeparator = '----------------------------------';

/* eslint-disable max-nested-callbacks */
describe('Integration tests', () => {
    // NOTE: mocking confirm function
    let mockConfirm = () => {};

    require('../lib/utils/inquires').confirm = (...args) =>
        mockConfirm(...args);

    const prepublishKey = shouldUsePrePublishOnlyScript
        ? 'prepublishOnly'
        : 'prepublish';

    // NOTE: loading tested code
    const publish = requireUncached('../lib/publish/publish-workflow');
    const getOptions = require('../lib/publish-options').getOptions;
    const echoPublishCommand = 'echo "npm publish"';

    function getTestOptions(settings) {
        const disabled = {
            validations: {
                sensitiveData: false,
                uncommittedChanges: false,
                untrackedFiles: false,
                gitTag: false,
                branch: false,
                vulnerableDependencies: false,
            },

            confirm: false,
            publishTag: null,
            prePublishScript: null,
            postPublishScript: null,
        };

        if (settings && settings.remove) unset(disabled, settings.remove);

        return defaults({}, settings && settings.set, disabled);
    }

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
        return del('testing-repo')
            .then(() =>
                exec(
                    'git clone https://github.com/inikulin/testing-repo.git testing-repo'
                )
            )
            .then(() => process.chdir('testing-repo'))
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

    describe('package.json', () => {
        it('Should validate package.json existence', () =>
            exec('git checkout no-package-json')
                .then(() => publish(getTestOptions()))
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "package.json file doesn't exist."
                    )
                ));
    });

    describe('.publishrc', () => {
        it('Should use options from .publishrc file', () => {
            writeFile(
                '.publishrc',
                JSON.stringify({
                    confirm: false,
                    validations: {
                        sensitiveData: false,
                        uncommittedChanges: true,
                        untrackedFiles: true,
                    },
                })
            );

            const opts = getOptions({
                validations: {
                    uncommittedChanges: false,
                    sensitiveData: false,
                    untrackedFiles: false,
                },
            });

            assert(!opts.confirm);
            assert.strictEqual(opts.prePublishScript, 'npm test');
            assert.strictEqual(opts.postPublishScript, '');
            assert.strictEqual(opts.publishCommand, 'npm publish');
            assert.strictEqual(opts.publishTag, 'latest');
            assert.strictEqual(opts.validations.branch, 'master');
            assert(!opts.validations.uncommittedChanges);
            assert(!opts.validations.untrackedFiles);
        });

        it('Should expect .publishrc to be a valid JSON file', () => {
            writeFile('.publishrc', 'yoyo123');

            try {
                getOptions();
            } catch (err) {
                assert.strictEqual(
                    err.message,
                    '.publishrc is not a valid JSON file.'
                );
            }
        });
    });

    describe('Branch validation', () => {
        it('Should expect `master` branch by default', () =>
            exec('git checkout some-branch')
                .then(() =>
                    publish(
                        getTestOptions({
                            remove: 'validations.branch',
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Expected branch to be 'master', but it was 'some-branch'."
                    )
                ));

        it('Should validate the branch set in the configuration file', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    branch: 'no-package-json',
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Expected branch to be 'no-package-json', but it was 'master'."
                    )
                ));

        it('Should validate the branch set in the configuration file via RegExp', () =>
            exec('git checkout some-branch')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    branch: '/(^master$|^release$)/',
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Expected branch to match /(^master$|^release$)/, but it was 'some-branch'."
                    )
                ));

        it('Should expect the latest commit in the branch', () =>
            exec('git checkout 15a1ef78338cf1fa60c318828970b2b3e70004d1')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    branch: 'master',
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) => {
                    const msgRe = /^ {2}\* Expected branch to be 'master', but it was '\((?:HEAD )?detached (?:from|at) 15a1ef7\)'.$/;

                    assert(msgRe.test(err.message));
                }));

        it('Should pass branch validation', () =>
            exec('git checkout some-branch').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: 'some-branch',
                            },
                        },
                    })
                )
            ));

        it('Should pass branch validation via RegExp (master branch)', () =>
            exec('git checkout master').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: '/(^master$|^release$)/',
                            },
                        },
                    })
                )
            ));
        it('Should pass branch validation via simple RegExp (master branch)', () =>
            exec('git checkout master').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: '/(master|release)/',
                            },
                        },
                    })
                )
            ));

        it('Should pass branch validation via RegExp (release branch)', () =>
            exec('git checkout -b release').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: '/(^master$|^release$)/',
                            },
                        },
                    })
                )
            ));
        it('Should pass branch validation via simple RegExp (hotfix branch)', () =>
            exec('git checkout -b hotfix').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: '/(master|release|hotfix)/',
                            },
                        },
                    })
                )
            ));

        it('Should not validate if branch-validation is disabled', () =>
            exec('git checkout some-branch').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                branch: false,
                            },
                        },
                    })
                )
            ));
    });

    describe('Git tag validation', () => {
        afterEach(() => exec('git tag | xargs git tag -d'));

        it('Should expect git tag to match version', () =>
            exec('git checkout master')
                .then(() => exec('git tag v0.0.42'))
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    gitTag: true,
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Expected git tag to be '1.3.77' or 'v1.3.77', but it was 'v0.0.42'."
                    )
                ));

        it('Should expect prefixed git tag to match version', () =>
            exec('git checkout master')
                .then(() => exec('git tag foo-v0.0.42'))
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    gitTag: 'foo-v',
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Expected git tag to be '1.3.77' or 'foo-v1.3.77', but it was 'foo-v0.0.42'."
                    )
                ));

        it('Should expect git tag to exist', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    gitTag: true,
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        "  * Latest commit doesn't have git tag."
                    )
                ));

        it('Should pass validation', () =>
            exec('git checkout master')
                .then(() => exec('git tag v1.3.77'))
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                validations: {
                                    gitTag: true,
                                },
                            },
                        })
                    )
                ));

        it('Should pass validation when prefixed', () =>
            exec('git checkout master')
                .then(() => exec('git tag foo-v1.3.77'))
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                validations: {
                                    gitTag: 'foo-v',
                                },
                            },
                        })
                    )
                ));

        it('Should not validate if tag-validation is disabled', () =>
            exec('git checkout master')
                .then(() => exec('git tag v0.0.42'))
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                validations: {
                                    tag: false,
                                },
                            },
                        })
                    )
                ));
    });

    describe('Uncommitted changes check', () => {
        it('Should expect no uncommitted changes in the working tree', () =>
            exec('git checkout master')
                .then(() => {
                    writeFile('README.md', 'Yo!');

                    return publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    uncommittedChanges: true,
                                },
                            },
                        })
                    );
                })
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        '  * There are uncommitted changes in the working tree.'
                    )
                ));

        it('Should pass validation if uncommittedChanges-validation is disabled', () =>
            exec('git checkout master').then(() => {
                writeFile('README.md', 'Yo!');

                return publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                uncommittedChanges: false,
                            },
                        },
                    })
                );
            }));

        it('Should pass validation', () =>
            exec('git checkout master').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                uncommittedChanges: true,
                            },
                        },
                    })
                )
            ));
    });

    describe('Untracked files check', () => {
        it('Should expect no untracked files in the working tree', () =>
            exec('git checkout master')
                .then(() => {
                    writeFile('test-file', 'Yo!');

                    return publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    untrackedFiles: true,
                                },
                            },
                        })
                    );
                })
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        '  * There are untracked files in the working tree.'
                    )
                ));

        it('Should pass validation if untrackedFiles-validation is disabled', () =>
            exec('git checkout master').then(() => {
                writeFile('test-file', 'Yo!');

                return publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                untrackedFiles: false,
                            },
                        },
                    })
                );
            }));

        it('Should pass validation', () =>
            exec('git checkout master').then(() =>
                publish(
                    getTestOptions({
                        set: {
                            publishCommand: echoPublishCommand,
                            validations: {
                                untrackedFiles: true,
                            },
                        },
                    })
                )
            ));
    });

    describe('Sensitive information audit', () => {
        it('Should fail if finds sensitive information', () =>
            exec('git checkout master')
                .then(() => mkdirp('test'))
                .then(() => {
                    writeFile('lib/pack1.tgz', 'test');
                    writeFile('lib/pack2.tgz', 'test');
                    writeFile('test/pack3.tgz', 'test');
                })
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    sensitiveData: true,
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch(
                    (err) =>
                        // prettier-ignore
                        nodeInfos.npmPackHasJsonReporter
                            ? err.message.should.containEql('Sensitive or non essential data found in npm package: lib/pack1.tgz')
                            && err.message.should.containEql('Sensitive or non essential data found in npm package: lib/pack2.tgz')
                            && err.message.should.not.containEql('Sensitive or non essential data found in npm package: test/pack3.tgz')

                            : assert(
                                err.message.indexOf(
                                    'Cannot check sensitive and non-essential data because npm version is'
                                ) > -1
                            )
                ));
        if (nodeInfos.npmPackHasJsonReporter) {
            it('Should not perform check for files specified in opts.ignore', () =>
                exec('git checkout master')
                    .then(() => mkdirp('test'))
                    .then(() => {
                        writeFile('lib/schema.rb', 'test');
                        writeFile('lib/1.keychain', 'test');
                        writeFile('lib/2.keychain', 'test');
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    publishCommand: echoPublishCommand,
                                    validations: {
                                        sensitiveData: {
                                            ignore: [
                                                'lib/schema.rb',
                                                'lib/*.keychain',
                                            ],
                                        },
                                    },
                                },
                            })
                        )
                    ));
        }
        it('Should not perform check if sensitiveData-validation is disabled', () =>
            exec('git checkout master')
                .then(() => mkdirp('test'))
                .then(() => {
                    writeFile('schema.rb', 'test');
                    writeFile('test/database.yml', 'test');
                })
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                validations: {
                                    sensitiveData: false,
                                },
                            },
                        })
                    )
                ));
    });

    describe('Node security project audit', () => {
        it('Should fail if there are vulnerable dependencies', () =>
            exec('git checkout master')
                .then(() => readPkg())
                .then((pkg) => {
                    pkg.dependencies = {
                        ms: '0.7.0',
                    };
                    writeFile('package.json', JSON.stringify(pkg));
                })
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    vulnerableDependencies: true,
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch(
                    (err) =>
                        /* prettier-ignore */
                        nodeInfos.npmAuditHasJsonReporter
                            ? assert(err.message.indexOf('Vulnerability found') > -1)
                            : assert(err.message.indexOf('Cannot check vulnerable dependencies') > -1)
                ));
        ['lodash@4.16.4', 'testcafe@0.19.2'].forEach(function(
            dependency
        ) {
            const name = dependency.split('@')[0];
            const version = dependency.split('@')[1];
            it(`Should fail on transitive dependency inside ${dependency}`, () =>
                exec('git checkout master')
                    .then(() => readPkg())
                    .then((pkg) => {
                        pkg.dependencies = {};
                        pkg.dependencies[`${name}`] = `${version}`;
                        writeFile('package.json', JSON.stringify(pkg));
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    validations: {
                                        vulnerableDependencies: true,
                                    },
                                },
                            })
                        )
                    )
                    .then(() => {
                        throw new Error('Promise rejection expected');
                    })
                    .catch(
                        (err) =>
                            /* prettier-ignore */
                            nodeInfos.npmAuditHasJsonReporter
                                ? assert(err.message.indexOf(name) > -1)
                                : assert(err.message.indexOf('Cannot check vulnerable dependencies') > -1)
                    ));
        });

        ['lodash@4.16.4', 'ms@0.7.0'].forEach(function(dependency) {
            const name = dependency.split('@')[0];
            const version = dependency.split('@')[1];
            it(`Should fail on ${dependency} as a direct dependency`, () =>
                exec('git checkout master')
                    .then(() => readPkg())
                    .then((pkg) => {
                        pkg.dependencies = {};
                        pkg.dependencies[`${name}`] = `${version}`;
                        writeFile('package.json', JSON.stringify(pkg));
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    validations: {
                                        vulnerableDependencies: true,
                                    },
                                },
                            })
                        )
                    )
                    .then(() => {
                        throw new Error('Promise rejection expected');
                    })
                    .catch(
                        (err) =>
                            /* prettier-ignore */
                            nodeInfos.npmAuditHasJsonReporter
                                ? assert(err.message.indexOf(`Vulnerability found in ${envType.isCI() ? name :chalk.red.bold(name)}`) > -1)
                                : assert(err.message.indexOf('Cannot check vulnerable dependencies') > -1)
                    ));
        });

        it('Should ignore vulnerabilities configured in .auditignore file when this file has a bad format', () =>
            exec('git checkout master')
                .then(() => readPkg())
                .then((pkg) => {
                    pkg.dependencies = {};
                    pkg.dependencies['lodash'] = '4.16.4';
                    writeFile('package.json', JSON.stringify(pkg));
                    writeFile(
                        '.auditignore',
                        JSON.stringify({
                            exceptions: 'https://npmjs.com/advisories/577',
                        })
                    );
                })
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                validations: {
                                    vulnerableDependencies: true,
                                },
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch(
                    (err) =>
                        /* prettier-ignore */
                        nodeInfos.npmAuditHasJsonReporter
                            ? assert(err.message.indexOf(`Vulnerability found in ${envType.isCI() ? 'lodash' : chalk.red.bold('lodash')}`) > -1)
                            : assert(err.message.indexOf('Cannot check vulnerable dependencies') > -1)
                ));

        it('Should not perform check if vulnerableDependencies-validation is disabled', () =>
            exec('git checkout master')
                .then(() => readPkg())
                .then((pkg) => {
                    pkg.dependencies = {
                        ms: '0.7.0',
                    };

                    writeFile('package.json', JSON.stringify(pkg));
                })
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                validations: {
                                    vulnerableDependencies: false,
                                },
                            },
                        })
                    )
                ));
    });

    if (nodeInfos.npmAuditHasJsonReporter) {
        describe('Node security project audit when npm version is >= 6.1.0', () => {
            it('Should ignore vulnerabilities configured in .auditignorefile', () =>
                exec('git checkout master')
                    .then(() => readPkg())
                    .then((pkg) => {
                        pkg.dependencies = {};
                        pkg.dependencies['lodash'] = '4.17.13 ';
                        writeFile('package.json', JSON.stringify(pkg));
                        writeFile(
                            '.auditignore',
                            [
                                'https://github.com/advisories/GHSA-35jh-r3h4-6jhm',
                                'https://github.com/advisories/GHSA-p6mc-m468-83gw',
                                'https://github.com/advisories/GHSA-29mw-wpgm-hmr9',
                            ].join(EOL)
                        );
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    publishCommand: echoPublishCommand,
                                    validations: {
                                        vulnerableDependencies: true,
                                    },
                                },
                            })
                        )
                    ));

            ['lodash@4.17.21', 'ms@2.1.3'].forEach(function(dependency) {
                const name = dependency.split('@')[0];
                const version = dependency.split('@')[1];
                it(`Should not fail on ${dependency} as a direct dependency`, () =>
                    exec('git checkout master')
                        .then(() => readPkg())
                        .then((pkg) => {
                            pkg.dependencies = {};
                            pkg.dependencies[`${name}`] = `${version}`;
                            writeFile('package.json', JSON.stringify(pkg));
                        })
                        .then(() =>
                            publish(
                                getTestOptions({
                                    set: {
                                        publishCommand: echoPublishCommand,
                                        validations: {
                                            vulnerableDependencies: true,
                                        },
                                    },
                                })
                            )
                        ));
            });

            it('Should not fail if there is no vulnerable dependency', () =>
                exec('git checkout master')
                    .then(() => readPkg())
                    .then((pkg) => {
                        pkg.dependencies = {
                            lodash: '4.17.21',
                        };
                        writeFile('package.json', JSON.stringify(pkg));
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    publishCommand: echoPublishCommand,
                                    validations: {
                                        vulnerableDependencies: true,
                                    },
                                },
                            })
                        )
                    ));

            it('Should fail with two errors on lodash@4.16.4 and ms@0.7.0', () =>
                exec('git checkout master')
                    .then(() => readPkg())
                    .then((pkg) => {
                        pkg.dependencies = {
                            ms: '0.7.0',
                            lodash: '4.16.4',
                        };
                        writeFile('package.json', JSON.stringify(pkg));
                    })
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    validations: {
                                        vulnerableDependencies: true,
                                    },
                                },
                            })
                        )
                    )
                    .then(() => {
                        throw new Error('Promise rejection expected');
                    })
                    .catch((err) => {
                        /* prettier-ignore */
                        const errors = err.message
                            .split('\n')
                            .filter((msg) => msg.startsWith('  * '));

                        return assert(errors.length === 2);
                    }));
        });
    }

    describe('Prepublish script', () => {
        it('Should fail if prepublish script fail', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                prePublishScript: 'npm run unknown',
                                publishCommand: echoPublishCommand,
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        'Command `npm` exited with code 1.'
                    )
                ));

        it('Should run prepublish script', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                prePublishScript: 'git mv README.md test-file',
                            },
                        })
                    )
                )
                .then(() => assert(readFile('test-file'))));
    });

    describe('Postpublish script', () => {
        it('Should fail if postpublish script fail', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                postPublishScript: 'npm run unknown',
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert.strictEqual(
                        err.message,
                        'Command `npm` exited with code 1.'
                    )
                ));

        it('Should run postpublish script', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                postPublishScript: 'git mv README.md test-file',
                            },
                        })
                    )
                )
                .then(() => assert(readFile('test-file'))));

        it('Should not run postpublish script if publishing was failed', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                prePublishScript: 'echo npm test',
                                publishCommand: 'npm run unknown',
                                postPublishScript: 'git mv README.md test-file',
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert(
                        err.message.indexOf(
                            'Command `npm` exited with code 1'
                        ) > -1
                    )
                )
                .catch(() => assert.throws(() => readFile('test-file'))));

        it('Should not run postpublish script if pre-publish script was failed', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                prePublishScript: 'npm run unknown',
                                publishCommand: echoPublishCommand,
                                postPublishScript: 'git mv README.md test-file',
                            },
                        })
                    )
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) =>
                    assert(
                        err.message.indexOf(
                            'Command `npm` exited with code 1'
                        ) > -1
                    )
                )
                .catch(() => assert.throws(() => readFile('test-file'))));
    });

    describe('Custom publish command', () => {
        it('Should execute a custom publish command if it is specified', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                            },
                            remove: 'publishTag',
                        })
                    )
                )
                .then((npmCmd) =>
                    assert.strictEqual(
                        npmCmd,
                        `${echoPublishCommand} --tag latest --with-publish-please`
                    )
                ));

        it('Should execute a custom publish command with a custom tag', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                publishTag: 'alpha',
                            },
                        })
                    )
                )
                .then((npmCmd) =>
                    assert.strictEqual(
                        npmCmd,
                        `${echoPublishCommand} --tag alpha --with-publish-please`
                    )
                ));
    });

    describe('Publish tag', () => {
        it('Should publish with the given tag', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                                publishTag: 'alpha',
                            },
                        })
                    )
                )
                .then((npmCmd) =>
                    assert.strictEqual(
                        npmCmd,
                        `${echoPublishCommand} --tag alpha --with-publish-please`
                    )
                ));

        it('Should publish with the `latest` tag by default', () =>
            exec('git checkout master')
                .then(() =>
                    publish(
                        getTestOptions({
                            set: {
                                publishCommand: echoPublishCommand,
                            },
                            remove: 'publishTag',
                        })
                    )
                )
                .then((npmCmd) =>
                    assert.strictEqual(
                        npmCmd,
                        `${echoPublishCommand} --tag latest --with-publish-please`
                    )
                ));
    });

    describe('Guard', () => {
        const GUARD_ERROR = 'node ../bin/publish-please.js guard';

        beforeEach(() => {
            const pkg = JSON.parse(readFile('package.json').toString());

            console.log(prepublishKey);

            pkg.scripts = {};
            pkg.scripts[prepublishKey] = 'node ../bin/publish-please.js guard';
            writeFile('package.json', JSON.stringify(pkg));
        });

        it('Should prevent publishing without special flag', () =>
            exec('npm publish')
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) => {
                    console.log(err.message);
                    return assert(err.message.indexOf(GUARD_ERROR) >= 0);
                }));

        it.only('Should allow publishing with special flag', () =>
            exec('npm publish --with-publish-please')
                // NOTE: it will reject anyway because this package version already
                // published or test host don't have permissions to do that
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) => {
                    console.log(err)
                    // prettier-ignore
                    assert(
                        err.message.indexOf('You do not have permission to publish') > -1 ||
                        err.message.indexOf('auth required for publishing') > -1 ||
                        err.message.indexOf('operation not permitted') > -1 ||
                        err.message.indexOf('You must be logged in to publish packages') > -1 ||
                        //https://github.com/npm/cli/issues/1637
                        err.message.indexOf('npm ERR! 404 Not Found - PUT https://registry.npmjs.org/testing-repo - Not found') > -1
                    );
                }));

        it('Should not fail on `install`', () => exec('npm install'));
    });

    describe('Init', () => {
        beforeEach(() => {
            return mkdirp(
                'node_modules/publish-please/lib'.replace(/\\|\//g, sep)
            )
                .then(() =>
                    exec('cp -r ../lib/* node_modules/publish-please/lib')
                )
                .then(() => {
                    process.env['npm_config_argv'] = '';
                });
        });

        it('Should add hooks to package.json', () =>
            exec('node node_modules/publish-please/lib/post-install.js').then(
                () => {
                    const cfg = JSON.parse(readFile('package.json').toString());

                    assert.strictEqual(
                        cfg.scripts['publish-please'],
                        'publish-please'
                    );
                    assert.strictEqual(
                        cfg.scripts[prepublishKey],
                        'publish-please guard'
                    );
                }
            ));

        it('Should add guard gracefully', () => {
            const pkg = {};
            pkg.scripts = {};
            pkg.scripts[prepublishKey] = 'yo';
            writeFile('package.json', JSON.stringify(pkg));

            return exec(
                'node node_modules/publish-please/lib/post-install.js'
            ).then(() => {
                const cfg = JSON.parse(readFile('package.json').toString());

                assert.strictEqual(
                    cfg.scripts[prepublishKey],
                    'publish-please guard && yo'
                );
            });
        });

        it("Should not modify config if it's already modified", () =>
            exec('node node_modules/publish-please/lib/post-install.js')
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    pkg.scripts[prepublishKey] = 'yo';
                    writeFile('package.json', JSON.stringify(pkg));
                    return Promise.resolve();
                })
                .then(() =>
                    exec('node node_modules/publish-please/lib/post-install.js')
                )
                .then(() => {
                    const pkg = JSON.parse(readFile('package.json').toString());
                    assert.strictEqual(pkg.scripts[prepublishKey], 'yo');
                }));

        it("Should exit with error if package.json doesn't exists", () =>
            del('package.json')
                .then(() =>
                    exec('node node_modules/publish-please/lib/post-install.js')
                )
                .then(() => {
                    throw new Error('Promise rejection expected');
                })
                .catch((err) => assert.strictEqual(err.code, 1)));
    });

    describe('Confirmation', () => {
        let confirmCalled = false;

        describe('Passed', () => {
            before(() => {
                mockConfirm = () => {
                    confirmCalled = true;
                    return Promise.resolve(true);
                };
                return Promise.resolve();
            });

            beforeEach(() => (confirmCalled = false));

            after(() => (mockConfirm = () => {}));

            it('Should call confirmation if opts.confirm is true', () =>
                exec('git checkout master')
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    publishCommand: echoPublishCommand,
                                    confirm: true,
                                },
                            })
                        )
                    )
                    .then((npmCmd) => {
                        assert.ok(confirmCalled);
                        assert.strictEqual(
                            npmCmd,
                            `${echoPublishCommand} --tag null --with-publish-please`
                        );
                    }));
        });

        describe('Failed', () => {
            before(() => (mockConfirm = () => Promise.resolve(false)));

            after(() => (mockConfirm = () => {}));

            it('Should return empty string if publish was not confirmed', () =>
                exec('git checkout master')
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    publishCommand: echoPublishCommand,
                                    confirm: true,
                                },
                            })
                        )
                    )
                    .then((npmCmd) => assert.strictEqual(npmCmd, '')));

            it('Should not run postpublish script if publishing was not confirmed', () =>
                exec('git checkout master')
                    .then(() =>
                        publish(
                            getTestOptions({
                                set: {
                                    confirm: true,
                                    publishCommand: echoPublishCommand,
                                    postPublishScript:
                                        'git mv README.md test-file',
                                },
                            })
                        )
                    )
                    .then((npmCmd) => {
                        assert.strictEqual(npmCmd, '');
                        assert.throws(() => readFile('test-file'));
                    }));
        });
    });
});
