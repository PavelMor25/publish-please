'use strict';
const readFile = require('fs').readFileSync;
const pkg = JSON.parse(readFile('package.json').toString());

module.exports = `testcafe-publish-please@${pkg.version}`;
