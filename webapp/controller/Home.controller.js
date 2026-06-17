sap.ui.define([
	"integrationpulse/controller/BaseController"
], function (BaseController) {
	"use strict";

	return BaseController.extend("integrationpulse.controller.Home", {
		onOpenIntegrations: function () {
			this.navTo("integrations");
		},

		onOpenMonitoring: function () {
			this.navTo("monitoring");
		}
	});
});
