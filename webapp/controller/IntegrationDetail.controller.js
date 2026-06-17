sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/ui/core/Fragment",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, BackendClient, Fragment, MessageToast, MessageBox) {
	"use strict";

	// Human labels for the enterprise parameter group prefixes.
	var GROUP_LABELS = {
		extract: "Extract",
		filter: "Filter",
		include: "Include",
		delivery: "Delivery",
		audit: "Audit",
		sftp: "SFTP",
		general: "General"
	};

	return BaseController.extend("integrationpulse.controller.IntegrationDetail", {

		onInit: function () {
			this.setModel(new JSONModel({}), "integration");
			this.setModel(new JSONModel({ groups: [] }), "parameters");
			this.setModel(new JSONModel({ items: [] }), "payloads");
			this.setModel(new JSONModel({}), "payloadDetail");
			this.setModel(new JSONModel({ busy: false, dirty: false }), "detailView");

			this.getRouter().getRoute("integrationDetail").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function (oEvent) {
			this._sId = oEvent.getParameter("arguments").id;
			this._load();
		},

		_load: function () {
			var that = this;
			this.getModel("detailView").setProperty("/dirty", false);
			this.getView().setModel(this.getModel("detailView"));
			this.getModel("detailView").setProperty("/busy", true);

			Promise.all([
				BackendClient.getIntegration(this._sId),
				BackendClient.getConfigurations(this._sId),
				BackendClient.getPayloads(this._sId)
			]).then(function (aRes) {
				var oIntegration = aRes[0] || {};
				var aConfigs = aRes[1] || [];
				var aPayloads = aRes[2] || [];
				that.getModel("integration").setData(oIntegration);
				that.getModel("parameters").setData({ groups: that._groupParams(aConfigs) });
				that.getModel("payloads").setProperty("/items", aPayloads);
				that.getModel("detailView").setProperty("/busy", false);
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show("Failed to load configuration: " + oErr.message);
			});
		},

		/**
		 * Groups a flat parameter list by its prefix (extract.* / sftp.* ...).
		 * Keeps a pristine copy on each param for reset / dirty detection.
		 */
		_groupParams: function (aConfigs) {
			var mGroups = {};
			aConfigs.forEach(function (oParam) {
				var sPrefix = (oParam.key.indexOf(".") > -1) ? oParam.key.split(".")[0] : "general";
				var sGroupName = GROUP_LABELS[sPrefix] || (sPrefix.charAt(0).toUpperCase() + sPrefix.slice(1));
				if (!mGroups[sPrefix]) {
					mGroups[sPrefix] = { name: sGroupName, prefix: sPrefix, params: [] };
				}
				mGroups[sPrefix].params.push({
					key: oParam.key,
					label: oParam.label || oParam.key,
					value: oParam.value !== undefined ? oParam.value : "",
					pristineValue: oParam.value !== undefined ? oParam.value : "",
					defaultValue: oParam.defaultValue || "",
					dataType: oParam.dataType || "xsd:string",
					secure: !!oParam.secure,
					readOnly: !!oParam.readOnly
				});
			});
			// Stable, business-friendly order.
			var aOrder = ["extract", "filter", "include", "delivery", "audit", "sftp", "general"];
			return Object.keys(mGroups).sort(function (a, b) {
				var ia = aOrder.indexOf(a); var ib = aOrder.indexOf(b);
				return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
			}).map(function (k) { return mGroups[k]; });
		},

		_collectParams: function () {
			var aOut = [];
			(this.getModel("parameters").getProperty("/groups") || []).forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					aOut.push({ key: oParam.key, value: oParam.value });
				});
			});
			return aOut;
		},

		_recomputeDirty: function () {
			var bDirty = false;
			(this.getModel("parameters").getProperty("/groups") || []).forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					if (oParam.value !== oParam.pristineValue) {
						bDirty = true;
					}
				});
			});
			this.getModel("detailView").setProperty("/dirty", bDirty);
		},

		onParamChange: function () {
			this._recomputeDirty();
		},

		onReset: function () {
			var oModel = this.getModel("parameters");
			var aGroups = oModel.getProperty("/groups") || [];
			aGroups.forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					oParam.value = oParam.pristineValue;
				});
			});
			oModel.setProperty("/groups", aGroups);
			this.getModel("detailView").setProperty("/dirty", false);
		},

		onSaveDraft: function () {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			BackendClient.updateConfigurations(this._sId, this._collectParams()).then(function () {
				// Saved values become the new pristine baseline.
				var oModel = that.getModel("parameters");
				var aGroups = oModel.getProperty("/groups") || [];
				aGroups.forEach(function (oGroup) {
					oGroup.params.forEach(function (oParam) { oParam.pristineValue = oParam.value; });
				});
				oModel.setProperty("/groups", aGroups);
				that.getModel("detailView").setProperty("/dirty", false);
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show(that.getText("save") + " ✓");
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show("Save failed: " + oErr.message);
			});
		},

		onDeploy: function () {
			var that = this;
			var sName = this.getModel("integration").getProperty("/name");
			MessageBox.confirm(this.getText("deployConfirmText", [sName]), {
				title: this.getText("deployConfirmTitle"),
				icon: MessageBox.Icon.WARNING,
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						that._doDeploy(sName);
					}
				}
			});
		},

		_doDeploy: function (sName) {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			MessageToast.show(this.getText("deployStarted", [sName]));
			BackendClient.deployIntegration(this._sId, this._collectParams()).then(function (oRes) {
				that.getModel("detailView").setProperty("/busy", false);
				that.getModel("detailView").setProperty("/dirty", false);
				// Saved values become pristine after a successful deploy.
				var oModel = that.getModel("parameters");
				var aGroups = oModel.getProperty("/groups") || [];
				aGroups.forEach(function (oGroup) {
					oGroup.params.forEach(function (oParam) { oParam.pristineValue = oParam.value; });
				});
				oModel.setProperty("/groups", aGroups);
				if (oRes && oRes.status) {
					that.getModel("integration").setProperty("/status", oRes.status);
				}
				MessageBox.success(that.getText("deploySuccess", [sName]));
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.error(that.getText("deployError", [oErr.message]));
			});
		},

		onOpenPayload: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("payloads");
			var oPayload = oCtx && oCtx.getObject();
			if (!oPayload) {
				return;
			}
			if (oPayload.downloadOnly || !oPayload.previewAvailable) {
				window.open(BackendClient.getPayloadDownloadUrl(oPayload.id), "_blank", "noopener");
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
			this.navTo("integrations");
		},

		onExit: function () {
			if (this._oPayloadDialog) {
				this._oPayloadDialog.destroy();
				this._oPayloadDialog = null;
			}
		}
	});
});
