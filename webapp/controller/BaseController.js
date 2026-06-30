sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"integrationpulse/model/formatter"
], function (Controller, UIComponent, formatter) {
	"use strict";

	// BaseController is the small shared toolbox inherited by every controller.
	// It avoids repeating common UI5 boilerplate such as router/model/text access.
	return Controller.extend("integrationpulse.controller.BaseController", {

		formatter: formatter,

		getRouter: function () {
			// UIComponent owns the app router created from manifest.json.
			return UIComponent.getRouterFor(this);
		},

		getModel: function (sName) {
			return this.getView().getModel(sName);
		},

		setModel: function (oModel, sName) {
			return this.getView().setModel(oModel, sName);
		},

		getResourceBundle: function () {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle();
		},

		getText: function (sKey, aArgs) {
			// Central i18n lookup. Controllers use keys instead of hard-coded UI text.
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		navTo: function (sName, oParams) {
			// Thin wrapper so child controllers can navigate by route name.
			this.getRouter().navTo(sName, oParams);
		}
	});
});
