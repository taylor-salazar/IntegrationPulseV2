sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast"
], function (BaseController, JSONModel, BackendClient, MessageToast) {
	"use strict";

	var LOG_FETCH_CONCURRENCY = 6;

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

	function latestLog(aLogs) {
		return (aLogs || []).slice().sort(function (a, b) {
			return dateTimeValue(b.logEnd) - dateTimeValue(a.logEnd);
		})[0] || null;
	}

	function parseDateValue(sValue) {
		var sText = String(sValue || "");
		var aSapDate = /\/Date\((-?\d+)(?:[+-]\d+)?\)\//.exec(sText);
		if (aSapDate) {
			return new Date(Number(aSapDate[1]));
		}
		return new Date(sValue);
	}

	function dateTimeValue(sValue) {
		var nTime = parseDateValue(sValue).getTime();
		return isNaN(nTime) ? 0 : nTime;
	}

	return BaseController.extend("integrationpulse.controller.Home", {
		onInit: function () {
			this.setModel(new JSONModel({
				busy: false,
				lastRuns: []
			}), "home");

			this.getRouter().getRoute("home").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			this._loadLastRuns();
		},

		onOpenIntegrations: function () {
			this.navTo("integrations");
		},

		onOpenMonitoring: function () {
			this.navTo("monitoring");
		},

		onOpenMonitoringDetail: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("home");
			var sId = oCtx && oCtx.getProperty("id");
			if (sId) {
				this.navTo("monitoringDetail", { id: sId });
			}
		},

		_loadLastRuns: function () {
			var oModel = this.getModel("home");
			oModel.setProperty("/busy", true);

			BackendClient.getIntegrationsWithMetadata().then(function (aIntegrations) {
				return this._mapWithConcurrency(aIntegrations || [], LOG_FETCH_CONCURRENCY, function (oIntegration) {
					return BackendClient.getMessageLogs(oIntegration.id).then(function (aLogs) {
						return this._toLastRunRow(oIntegration, latestLog(aLogs));
					}.bind(this)).catch(function () {
						return this._toLastRunRow(oIntegration, null);
					}.bind(this));
				}.bind(this));
			}.bind(this)).then(function (aRows) {
				aRows.sort(function (a, b) {
					var nA = a.sortTime || 0;
					var nB = b.sortTime || 0;
					return (nB - nA) || a.vendor.localeCompare(b.vendor);
				});
				oModel.setProperty("/lastRuns", aRows);
				oModel.setProperty("/busy", false);
			}).catch(function (oErr) {
				oModel.setProperty("/busy", false);
				MessageToast.show("Failed to load latest runs: " + oErr.message);
			});
		},

		_toLastRunRow: function (oIntegration, oLog) {
			var sUnknown = this.getText("unknownSystem");
			var sSource = formatSystemName(oIntegration.sender, sUnknown);
			var sTarget = formatSystemName(oIntegration.receiver, sUnknown);
			var sTime = oLog && oLog.logEnd || "";
			return {
				id: oIntegration.id,
				vendor: sSource + " -> " + sTarget,
				integrationName: oIntegration.name || oIntegration.id,
				status: oLog && oLog.status || this.getText("homeNoRunStatus"),
				time: sTime,
				sortTime: sTime ? dateTimeValue(sTime) : 0
			};
		},

		_mapWithConcurrency: function (aItems, iLimit, fnMapper) {
			var aResults = new Array(aItems.length);
			var iNext = 0;
			var iActive = 0;

			return new Promise(function (resolve, reject) {
				function runNext() {
					if (iNext >= aItems.length && iActive === 0) {
						resolve(aResults);
						return;
					}
					while (iActive < iLimit && iNext < aItems.length) {
						(function (iIndex) {
							iActive += 1;
							Promise.resolve(fnMapper(aItems[iIndex], iIndex)).then(function (oResult) {
								aResults[iIndex] = oResult;
								iActive -= 1;
								runNext();
							}).catch(reject);
						}(iNext));
						iNext += 1;
					}
				}
				runNext();
			});
		}
	});
});
