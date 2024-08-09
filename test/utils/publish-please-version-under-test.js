'use strict';
const readFile = require('fs').readFileSync;
const pkg = JSON.parse(readFile('package.json').toString());

module.exports = `devexpress-publish-please@${pkg.version}`;
