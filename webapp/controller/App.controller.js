sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	return BaseController.extend("integrationpulse.controller.App", {

		onInit: function () {
			this.setModel(new JSONModel({
				sideExpanded: true,
				selectedNavKey: "home",
				homeExpanded: true
			}), "appView");

			// Keep the side-nav selection in sync with the current route.
			this.getRouter().attachRouteMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			var sName = oEvent.getParameter("name");
			var sKey = "home";
			if (sName.indexOf("monitoring") === 0) {
				sKey = "monitoring";
			} else if (sName.indexOf("integration") === 0) {
				sKey = "integrations";
			}
			this.getModel("appView").setProperty("/selectedNavKey", sKey);
		},

		onToggleNav: function () {
			var oModel = this.getModel("appView");
			oModel.setProperty("/sideExpanded", !oModel.getProperty("/sideExpanded"));
		},

		onNavSelect: function (oEvent) {
			var sKey = oEvent.getParameter("item").getKey();
			if (sKey === "home") {
				var oModel = this.getModel("appView");
				oModel.setProperty("/homeExpanded", !oModel.getProperty("/homeExpanded"));
				this.navTo("home");
				return;
			}
			if (sKey === "home" || sKey === "integrations" || sKey === "monitoring") {
				this.navTo(sKey);
			}
		},

		onGlobalRefresh: function () {
			this.getRouter().getHashChanger().fireEvent("hashChanged", {
				newHash: this.getRouter().getHashChanger().getHash()
			});
		}
	});
});
