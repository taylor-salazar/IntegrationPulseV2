sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"integrationpulse/model/formatter"
], function (Controller, UIComponent, formatter) {
	"use strict";

	return Controller.extend("integrationpulse.controller.BaseController", {

		formatter: formatter,

		getRouter: function () {
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
			return this.getResourceBundle().getText(sKey, aArgs);
		},

		navTo: function (sName, oParams) {
			this.getRouter().navTo(sName, oParams);
		}
	});
});
