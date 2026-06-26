sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"integrationpulse/service/ReviewStore",
	"sap/ui/core/Fragment",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, BackendClient, ReviewStore, Fragment, MessageToast, MessageBox) {
	"use strict";

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

	function visibleMessageLogs(aLogs) {
		return (aLogs || []).filter(function (oLog) {
			return String(oLog && oLog.status || "").toUpperCase() !== "DISCARDED";
		});
	}

	return BaseController.extend("integrationpulse.controller.MonitoringDetail", {

		onInit: function () {
			this.setModel(new JSONModel({}), "monitoringItem");
			this.setModel(new JSONModel({ items: [] }), "logs");
			this.setModel(new JSONModel({}), "payloadDetail");
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
			this.getRouter().getRoute("monitoringSystemDetail").attachPatternMatched(this._onSystemMatched, this);
		},

		_onMatched: function (oEvent) {
			this._sId = oEvent.getParameter("arguments").id;
			this._sMode = "";
			this._sSystem = "";
			this._load();
		},

		_onSystemMatched: function (oEvent) {
			var mArgs = oEvent.getParameter("arguments") || {};
			this._sId = "";
			this._sMode = mArgs.mode || "source";
			this._sSystem = decodeURIComponent(mArgs.system || "");
			this._loadSystem();
		},

		_load: function () {
			var that = this;
			this.getModel("monDetailView").setProperty("/busy", true);
			Promise.all([
				BackendClient.getMonitoringItem(this._sId),
				BackendClient.getMessageLogs(this._sId),
				BackendClient.getPayloads(this._sId).catch(function () { return []; })
			]).then(function (aRes) {
				that.getModel("monitoringItem").setData(aRes[0] || {});
				var aLogs = that._attachPayloads(visibleMessageLogs(aRes[1] || []), aRes[2] || [], aRes[0] || {});
				that.getModel("logs").setProperty("/items", aLogs);
				that._summarizeLogs(aLogs);
				that.getModel("monDetailView").setProperty("/busy", false);
			}).catch(function (oErr) {
				that.getModel("monDetailView").setProperty("/busy", false);
				MessageToast.show("Failed to load logs: " + oErr.message);
			});
		},

		_loadSystem: function () {
			var that = this;
			this.getModel("monDetailView").setProperty("/busy", true);
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
				var aSelected = aIntegrations.filter(function (oIntegration) {
					var sSystem = that._sMode === "target" ?
						formatSystemName(oIntegration.receiver, sUnknown) :
						formatSystemName(oIntegration.sender, sUnknown);
					return sSystem === that._sSystem;
				});
				var aItems = aSelected.map(function (oIntegration) {
					return Object.assign({}, mRuntimeById[oIntegration.id] || {}, oIntegration);
				});
				return Promise.all(aItems.map(function (oItem) {
					return Promise.all([
						BackendClient.getMessageLogs(oItem.id).catch(function () { return []; }),
						BackendClient.getPayloads(oItem.id).catch(function () { return []; })
					]).then(function (aLogPayloads) {
						var aLogs = that._attachPayloads(visibleMessageLogs(aLogPayloads[0] || []), aLogPayloads[1] || [], oItem);
						return aLogs.map(function (oLog) {
							return Object.assign({}, oLog, {
								integrationId: oItem.id,
								integrationName: oItem.name
							});
						});
					});
				})).then(function (aLogGroups) {
					var aLogs = visibleMessageLogs(Array.prototype.concat.apply([], aLogGroups));
					that.getModel("monitoringItem").setData({
						id: that._sMode + ":" + that._sSystem,
						name: that._sSystem,
						status: that._systemStatus(aLogs, aItems),
						endpoint: aItems.length + " " + that.getText("integrationsCategoryFooter")
					});
					that.getModel("logs").setProperty("/items", aLogs);
					that._summarizeLogs(aLogs);
					that.getModel("monDetailView").setProperty("/busy", false);
				});
			}).catch(function (oErr) {
				that.getModel("monDetailView").setProperty("/busy", false);
				MessageToast.show("Failed to load logs: " + oErr.message);
			});
		},

		_systemStatus: function (aLogs, aItems) {
			if ((aLogs || []).some(function (oLog) { return String(oLog.status || "").toUpperCase() === "FAILED"; }) ||
					(aItems || []).some(function (oItem) { return String(oItem.status || "").toUpperCase() === "ERROR"; })) {
				return "ERROR";
			}
			if ((aLogs || []).some(function (oLog) {
					return ["RETRY", "PROCESSING"].indexOf(String(oLog.status || "").toUpperCase()) > -1;
				}) || (aItems || []).some(function (oItem) {
					return ["STARTING", "DEPLOYING", "STOPPED"].indexOf(String(oItem.status || "").toUpperCase()) > -1;
				})) {
				return "WARNING";
			}
			return "STARTED";
		},

		_attachPayloads: function (aLogs, aPayloads, oIntegration) {
			var mPayloadByMessageId = {};
			(aPayloads || []).forEach(function (oPayload) {
				if (oPayload.messageId && !mPayloadByMessageId[oPayload.messageId]) {
					mPayloadByMessageId[oPayload.messageId] = oPayload;
				}
			});
			return (aLogs || []).map(function (oLog) {
				var oPayload = mPayloadByMessageId[oLog.messageId];
				return Object.assign({}, oLog, {
					integrationId: oLog.integrationId || oIntegration.id,
					integrationName: oLog.integrationName || oIntegration.name,
					payload: oPayload || null,
					payloadId: oPayload && oPayload.id,
					hasPayload: !!oPayload,
					resultText: oPayload ? this.getText("viewResults") : "",
					resolvable: String(oLog.status || "").toUpperCase() === "FAILED" && !!oLog.messageId,
					resolved: ReviewStore.isResolved(oLog.messageId)
				});
			}.bind(this));
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
			if (this._sSystem) {
				this._loadSystem();
			} else {
				this._load();
			}
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

		onResolvedSelect: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("logs");
			if (!oCtx) {
				return;
			}
			var sMessageId = oCtx.getProperty("messageId");
			var bResolved = oEvent.getParameter("selected");
			ReviewStore.setResolved(sMessageId, bResolved);
			oCtx.getModel().setProperty(oCtx.getPath() + "/resolved", bResolved);
		},

		onOpenPayloadResult: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("logs");
			var oPayload = oCtx && oCtx.getProperty("payload");
			if (!oPayload) {
				return;
			}
			if (oPayload.downloadOnly || !oPayload.previewAvailable) {
				this.getModel("payloadDetail").setData(Object.assign({}, oPayload, {
					formattedPayload: this.getText("payloadTooLarge")
				}));
				this._openPayloadDialog();
				return;
			}
			BackendClient.getPayload(oPayload.id).then(function (oDetail) {
				if (!oDetail) {
					MessageToast.show(this.getText("payloadNotFound"));
					return;
				}
				oDetail.formattedPayload = this._formatPayload(oDetail.payload, oDetail.contentType);
				this.getModel("payloadDetail").setData(oDetail);
				this._openPayloadDialog();
			}.bind(this)).catch(function (oErr) {
				MessageToast.show(this.getText("payloadLoadFailed", [oErr.message]));
			}.bind(this));
		},

		onDownloadPayload: function () {
			var sId = this.getModel("payloadDetail").getProperty("/id");
			if (sId) {
				window.open(BackendClient.getPayloadDownloadUrl(sId), "_blank", "noopener");
			}
		},

		onClosePayloadDialog: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.close();
			}
		},

		_openPayloadDialog: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.open();
				return;
			}
			Fragment.load({
				id: this.getView().getId(),
				name: "integrationpulse.view.PayloadDialog",
				controller: this
			}).then(function (oDialog) {
				this._oPayloadDialog = oDialog;
				this.getView().addDependent(oDialog);
				oDialog.open();
			}.bind(this));
		},

		_formatPayload: function (sPayload, sContentType) {
			if (!sPayload) {
				return "";
			}
			if ((sContentType || "").indexOf("json") > -1) {
				try {
					return JSON.stringify(JSON.parse(sPayload), null, 2);
				} catch (e) {
					return sPayload;
				}
			}
			return sPayload;
		},

		onNavBack: function () {
			this.navTo("monitoring");
		},

		onExit: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.destroy();
				this._oPayloadDialog = null;
			}
		}
	});
});
