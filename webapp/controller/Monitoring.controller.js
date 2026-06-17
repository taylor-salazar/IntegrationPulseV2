sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, Filter, FilterOperator, BackendClient, MessageToast) {
	"use strict";

	var AUTO_REFRESH_MS = 15000;

	return BaseController.extend("integrationpulse.controller.Monitoring", {

		onInit: function () {
			this.setModel(new JSONModel({ items: [] }), "monitoring");
			this.setModel(new JSONModel({
				isMock: BackendClient.isMock(),
				autoRefresh: false,
				kpi: { started: 0, error: 0, errors24h: 0, messages24h: 0 }
			}), "view");

			this.getRouter().getRoute("monitoring").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			var that = this;
			this.getView().setBusy(true);
			BackendClient.getMonitoring().then(function (aItems) {
				that.getModel("monitoring").setProperty("/items", aItems);
				that._computeKpis(aItems);
				that.getView().setBusy(false);
			}).catch(function (oErr) {
				that.getView().setBusy(false);
				MessageToast.show("Failed to load monitoring: " + oErr.message);
			});
		},

		_computeKpis: function (aItems) {
			var kpi = { started: 0, error: 0, errors24h: 0, messages24h: 0 };
			aItems.forEach(function (o) {
				if ((o.status || "").toUpperCase() === "STARTED") { kpi.started++; }
				if ((o.status || "").toUpperCase() === "ERROR") { kpi.error++; }
				kpi.errors24h += Number(o.errors24h) || 0;
				kpi.messages24h += Number(o.messages24h) || 0;
			});
			this.getModel("view").setProperty("/kpi", kpi);
		},

		onRefresh: function () {
			this._loadData();
		},

		onToggleAutoRefresh: function (oEvent) {
			var bOn = oEvent.getParameter("pressed");
			if (bOn) {
				this._timer = setInterval(this._loadData.bind(this), AUTO_REFRESH_MS);
			} else if (this._timer) {
				clearInterval(this._timer);
				this._timer = null;
			}
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("newValue") || "";
			var aFilters = sQuery ? [new Filter({
				filters: [
					new Filter("name", FilterOperator.Contains, sQuery),
					new Filter("packageName", FilterOperator.Contains, sQuery)
				],
				and: false
			})] : [];
			var oBinding = this.byId("monitoringTable").getBinding("items");
			if (oBinding) {
				oBinding.filter(aFilters);
			}
		},

		onOpenItem: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("monitoring");
			this.navTo("monitoringDetail", { id: oCtx.getProperty("id") });
		},

		onExit: function () {
			if (this._timer) {
				clearInterval(this._timer);
			}
		}
	});
});
