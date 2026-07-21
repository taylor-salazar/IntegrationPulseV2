sap.ui.define([
	"sap/ui/core/UIComponent",
	"integrationpulse/model/models"
], function (UIComponent, models) {
	"use strict";

	return UIComponent.extend("integrationpulse.Component", {

		metadata: {
			manifest: "json"
		},

		/**
		 * The component is initialised by UI5 automatically during the startup of
		 * the app and calls the init method once.
		 */
		init: function () {
			// call the base component's init function on this specific integrationpulse.Component instance that was just created
			UIComponent.prototype.init.apply(this, arguments);

			// set the device model
			this.setModel(models.createDeviceModel(), "device");

			// create the router and start routing
			this.getRouter().initialize();
		}
	});
});
