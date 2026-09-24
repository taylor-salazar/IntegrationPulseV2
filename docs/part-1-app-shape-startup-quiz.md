# Integration Pulse Part 1 Quiz: App Shape And Startup

Use this as an explain-back exam. If you can answer these clearly without notes, you are in strong shape for Part 1.

## Core Startup Flow

1. In local development, what starts first: `package.json`, `ui5.yaml`, or `index.html`? Explain the startup chain.

package.json starts first. When you type npm start into the terminal, it goes to package.json to resolve how to load the app, like ui5 serve ___ . Once UI5 is initialized, then ui5.yaml gets read. After that, the browser loads index.html and runs the scripts in there.

2. What does this script do?

   ```json
   "start": "ui5 serve --open \"index.html?mock=true\""
   ```
This would be found in package.json. It initializes the ui5 server and then prompts the browser to open index.html in mock mode.

3. Does `package.json` directly load the UI5 app? If not, what is its role?
It kind of does? When you run npm start, it initializes the UI5 app, calls the ui5.yaml file, and loads the browser in one command. 

4. What does `ui5.yaml` configure that `package.json` does not?

ui5.yaml configures ui5 specific dependencies, versions, libraries, etc. 

5. Why does `webapp/index.html` load this path?

   ```html
   src="resources/sap-ui-core.js"
   ```

   Where does `resources/` come from during local development?

in index.html, the sap-ui-core.js file is essentially the javascript equivalent of an import from UI5. This does not come from local development.

6. In this line, what does `./` mean?

   ```html
   data-sap-ui-resourceroots='{ "integrationpulse": "./" }'
   ```

   Be specific: filesystem-relative or URL-relative?

   ./ refers to the source that is currently serving the current App View. It is URL-Relative. For example, if we are in index.html, then the parent file would be webapp.

7. Why does `./` resolve to `webapp/` locally, even though `webapp` is not written in the HTML?

It resolves since the localhost URL itself resolves to the webapp folder. Even though webapp is not explicitly written in the html, it grabs whatever root directory the current app view is in. Therefore since this line is in index.html, the root of this is webapp.

## ComponentSupport And Component Resolution

8. What does this line tell UI5 to do?

   ```html
   data-sap-ui-oninit="module:sap/ui/core/ComponentSupport"
   ```

   This line tells UI5 to initialize the component file by using a helper function known as ComponentSupport. 

9. What is `ComponentSupport`?

A helper function in charge of connecting your index.html page to your app Component. 

10. Does `ComponentSupport` contain your app logic? If not, what does it do?

It does not contain app specific logic. All it does is go into your Component.js file, look for ui5 specific scripts, and then run it in the js file. 

11. What does this HTML block tell UI5?

   ```html
   <div
     data-sap-ui-component
     data-name="integrationpulse"
     data-id="container"
     data-settings='{ "id": "integrationpulse" }'>
   </div>
   ```
   This lets UI5 know that it is a ui5 component and should be run with the ComponentSupport

12. How does UI5 go from `data-name="integrationpulse"` to `webapp/Component.js`? Explain every link in the chain.

integration pulse is the namespace given to the resource root. So since the app knows that integration pulse -> ./ then it resolves to webapp. And since we are talking about ComponentSupport, when its looking to resolve the component file, it will look for webapp/Component.js 

13. If `webapp/Component.js` did not exist, what would likely happen in the browser?

It would break entirely and ui5 will not complete its initialization. 

14. What is the difference between a UI5 namespace and a filesystem folder?

A ui5 namespace, or any namespace for that matter essentially is a resuable word that can be used as a placeholder for a filepath. So instead of typing out the full path, you can use the namespace instead. 

15. Why is this statement slightly imprecise?

   ```text
   integrationpulse is the root
   ```

   How would you rewrite it more accurately?

   integrationpulse is the namespace that points to the root that serves the current app view.

## Component.js Line-By-Line Understanding

16. In this code, what are the two dependencies?

   ```js
   sap.ui.define([
     "sap/ui/core/UIComponent",
     "integrationpulse/model/models"
   ], function (e, t) {
   ```

The two dependies are UIComponent, which is a UI5 library import, and models.js from webapp/model/models

17. What do `e` and `t` represent?

e and t are the two dependencies in order respectively. e representing UIComponent and t representing models.js

18. Why does the order of dependencies matter in `sap.ui.define`?

Order of dependencies determine which parameter they are assigned to in the function.

19. Rewrite this line with meaningful variable names:

   ```js
   return e.extend("integrationpulse.Component", {
   ```
UIComponent.extend(webapp/Component.js)

20. What does `UIComponent.extend(...)` do conceptually?

It creates a subclass of UIComponent. By extending this class, you are essentially instantiating a UIComponent Class

21. What is the significance of the string `integrationpulse.Component`?

This is essentially the name for the class that you are creating. 

22. What could go wrong, or at least become fragile, if the class name were changed to something like `someOtherNamespace.Component`?

Well in a perfect world, if the class name was changed to something else, it may still auto resolve, but it is best practice to keep all namespaces and class names synonymous. 

23. What does this metadata mean?

   ```js
   metadata: {
     manifest: "json"
   }
   ```

It says that the manifest file is in JSON format. 

24. Which file does UI5 load because of `manifest: "json"`?

manifest.json

25. What kind of information lives in `manifest.json`?

App information such as name, publisher, version, description, and routes.

## Component Init

26. What is `init` in `Component.js`?

Init is the initialization function.

27. Who calls `init`? Do you call it manually?

Init is called on Component Startup, not manually. When the extend() function is ran, it automatically calls the init() function. 

28. Explain this line in plain English:

   ```js
   UIComponent.prototype.init.apply(this, arguments);
   ```

   Initialize this UI Component to 'this' Component instance (Component.js) using the 'arguments' that were passed into the init function. 

29. What is `arguments` in JavaScript?

Arguments are the parameters that are passed into a function. In this case init:function() has no parameters.

30. Why pass `arguments` to the parent `init`?

If there are any arguments that are generated internally, we need to make sure that it propagates to this init function. 

31. What is the modern class-style equivalent of this?

   ```js
   UIComponent.prototype.init.apply(this, arguments);
   ```

super.init(...arguments);

32. Why should the parent `UIComponent` init usually run before your custom component startup code?

It should usully run before custom component startup code, as it will prevent any dependency errors where your startup code requies the parent UIComponent init.

## Models And Router

33. What does this line do?

   ```js
   this.setModel(t.createDeviceModel(), "device");
   ```

   This line binds a device model from models named 'device' using a helper function in models called createDeviceModel(). 

34. What does `"device"` represent in that line?

device is the name of the model.

35. What is a named model?

A named model is an object that holds properties. 

36. Why might an app have multiple named models instead of one global blob of data?

37. What does this line do?

   ```js
   this.getRouter().initialize();
   ```

38. Where is the router configured?

39. What would probably still load if `this.getRouter().initialize()` were removed?

40. What would probably not load if router initialization were removed?

41. Why does the root shell view and the routed page view need to be thought of separately?

## Routes And Targets

42. What is a route?

43. What is a target?

44. Explain the difference between these two concepts:

   ```text
   route pattern
   target view
   ```

45. Given this route:

   ```json
   {
     "name": "integrationDetail",
     "pattern": "integrations/{id}",
     "target": "integrationDetail"
   }
   ```

   What URL hash would you expect for an integration with ID `Employee_Data`?

## Binding

46. In your own words, what is binding?

47. Why is this a binding?

   ```xml
   sideExpanded="{appView>/sideExpanded}"
   ```

48. Break this down:

   ```xml
   {appView>/sideExpanded}
   ```

   What is the model name? What is the path?

49. What happens if the controller runs this?

   ```js
   this.getModel("appView").setProperty("/sideExpanded", false);
   ```

50. Why is binding useful compared to manually calling setters on every UI control?

51. What is the relationship between a controller, a model, and an XML view?

52. Explain this full flow:

   ```text
   Controller changes model
    -> XML binding reads model path
    -> UI updates
   ```

53. True or false: binding connects an entire JavaScript file to an entire XML file. Explain.

54. True or false: binding usually connects a specific UI control property to a specific model path. Explain.

## Full-System Explain-Back

55. Explain the difference between these two things:

   ```text
   UI5 loading Component.js

   Component.js loading manifest.json
   ```

56. Explain the startup flow from `npm start` to the first routed page appearing.

57. If you were drawing this in Obsidian, what arrows would you draw between these?

   ```text
   package.json
   ui5.yaml
   index.html
   ComponentSupport
   Component.js
   manifest.json
   App.view.xml
   Home.view.xml
   ```

58. What is the one sentence purpose of `index.html` in this app?

59. What is the one sentence purpose of `Component.js` in this app?

60. What is the one sentence purpose of `manifest.json` in this app?

## Challenge Explain-Back

61. Answer this as if teaching someone else:

   When I run `npm start`, how does the app eventually know to load `webapp/Component.js`, and how does that lead to routing?

   Aim for a two-minute explanation.

## Debug Scenarios

62. The browser console says it cannot load `integrationpulse/Component.js`. List three possible causes.

63. The shell/header loads, but the Home page area is blank. What startup line would you check first?

64. A binding like `{appView>/sideExpanded}` is not updating the UI. What are three things you would inspect?

65. Someone says `./` in `data-sap-ui-resourceroots` means the repo root folder. How would you correct them?

66. Someone asks why `ComponentSupport` does not directly mention `Component.js`. Explain the convention-based resolution.
