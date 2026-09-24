# Integration Pulse Part 1: App Shape And Startup

This listening guide covers only Part 1 of the Integration Pulse reading order: App Shape And Startup.

## Big Idea

Integration Pulse is a single-page SAPUI5 application. The browser loads one HTML page, UI5 starts the application component, the component reads the manifest, and the router decides which view should appear inside the app shell.

The app is designed as an operations console for deployed SAP Integration Suite integrations. It can run in mock mode with local fixture data, or in live-style modes that eventually connect through a proxy or destination.

The high-level startup flow is:

```text
README explains the product
package.json defines commands
ui5.yaml configures UI5 tooling
webapp/index.html bootstraps UI5
webapp/manifest.json declares the app descriptor
webapp/Component.js starts the app component
webapp/model/models.js creates the startup device model
```

## File Responsibilities

### README.md

The README explains the product and architecture. Integration Pulse operates deployed integrations. It is not the system that designs integrations. Its main features are the Integrations page, where users browse and configure deployed iFlows, and the Monitoring page, where users inspect runtime status and message logs.

The README also explains why a backend can exist. A browser should not hold OAuth client secrets, and SAP BTP APIs may not be directly callable from the browser because of CORS. A backend proxy can hold secrets safely and mediate API calls.

Important idea:

```text
Frontend UI
 -> optional backend proxy
 -> SAP BTP Integration Suite API
```

### package.json

The package file defines how developers start and build the frontend.

Important commands:

```json
"start": "ui5 serve --open \"index.html?mock=true\""
"start:live": "ui5 serve --open index.html"
"start:proxy": "ui5 serve --open \"index.html?mock=false&api=proxy\""
"build": "ui5 build --clean-dest"
```

The default command starts in mock mode. That means the app can run without BTP tenant access. This is useful for local demos, development, and learning.

The key dependency is the UI5 command-line tooling:

```json
"@ui5/cli": "^3.11.0"
```

### ui5.yaml

The UI5 YAML file configures the local UI5 development server and framework.

The app uses OpenUI5 version 1.120.20:

```yaml
framework:
  name: OpenUI5
  version: "1.120.20"
```

The listed libraries tell us what kind of UI controls the app uses:

```text
sap.m: common UI controls like buttons, pages, tables, and dialogs
sap.tnt: shell and side navigation controls
sap.f: flexible and Fiori-style layout controls
sap.ui.core: the UI5 runtime foundation
sap.ui.layout: layout helpers
```

The proxy section says that calls to `/api` can be routed through the `Integration-Suite-Dev` destination during destination live mode.

### webapp/index.html

The index file is the browser entry point.

The most important element is the UI5 bootstrap script:

```html
<script
  id="sap-ui-bootstrap"
  src="resources/sap-ui-core.js"
  data-sap-ui-theme="sap_horizon"
  data-sap-ui-resourceroots='{ "integrationpulse": "./" }'
  data-sap-ui-oninit="module:sap/ui/core/ComponentSupport"
  data-sap-ui-async="true">
</script>
```

This tells the browser to load UI5 from local UI5 tooling resources, use the Horizon theme, and map the namespace `integrationpulse` to the current `webapp` folder.

The body contains a component placeholder:

```html
<div
  data-sap-ui-component
  data-name="integrationpulse"
  data-id="container"
  data-settings='{ "id": "integrationpulse" }'>
</div>
```

This is where UI5 mounts the application component.

### webapp/manifest.json

The manifest is the UI5 app descriptor. It declares metadata, dependencies, global models, CSS, root view, data sources, and routing.

The root view is:

```json
"rootView": {
  "viewName": "integrationpulse.view.App",
  "type": "XML",
  "async": true,
  "id": "app"
}
```

This means UI5 starts by loading `webapp/view/App.view.xml`.

The manifest also defines the i18n model:

```json
"models": {
  "i18n": {
    "type": "sap.ui.model.resource.ResourceModel",
    "settings": {
      "bundleName": "integrationpulse.i18n.i18n"
    }
  }
}
```

That model provides centralized UI text.

Routing is also declared in the manifest. Examples:

```json
{
  "name": "integrations",
  "pattern": "integrations",
  "target": "integrations"
}
```

```json
{
  "name": "integrationDetail",
  "pattern": "integrations/{id}",
  "target": "integrationDetail"
}
```

The `pattern` is the URL hash pattern. The `target` is the view that should be loaded.

### webapp/Component.js

The component is the JavaScript class UI5 starts after bootstrapping.

The metadata points back to the manifest:

```js
metadata: {
  manifest: "json"
}
```

The `init` function is the startup method:

```js
init: function () {
  UIComponent.prototype.init.apply(this, arguments);
  this.setModel(models.createDeviceModel(), "device");
  this.getRouter().initialize();
}
```

The first line lets the base UI5 component initialize itself. The second line creates a named model called `device`. The third line starts routing.

Without `this.getRouter().initialize()`, the route definitions in `manifest.json` would exist but would not drive page navigation.

### webapp/model/models.js

This file defines model factory functions used at startup.

The current important function is:

```js
createDeviceModel: function () {
  var oModel = new JSONModel(Device);
  oModel.setDefaultBindingMode("OneWay");
  return oModel;
}
```

This wraps UI5's `Device` information in a JSON model. The app can bind UI behavior to device traits such as phone, tablet, desktop, touch support, and browser characteristics.

The binding mode is one-way because the app should read device information, not edit it.

## Startup Story In Plain English

When a developer runs `npm start`, the UI5 dev server opens `index.html?mock=true`.

The browser loads `webapp/index.html`. That file loads the UI5 runtime from `resources/sap-ui-core.js`.

The UI5 bootstrap sees the component placeholder in the HTML body. It creates the `integrationpulse` component.

The component loads `webapp/Component.js`. Because the component metadata says `manifest: "json"`, UI5 reads `webapp/manifest.json`.

The manifest declares the root view as `integrationpulse.view.App`, so UI5 loads `webapp/view/App.view.xml`.

Then `Component.js` runs `init`. It creates the `device` model and initializes the router.

The router checks the current URL hash. If the hash is empty, it matches the route named `home`, whose target is the Home view.

At that point, the app shell exists and the routed page appears inside it.

## Navigation Mental Model

Routes are names for app destinations.

Examples:

```text
Route name: home
Pattern: empty string
Target: Home view
```

```text
Route name: integrations
Pattern: integrations
Target: Integrations view
```

```text
Route name: integrationDetail
Pattern: integrations/{id}
Target: IntegrationDetail view
```

If controller code later calls:

```js
this.navTo("integrationDetail", { id: "Employee_Data" });
```

UI5 produces a URL hash like:

```text
#/integrations/Employee_Data
```

and loads the Integration Detail page with `id` available as a route argument.

## Important Vocabulary

Single-page application: an app where the browser loads one page, and JavaScript swaps views without full page reloads.

UI5 bootstrap: the script tag in `index.html` that loads and configures the UI5 runtime.

Component: the top-level UI5 application object.

Manifest: the app descriptor that declares routing, models, libraries, CSS, and root view.

Root view: the first view UI5 loads. In this app, it is `App.view.xml`.

Route: a named navigation destination with a URL pattern.

Target: the view loaded when a route matches.

Model: an object UI5 views can bind to.

Device model: a startup model that exposes device and browser information to the UI.

Mock mode: a local data mode that does not require a real backend or BTP tenant.

## Why This Architecture Exists

The app separates startup concerns from feature concerns.

`index.html` only starts UI5. `manifest.json` describes the app. `Component.js` performs runtime startup. Feature pages such as Home, Integrations, and Monitoring are loaded through routes later.

This separation makes the app easier to reason about:

```text
Startup files answer: How does the app boot?
Routing files answer: Which page appears for each URL?
Feature files answer: What does the user see and do on that page?
Service files answer: Where does data come from?
```

## Code Reading Exercise

Read the Part 1 files in this order:

```text
README.md
package.json
ui5.yaml
webapp/index.html
webapp/manifest.json
webapp/Component.js
webapp/model/models.js
```

For each file, write one sentence:

```text
This file is responsible for...
```

Then trace this startup path:

```text
npm start
 -> index.html
 -> UI5 bootstrap
 -> integrationpulse Component
 -> manifest.json
 -> App root view
 -> router initialization
 -> Home route
```

## Checkpoint Questions

1. What command starts the app in mock mode?
2. Why does the app load UI5 from `resources/sap-ui-core.js` instead of directly from a public CDN?
3. Which file declares the root view?
4. Which file starts the router?
5. What is the difference between a route and a target?
6. Why is the device model one-way?
7. What would likely break if `this.getRouter().initialize()` were removed from `Component.js`?

## Explain-Back Prompt

Explain the app startup flow in under two minutes, beginning with `npm start` and ending with the first routed view appearing.
