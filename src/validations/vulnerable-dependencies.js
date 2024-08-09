'use strict';

const pathJoin = require('path').join;
const audit = require('../utils/npm-audit');
const confirm = require('../utils/inquires').confirm;
const nodeInfos = require('../utils/get-node-infos').getNodeInfosSync();
const reporter = require('../reporters/current');

module.exports = {
    option: 'vulnerableDependencies',
    statusText: 'Checking for the vulnerable dependencies',
    defaultParam: true,

    configurator(currentVal) {
        return confirm(
            "Would you like to verify that your package doesn't have vulnerable dependencies before publishing?",
            currentVal
        );
    },
    canRun() {
        // prettier-ignore
        return nodeInfos && nodeInfos.npmAuditHasJsonReporter
            ? true
            : false;
    },
    whyCannotRun() {
        return `Cannot check vulnerable dependencies because npm version is ${
            nodeInfos.npmVersion
        }. Either upgrade npm to version 6.1.0 or above, or disable this validation in the configuration file`;
    },
    run() {
        return new Promise((resolve, reject) => {
            try {
                const projectDir = pathJoin(process.cwd());
                audit(projectDir)
                    .then((result) => {
                        if (vulnerabilitiesFoundIn(result)) {
                            const errs = new Set();

                            Object.keys(result.vulnerabilities).forEach(
                                (vulnerability) => {
                                    result.vulnerabilities[vulnerability].nodes
                                        .forEach((path) => {
                                            const formattedPath = summaryOf(path.replace(/^node_modules\//g, ''));

                                            errs.add(formattedPath);
                                        });
                                }
                            );
                            const distinctAndSortedErrors = Array.from(
                                errs
                            ).sort();

                            reject(distinctAndSortedErrors);
                            return;
                        }
                        if (auditErrorFoundIn(result)) {
                            reject(summaryErrorOf(result.error));
                            return;
                        }
                        resolve();
                    })
                    .catch((err) => {
                        reject(err);
                    });
            } catch (error) {
                reject(error.message);
            }
        });
    },
};

function vulnerabilitiesFoundIn(result) {
    return result &&
        result.vulnerabilities &&
        Object.keys(result.vulnerabilities).length > 0;
}

function auditErrorFoundIn(result) {
    return result && result.error && result.error.summary;
}

function summaryOf(vulnerability) {
    const summary = `Vulnerability found in ${reporter
        .current()
        .formatAsElegantPath(vulnerability, '/')}`;
    return summary;
}

function summaryErrorOf(error) {
    const summary = elegantSummary(error.summary);
    return summary;
}

function elegantSummary(summary) {
    const result = summary
        .split('\n')
        .map((line, index) => (index === 0 ? line : `\t${line}`))
        .join('\n');
    return result;
}
