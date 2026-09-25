const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const { DOMParser: XmlDOMParser } = require('@xmldom/xmldom');
const ROOT = path.resolve(__dirname, '../..');

class Model {
  constructor(data = {}) { this.data = data; }
  getData() { return this.data; }
  setData(data) { this.data = data; }
  getProperty(key) { return key.split('/').filter(Boolean).reduce((o, k) => o?.[k], this.data); }
  setProperty(key, value) {
    const keys = key.split('/').filter(Boolean);
    const last = keys.pop();
    const parent = keys.reduce((o, k) => o[k] ??= {}, this.data);
    parent[last] = value;
  }
  refresh() {}
}
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
}
function harness({ search = '', fetch: boundary, localStorage = storage(), overrides = {}, immediateTimers = false, clock = Date, globals = {} } = {}) {
  const cache = new Map();
  const calls = [], notices = [];
  const config = { useMock: false, liveMode: 'destination', destinationBaseUrl: '/api/v1', immediateRunBaseUrl: '', payloadBaseUrl: '/payload-api/v1', backendBaseUrl: 'http://proxy.test' };
  const deps = {
    'integrationpulse/controller/BaseController': { extend: (_, methods) => methods },
    'sap/ui/model/json/JSONModel': Model,
    'sap/base/Log': { warning: (...args) => notices.push(args), info: (...args) => notices.push(args) },
    'sap/m/MessageToast': { show: (...args) => notices.push(args) },
    'sap/m/MessageBox': { success: (...args) => notices.push(args), error: (...args) => notices.push(args), confirm: (...args) => notices.push(args), Icon: { WARNING: 'warning' }, Action: { OK: 'OK', CANCEL: 'CANCEL' } },
    'integrationpulse/service/config': config,
    ...overrides
  };
  if (overrides['integrationpulse/service/BackendClient']) {
    deps['integrationpulse/service/BackendClient'] = { getPayloads: () => Promise.resolve([]), ...overrides['integrationpulse/service/BackendClient'] };
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    let exported;
    const sap = { ui: { define: (names, factory) => {
      exported = factory(...names.map(name => {
        if (name in deps) return deps[name];
        if (name.startsWith('integrationpulse/')) return load('webapp/' + name.slice(17) + '.js');
        // Unused visual controls are deliberately unavailable: tests must supply
        // an explicit boundary when executing code that constructs a UI control.
        return function UnsupportedControl() { throw new Error('Unstubbed UI control: ' + name); };
      }));
    }, require: { toUrl: name => '/webapp/' + name.slice(17) } } };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), {
      sap, window: { location: { search, href: 'http://local.test/index.html' }, localStorage }, URLSearchParams, URL, Date: clock,
      DOMParser: class {
        parseFromString(xml, type) {
          // Browser DOMParser reports malformed XML via parsererror. xmldom
          // is stricter here: turn every parser diagnostic into a thrown error.
          return new XmlDOMParser({ errorHandler: {
            warning: message => { throw new Error(message); },
            error: message => { throw new Error(message); },
            fatalError: message => { throw new Error(message); }
          } }).parseFromString(xml, type);
        }
      },
      setTimeout: immediateTimers ? fn => queueMicrotask(fn) : setTimeout,
      clearTimeout, setInterval, clearInterval,
      fetch: async (url, options = {}) => {
        calls.push({ url, ...options });
        if (!boundary) throw new Error('Unexpected HTTP request: ' + url);
        return boundary(url, options);
      },
      ...globals
    }, { filename: file });
    cache.set(file, exported);
    return exported;
  }
  function controller(name) {
    const methods = load(`webapp/controller/${name}.controller.js`);
    const models = {}, routes = [], navigation = [], view = { busy: false, setBusy(v) { this.busy = v; }, setModel() {}, addDependent() {}, getId: () => 'test-view' };
    const instance = Object.assign({}, methods, {
      setModel: (m, n) => { models[n] = m; }, getModel: n => models[n],
      getText: key => key === 'unknownSystem' ? 'Unknown System' : key,
      getView: () => view, byId: () => null,
      getRouter: () => ({ attachRouteMatched() {}, detachRouteMatched() {}, getRoute: name => ({ attachPatternMatched: (fn, ctx) => routes.push({ name, fn, ctx }), detachPatternMatched() {} }) }),
      navTo: (...args) => navigation.push(args)
    });
    instance.onInit();
    return { instance, models, view, routes, navigation };
  }
  return { load, controller, calls, notices, config, localStorage };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const odata = rows => json({ d: { results: rows } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function regression(id, title, reproduce) {
  test(`${id} regression: ${title}`, reproduce);
}
module.exports = { ROOT, Model, storage, harness, json, odata, deferred, flush, plain, regression };
