sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel"
], function (BaseController, JSONModel) {
	"use strict";

	// Shell controller: owns the top bar, left navigation, and route selection state.
	// It does not load business data; it keeps the app frame in sync with routing.
	return BaseController.extend("integrationpulse.controller.App", {

		onInit: function () {
			// appView is a view-state model. It stores UI-only state such as
			// whether the sidebar is expanded and which navigation item is selected.
			this.setModel(new JSONModel({
				sideExpanded: true,
				selectedNavKey: "home",
				homeExpanded: true
			}), "appView");

			// Keep the side-nav selection in sync with the current route.
			this.getRouter().attachRouteMatched(this._onRouteMatched, this);
		},

		_onRouteMatched: function (oEvent) {
			// Detail routes still highlight their parent nav item. For example,
			// #/monitoring/MyIntegration should keep Monitoring selected.
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
			// The sidebar only emits a key. This handler translates that key into
			// a router navigation action.
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
			// Re-fire the current hash route so the active controller reloads its
			// data without forcing a full browser refresh.
			this.getRouter().getHashChanger().fireEvent("hashChanged", {
				newHash: this.getRouter().getHashChanger().getHash()
			});
		}
	});
});
