sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, BackendClient, MessageToast, MessageBox) {
	"use strict";

	return BaseController.extend("integrationpulse.controller.MonitoringDetail", {

		onInit: function () {
			this.setModel(new JSONModel({}), "monitoringItem");
			this.setModel(new JSONModel({ items: [] }), "logs");
			this.setModel(new JSONModel({
				busy: false,
				summary: {
					total: 0,
					passed: 0,
					failed: 0,
					warnings: 0,
					latestStatus: "",
					latestTime: ""
				}
			}), "monDetailView");

			this.getRouter().getRoute("monitoringDetail").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function (oEvent) {
			this._sId = oEvent.getParameter("arguments").id;
			this._load();
		},

		_load: function () {
			var that = this;
			this.getModel("monDetailView").setProperty("/busy", true);
			Promise.all([
				BackendClient.getMonitoringItem(this._sId),
				BackendClient.getMessageLogs(this._sId)
			]).then(function (aRes) {
				that.getModel("monitoringItem").setData(aRes[0] || {});
				that.getModel("logs").setProperty("/items", aRes[1] || []);
				that._summarizeLogs(aRes[1] || []);
				that.getModel("monDetailView").setProperty("/busy", false);
			}).catch(function (oErr) {
				that.getModel("monDetailView").setProperty("/busy", false);
				MessageToast.show("Failed to load logs: " + oErr.message);
			});
		},

		_summarizeLogs: function (aLogs) {
			var oSummary = {
				total: aLogs.length,
				passed: 0,
				failed: 0,
				warnings: 0,
				latestStatus: "",
				latestTime: ""
			};
			aLogs.forEach(function (oLog) {
				var sStatus = (oLog.status || "").toUpperCase();
				if (sStatus === "FAILED") {
					oSummary.failed += 1;
				} else if (sStatus === "RETRY" || sStatus === "PROCESSING") {
					oSummary.warnings += 1;
				} else if (sStatus === "COMPLETED") {
					oSummary.passed += 1;
				}
			});
			var oLatest = aLogs.slice().sort(function (a, b) {
				return new Date(b.logEnd || 0).getTime() - new Date(a.logEnd || 0).getTime();
			})[0];
			if (oLatest) {
				oSummary.latestStatus = oLatest.status;
				oSummary.latestTime = oLatest.logEnd;
			}
			this.getModel("monDetailView").setProperty("/summary", oSummary);
		},

		onRefresh: function () {
			this._load();
		},

		onOpenLog: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("logs");
			var sError = oCtx.getProperty("errorMessage");
			if (sError) {
				MessageBox.error(sError, {
					title: this.getText("errorDetailTitle") + " — " + oCtx.getProperty("messageId")
				});
			}
		},

		onNavBack: function () {
			this.navTo("monitoring");
		}
	});
});
