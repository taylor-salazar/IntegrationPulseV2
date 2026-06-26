sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"integrationpulse/service/ReviewStore",
	"sap/m/MessageToast",
	"sap/m/Dialog",
	"sap/m/TextArea",
	"sap/m/Button"
], function (BaseController, JSONModel, BackendClient, ReviewStore, MessageToast, Dialog, TextArea, Button) {
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
						return this._toLastRunRow(oIntegration, latestLog(aLogs), aLogs);
					}.bind(this)).catch(function () {
						return this._toLastRunRow(oIntegration, null, []);
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

		_toLastRunRow: function (oIntegration, oLog, aLogs) {
			var sUnknown = this.getText("unknownSystem");
			var sSource = formatSystemName(oIntegration.sender, sUnknown);
			var sTarget = formatSystemName(oIntegration.receiver, sUnknown);
			var sTime = oLog && oLog.logEnd || "";
			var sMessageId = oLog && oLog.messageId || "";
			var sReviewKey = ReviewStore.getReviewKey(sMessageId, oIntegration.id);
			var oReview = ReviewStore.getReview(sReviewKey);
			return {
				id: oIntegration.id,
				messageId: sMessageId,
				reviewKey: sReviewKey,
				vendor: sSource + " -> " + sTarget,
				integrationName: oIntegration.name || oIntegration.id,
				status: oLog && oLog.status || this.getText("homeNoRunStatus"),
				time: sTime,
				sortTime: sTime ? dateTimeValue(sTime) : 0,
				underReview: !!oReview,
				reviewDescription: oReview && oReview.description || "",
				unresolvedIssues: ReviewStore.countUnresolvedFailed(aLogs)
			};
		},

		onUnderReviewSelect: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("home");
			var bSelected = oEvent.getParameter("selected");
			var sReviewKey = oCtx && oCtx.getProperty("reviewKey");
			if (!oCtx || !sReviewKey) {
				return;
			}
			if (!bSelected) {
				ReviewStore.clearReview(sReviewKey);
				oCtx.getModel().setProperty(oCtx.getPath() + "/underReview", false);
				oCtx.getModel().setProperty(oCtx.getPath() + "/reviewDescription", "");
				return;
			}
			this._openReviewDialog(oCtx);
		},

		_openReviewDialog: function (oCtx) {
			var oModel = oCtx.getModel();
			var sPath = oCtx.getPath();
			var sExisting = oCtx.getProperty("reviewDescription") || "";
			var oTextArea = new TextArea({
				width: "100%",
				rows: 6,
				value: sExisting,
				placeholder: this.getText("underReviewDescriptionPlaceholder")
			});
			var oDialog = new Dialog({
				title: this.getText("underReviewDialogTitle"),
				contentWidth: "32rem",
				content: [oTextArea],
				beginButton: new Button({
					text: this.getText("save"),
					type: "Emphasized",
					press: function () {
						var sDescription = (oTextArea.getValue() || "").trim();
						if (!sDescription) {
							MessageToast.show(this.getText("underReviewDescriptionRequired"));
							return;
						}
						ReviewStore.setReview(oCtx.getProperty("reviewKey"), sDescription);
						oModel.setProperty(sPath + "/underReview", true);
						oModel.setProperty(sPath + "/reviewDescription", sDescription);
						oDialog.close();
					}.bind(this)
				}),
				endButton: new Button({
					text: this.getText("close"),
					press: function () {
						if (!sExisting) {
							oModel.setProperty(sPath + "/underReview", false);
						}
						oDialog.close();
					}
				}),
				afterClose: function () {
					oDialog.destroy();
				}
			});
			this.getView().addDependent(oDialog);
			oDialog.open();
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
		},

		onExit: function () {
			if (this._oReviewDialog) {
				this._oReviewDialog.destroy();
				this._oReviewDialog = null;
			}
		}
	});
});
