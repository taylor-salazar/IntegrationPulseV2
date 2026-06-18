sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, BackendClient, MessageToast) {
	"use strict";

	var AUTO_REFRESH_MS = 15000;

	function normalizeSystemName(sValue) {
		return String(sValue || "")
			.replace(/[_-]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function systemFromItem(oItem, sMode) {
		var sSystem = sMode === "source" ?
			(oItem.sender || oItem.sourceSystem || oItem.source || "") :
			(oItem.receiver || oItem.targetSystem || oItem.target || "");
		var aParts = String(oItem.name || oItem.id || "").split(/\s*(?:->|to)\s*/i);
		if (!sSystem && aParts.length > 1) {
			sSystem = sMode === "source" ? aParts[0] : aParts[aParts.length - 1];
		}
		return normalizeSystemName(sSystem || "Unknown System");
	}

	function latestLog(aLogs) {
		return (aLogs || []).slice().sort(function (a, b) {
			return new Date(b.logEnd || 0).getTime() - new Date(a.logEnd || 0).getTime();
		})[0] || null;
	}

	function healthFromStatus(oItem, oLatestLog) {
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

	function logSummary(oItem, oLatestLog) {
		if (!oLatestLog) {
			return {
				id: oItem.id,
				name: oItem.name,
				status: oItem.status || "No runs",
				logEnd: oItem.lastDeployed,
				durationMs: "",
				errorMessage: ""
			};
		}
		return {
			id: oItem.id,
			name: oItem.name,
			status: oLatestLog.status,
			logEnd: oLatestLog.logEnd,
			durationMs: oLatestLog.durationMs,
			errorMessage: oLatestLog.errorMessage || ""
		};
	}

	function ranInLast24Hours(oItem, oLatestLog) {
		if (Number(oItem.messages24h) > 0) {
			return true;
		}
		if (!oLatestLog || !oLatestLog.logEnd) {
			return false;
		}
		var nLogTime = new Date(oLatestLog.logEnd).getTime();
		return !isNaN(nLogTime) && Date.now() - nLogTime <= 24 * 60 * 60 * 1000;
	}

	return BaseController.extend("integrationpulse.controller.Monitoring", {

		onInit: function () {
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
			var that = this;
			this.getView().setBusy(true);
			BackendClient.getMonitoring().then(function (aItems) {
				return (aItems || []).map(function (oItem) {
					var sHealth = healthFromStatus(oItem, null);
					return Object.assign({}, oItem, {
						sourceSystem: systemFromItem(oItem, "source"),
						targetSystem: systemFromItem(oItem, "target"),
						logs: [],
						logsLoaded: false,
						latestLog: null,
						latestSummary: logSummary(oItem, null),
						health: sHealth,
						ran24h: ranInLast24Hours(oItem, null)
					});
				});
			}).then(function (aItems) {
				that._aAllItems = aItems;
				that._mExpandedVendors = {};
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
			var mGroups = {};
			aItems.forEach(function (oItem) {
				var sSystem = sMode === "target" ? oItem.targetSystem : oItem.sourceSystem;
				var sKey = (sSystem || "Unknown System").toLowerCase();
				if (!mGroups[sKey]) {
					mGroups[sKey] = {
						id: encodeURIComponent(sKey),
						name: sSystem || "Unknown System",
						subtitle: bRecentOnly ? this.getText("monitoringTileRecentSubtitle") : this.getText("monitoringTileDeployedSubtitle"),
						total: 0,
						passed: 0,
						failed: 0,
						warnings: 0,
						messages24h: 0,
						errors24h: 0,
						isExpanded: this._mExpandedVendors && this._mExpandedVendors[sCollection] === (sSystem || "Unknown System"),
						isLoading: false,
						logsLoaded: true,
						integrations: []
					};
				}
				var oGroup = mGroups[sKey];
				oGroup.total += 1;
				oGroup.messages24h += Number(oItem.messages24h) || 0;
				oGroup.errors24h += Number(oItem.errors24h) || 0;
				oGroup[oItem.health === "failed" ? "failed" : (oItem.health === "warning" ? "warnings" : "passed")] += 1;
				oGroup.logsLoaded = oGroup.logsLoaded && !!oItem.logsLoaded;
				oGroup.integrations.push(oItem);
			}.bind(this));
			return Object.keys(mGroups).map(function (sKey) {
				var oGroup = mGroups[sKey];
				oGroup.integrations.sort(function (a, b) {
					var nTimeDiff = new Date((b.latestSummary && b.latestSummary.logEnd) || b.lastDeployed || 0).getTime() -
						new Date((a.latestSummary && a.latestSummary.logEnd) || a.lastDeployed || 0).getTime();
					return nTimeDiff || (a.name || "").localeCompare(b.name || "");
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

		_toggleGroup: function (sCollection, oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("monitoring");
			var sPath = oCtx && oCtx.getPath();
			if (!sPath) {
				return;
			}
			var aGroups = this.getModel("monitoring").getProperty("/" + sCollection) || [];
			var oSelectedGroup = null;
			aGroups.forEach(function (oGroup, iIndex) {
				var bSelected = "/" + sCollection + "/" + iIndex === sPath;
				oGroup.isExpanded = bSelected ? !oGroup.isExpanded : false;
				if (bSelected && oGroup.isExpanded) {
					oSelectedGroup = oGroup;
				}
			});
			this._mExpandedVendors = this._mExpandedVendors || {};
			this._mExpandedVendors[sCollection] = oSelectedGroup ? oSelectedGroup.name : null;
			this.getModel("monitoring").setProperty("/" + sCollection, aGroups);
			if (oSelectedGroup && !oSelectedGroup.logsLoaded) {
				this._loadVendorRuns(sCollection, oSelectedGroup.name);
			}
		},

		_loadVendorRuns: function (sCollection, sSystem) {
			var that = this;
			var aGroups = this.getModel("monitoring").getProperty("/" + sCollection) || [];
			var oGroup = aGroups.filter(function (oCandidate) { return oCandidate.name === sSystem; })[0];
			if (!oGroup) {
				return;
			}
			oGroup.isLoading = true;
			this.getModel("monitoring").setProperty("/" + sCollection, aGroups);
			Promise.all(oGroup.integrations.map(function (oItem) {
				return BackendClient.getMessageLogs(oItem.id).catch(function () {
					return [];
				}).then(function (aLogs) {
					var oLatestLog = latestLog(aLogs);
					return {
						id: oItem.id,
						logs: aLogs || [],
						logsLoaded: true,
						latestLog: oLatestLog,
						latestSummary: logSummary(oItem, oLatestLog),
						health: healthFromStatus(oItem, oLatestLog),
						ran24h: ranInLast24Hours(oItem, oLatestLog)
					};
				});
			})).then(function (aUpdates) {
				var mUpdates = {};
				aUpdates.forEach(function (oUpdate) {
					mUpdates[oUpdate.id] = oUpdate;
				});
				that._aAllItems = (that._aAllItems || []).map(function (oItem) {
					return mUpdates[oItem.id] ? Object.assign({}, oItem, mUpdates[oItem.id]) : oItem;
				});
				that._applyViewData();
			});
		},

		onGroupBySource: function () {
			this.getModel("view").setProperty("/groupMode", "source");
			this.getModel("view").setProperty("/groupLabel", this.getText("sourceSystemCategory"));
			this._mExpandedVendors = {};
			this._applyViewData();
		},

		onGroupByTarget: function () {
			this.getModel("view").setProperty("/groupMode", "target");
			this.getModel("view").setProperty("/groupLabel", this.getText("targetSystemCategory"));
			this._mExpandedVendors = {};
			this._applyViewData();
		},

		onToggleRecentVendor: function (oEvent) {
			this._toggleGroup("recentVendors", oEvent);
		},

		onToggleDeployedVendor: function (oEvent) {
			this._toggleGroup("deployedVendors", oEvent);
		},

		onShowPreviousRuns: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("monitoring");
			var sId = oCtx && oCtx.getProperty("id");
			if (sId) {
				this.navTo("monitoringDetail", { id: sId });
			}
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
