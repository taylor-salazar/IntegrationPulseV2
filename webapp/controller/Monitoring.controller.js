sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, BackendClient, MessageToast) {
	"use strict";

	// Monitoring controller: turns runtime status and integration metadata into
	// Source/Target system health tiles for operations users.
	var AUTO_REFRESH_MS = 15000;

	function normalizeSystemName(sValue) {
		return String(sValue || "")
			.replace(/[_-]+/g, " ")
			.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
			.replace(/\s+/g, " ")
			.trim();
	}

	function formatSystemName(sValue, sUnknown) {
		var sName = normalizeSystemName(sValue);
		var mAcronyms = {
			API: true,
			BTP: true,
			EC: true,
			HCM: true,
			HR: true,
			IDP: true,
			SAP: true,
			SFTP: true,
			UKG: true
		};
		if (!sName) {
			return sUnknown;
		}
		return sName.split(" ").map(function (sPart) {
			var sUpper = sPart.toUpperCase();
			return mAcronyms[sUpper] ? sUpper : sPart.charAt(0).toUpperCase() + sPart.slice(1);
		}).join(" ");
	}

	function healthFromStatus(oItem, oLatestLog) {
		// Collapse several technical statuses into the three UI health buckets
		// shown on vendor tiles: passed, warning, failed.
		var sLogStatus = (oLatestLog && oLatestLog.status || "").toUpperCase();
		var sRuntime = (oItem.status || "").toUpperCase();
		if (sLogStatus === "FAILED" || sRuntime === "ERROR" || Number(oItem.errors24h) > 0) {
			return "failed";
		}
		if (["RETRY", "PROCESSING"].indexOf(sLogStatus) > -1 ||
				["STARTING", "DEPLOYING", "STOPPED"].indexOf(sRuntime) > -1) {
			return "warning";
		}
		return "passed";
	}

	function ranInLast24Hours(oItem) {
		if (Number(oItem.messages24h) > 0) {
			return true;
		}
		return false;
	}

	return BaseController.extend("integrationpulse.controller.Monitoring", {

		onInit: function () {
			// monitoring holds displayed data. view holds UI state and KPI totals.
			this.setModel(new JSONModel({
				items: [],
				recentVendors: [],
				deployedVendors: []
			}), "monitoring");
			this.setModel(new JSONModel({
				isMock: BackendClient.isMock(),
				autoRefresh: false,
				query: "",
				groupMode: "source",
				groupLabel: this.getText("sourceSystemCategory"),
				kpi: {
					started: 0,
					error: 0,
					warnings: 0,
					errors24h: 0,
					messages24h: 0,
					passPercent: 0,
					warningPercent: 0,
					errorPercent: 0
				}
			}), "view");

			this.getRouter().getRoute("monitoring").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			// Load both metadata and runtime status, then merge by integration ID.
			// Metadata supplies Source/Target names; runtime status supplies health.
			var that = this;
			this.getView().setBusy(true);
			Promise.all([
				BackendClient.getIntegrationsWithMetadata(),
				BackendClient.getMonitoring()
			]).then(function (aResults) {
				var aIntegrations = aResults[0] || [];
				var aRuntimeItems = aResults[1] || [];
				var mRuntimeById = {};
				var sUnknown = that.getText("unknownSystem");
				aRuntimeItems.forEach(function (oItem) {
					if (oItem && oItem.id) {
						mRuntimeById[oItem.id] = oItem;
					}
				});
				return aIntegrations.map(function (oIntegration) {
					var oRuntime = mRuntimeById[oIntegration.id] || {};
					var oItem = Object.assign({}, oRuntime, oIntegration, {
						messages24h: Number(oRuntime.messages24h) || 0,
						errors24h: Number(oRuntime.errors24h) || 0,
						endpoint: oRuntime.endpoint || ""
					});
					var sHealth = healthFromStatus(oItem, null);
					return Object.assign({}, oItem, {
						sourceSystem: formatSystemName(oItem.sender, sUnknown),
						targetSystem: formatSystemName(oItem.receiver, sUnknown),
						health: sHealth,
						ran24h: ranInLast24Hours(oItem)
					});
				});
			}).then(function (aItems) {
				that._aAllItems = aItems;
				that._applyViewData();
				that.getView().setBusy(false);
			}).catch(function (oErr) {
				that.getView().setBusy(false);
				MessageToast.show("Failed to load monitoring: " + oErr.message);
			});
		},

		_applyViewData: function () {
			var sQuery = (this.getModel("view").getProperty("/query") || "").toLowerCase();
			var sMode = this.getModel("view").getProperty("/groupMode") || "source";
			var aItems = (this._aAllItems || []).filter(function (oItem) {
				if (!sQuery) {
					return true;
				}
				return [oItem.name, oItem.packageName, oItem.sourceSystem, oItem.targetSystem, oItem.status]
					.join(" ").toLowerCase().indexOf(sQuery) > -1;
			});
			this.getModel("monitoring").setData({
				items: aItems,
				recentVendors: this._groupSystems(aItems.filter(function (oItem) { return oItem.ran24h; }), true, "recentVendors", sMode),
				deployedVendors: this._groupSystems(aItems, false, "deployedVendors", sMode)
			});
			this._computeKpis(aItems);
		},

		_groupSystems: function (aItems, bRecentOnly, sCollection, sMode) {
			// Convert integration rows into Source/Target system tiles. Each tile
			// aggregates pass/fail/warning totals for its contained integrations.
			var mGroups = {};
			aItems.forEach(function (oItem) {
				var sSystem = sMode === "target" ? oItem.targetSystem : oItem.sourceSystem;
				var sKey = (sSystem || "Unknown System").toLowerCase();
				if (!mGroups[sKey]) {
					mGroups[sKey] = {
						id: encodeURIComponent(sKey),
						mode: sMode,
						name: sSystem || "Unknown System",
						subtitle: bRecentOnly ? this.getText("monitoringTileRecentSubtitle") : this.getText("monitoringTileDeployedSubtitle"),
						total: 0,
						passed: 0,
						failed: 0,
						warnings: 0,
						messages24h: 0,
						errors24h: 0,
						integrations: []
					};
				}
				var oGroup = mGroups[sKey];
				oGroup.total += 1;
				oGroup.messages24h += Number(oItem.messages24h) || 0;
				oGroup.errors24h += Number(oItem.errors24h) || 0;
				oGroup[oItem.health === "failed" ? "failed" : (oItem.health === "warning" ? "warnings" : "passed")] += 1;
				oGroup.integrations.push(oItem);
			}.bind(this));
			return Object.keys(mGroups).map(function (sKey) {
				var oGroup = mGroups[sKey];
				oGroup.integrations.sort(function (a, b) {
					return (a.name || "").localeCompare(b.name || "");
				});
				oGroup.primaryStatus = oGroup.failed ? "Error" : (oGroup.warnings ? "Warning" : "Success");
				return oGroup;
			}).sort(function (a, b) {
				return (b.failed - a.failed) || (b.warnings - a.warnings) || a.name.localeCompare(b.name);
			});
		},

		_computeKpis: function (aItems) {
			var kpi = {
				started: 0,
				error: 0,
				warnings: 0,
				errors24h: 0,
				messages24h: 0,
				passPercent: 0,
				warningPercent: 0,
				errorPercent: 0
			};
			aItems.forEach(function (o) {
				if ((o.status || "").toUpperCase() === "STARTED") { kpi.started++; }
				if (o.health === "failed") { kpi.error++; }
				if (o.health === "warning") { kpi.warnings++; }
				kpi.errors24h += Number(o.errors24h) || 0;
				kpi.messages24h += Number(o.messages24h) || 0;
			});
			var nTotal = Math.max(aItems.length, 1);
			kpi.passPercent = Math.round(((aItems.length - kpi.error - kpi.warnings) / nTotal) * 100);
			kpi.warningPercent = Math.round((kpi.warnings / nTotal) * 100);
			kpi.errorPercent = Math.round((kpi.error / nTotal) * 100);
			this.getModel("view").setProperty("/kpi", kpi);
		},

		onGroupBySource: function () {
			this.getModel("view").setProperty("/groupMode", "source");
			this.getModel("view").setProperty("/groupLabel", this.getText("sourceSystemCategory"));
			this._applyViewData();
		},

		onGroupByTarget: function () {
			this.getModel("view").setProperty("/groupMode", "target");
			this.getModel("view").setProperty("/groupLabel", this.getText("targetSystemCategory"));
			this._applyViewData();
		},

		onOpenSystemLogs: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("monitoring");
			if (!oCtx) {
				return;
			}
			this.navTo("monitoringSystemDetail", {
				mode: oCtx.getProperty("mode"),
				system: encodeURIComponent(oCtx.getProperty("name"))
			});
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
			this.getModel("view").setProperty("/query", oEvent.getParameter("newValue") || "");
			this._applyViewData();
		},

		onExit: function () {
			if (this._timer) {
				clearInterval(this._timer);
			}
		}
	});
});
