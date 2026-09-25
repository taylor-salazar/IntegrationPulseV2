// Prepare an ignored, local-only UI tree. Production source stays fail-closed.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.ui5', 'development', 'webapp');
fs.mkdirSync(target, {recursive:true});
fs.cpSync(path.join(root, 'webapp'), target, {recursive:true});
fs.writeFileSync(path.join(target, 'service', 'config.js'), `sap.ui.define([], function () {
  return {production:false,useMock:false,liveMode:"destination",destinationBaseUrl:"/api/v1",immediateRunBaseUrl:"",payloadBaseUrl:"/payload-api/v1",backendBaseUrl:"http://localhost:8000"};
});\n`);
const source = process.argv.includes('--local') ? 'ui5.local.yaml' : 'ui5.yaml';
fs.writeFileSync(path.join(root, '.ui5', 'ui5.development.yaml'),
  fs.readFileSync(path.join(root, source), 'utf8') + '\nresources:\n  configuration:\n    paths:\n      webapp: ' + JSON.stringify(target.replaceAll('\\','/')) + '\n');
console.log('Local development UI prepared under .ui5/development; excluded from deployment.');
