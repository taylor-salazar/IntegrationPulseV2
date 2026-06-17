sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, BackendClient, MessageToast, MessageBox) {
	"use strict";

	return BaseController.extend("integrationpulse.controller.Integrations", {

		onInit: function () {
			this.setModel(new JSONModel({ items: [] }), "integrations");
			this.setModel(new JSONModel({ groups: [] }), "integrationGroups");
			this.setModel(new JSONModel({
				viewMode: "cards",
				groupBy: "sender",
				isMock: BackendClient.isMock(),
				busy: false,
				deployingId: ""
			}), "view");
			this._aAllItems = [];
			this._sSearchQuery = "";

			this.getRouter().getRoute("integrations").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			var oData = this.getModel("integrations");
			this.getView().setBusy(true);
			BackendClient.getIntegrations().then(function (aItems) {
				this._aAllItems = this._prepareRuntimeArtifacts(this._filterRuntimeArtifacts(aItems));
				oData.setProperty("/items", this._aAllItems);
				this._applyGrouping();
				this.getView().setBusy(false);
			}.bind(this)).catch(function (oErr) {
				this.getView().setBusy(false);
				MessageToast.show("Failed to load integrations: " + oErr.message);
			}.bind(this));
		},

		_filterRuntimeArtifacts: function (aItems) {
			var aExcludedStatuses = ["UNDEPLOYED", "NOT_DEPLOYED", "NOT DEPLOYED", "DRAFT"];
			var aRuntimeStatuses = ["STARTED", "STOPPED", "STARTING", "ERROR", "DEPLOYING"];
			return (aItems || []).filter(function (oItem) {
				var sStatus = String(oItem.status || oItem.deploymentStatus || "").toUpperCase();
				if (aExcludedStatuses.indexOf(sStatus) !== -1) {
					return false;
				}
				return aRuntimeStatuses.indexOf(sStatus) !== -1 || !!oItem.lastDeployed;
			});
		},

		_formatSystemName: function (sValue) {
			var sName = String(sValue || "").trim();
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
				return "";
			}
			return sName
				.replace(/[_-]+/g, " ")
				.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
				.replace(/\s+/g, " ")
				.split(" ")
				.map(function (sPart) {
					var sUpper = sPart.toUpperCase();
					if (mAcronyms[sUpper]) {
						return sUpper;
					}
					return sPart.charAt(0).toUpperCase() + sPart.slice(1);
				})
				.join(" ");
		},

		_prepareRuntimeArtifacts: function (aItems) {
			var sUnknown = this.getText("unknownSystem");
			return (aItems || []).map(function (oItem) {
				oItem.senderDisplay = this._formatSystemName(oItem.sender) || sUnknown;
				oItem.receiverDisplay = this._formatSystemName(oItem.receiver) || sUnknown;
				oItem.routeText = oItem.senderDisplay + " -> " + oItem.receiverDisplay;
				return oItem;
			}.bind(this));
		},

		_groupItems: function (aItems, sGroupBy) {
			var mGroups = {};
			var sFallback = this.getText("unknownSystem");
			(aItems || []).forEach(function (oItem) {
				var sGroup = sGroupBy === "receiver" ? oItem.receiverDisplay : oItem.senderDisplay;
				var bUnknown = sGroup === sFallback;
				if (!mGroups[sGroup]) {
					mGroups[sGroup] = {
						key: sGroup,
						title: sGroup,
						count: 0,
						expanded: !bUnknown,
						isUnknown: bUnknown,
						items: []
					};
				}
				mGroups[sGroup].items.push(oItem);
				mGroups[sGroup].count += 1;
			});
			return Object.keys(mGroups).sort(function (a, b) {
				if (mGroups[a].isUnknown !== mGroups[b].isUnknown) {
					return mGroups[a].isUnknown ? 1 : -1;
				}
				return a.localeCompare(b);
			}).map(function (sKey) {
				mGroups[sKey].items.sort(function (a, b) {
					return String(a.name || "").localeCompare(String(b.name || ""));
				});
				return mGroups[sKey];
			});
		},

		_matchesSearch: function (oItem, sQuery) {
			if (!sQuery) {
				return true;
			}
			var sNeedle = sQuery.toLowerCase();
			return [
				oItem.name,
				oItem.packageName,
				oItem.id,
				oItem.sender,
				oItem.receiver,
				oItem.senderDisplay,
				oItem.receiverDisplay
			].some(function (sValue) {
				return String(sValue || "").toLowerCase().indexOf(sNeedle) > -1;
			});
		},

		_applyGrouping: function () {
			var sGroupBy = this.getModel("view").getProperty("/groupBy") || "sender";
			var aFiltered = this._aAllItems.filter(function (oItem) {
				return this._matchesSearch(oItem, this._sSearchQuery);
			}.bind(this));
			this.getModel("integrations").setProperty("/items", aFiltered);
			this.getModel("integrationGroups").setProperty("/groups", this._groupItems(aFiltered, sGroupBy));
		},

		onRefresh: function () {
			this._loadData();
		},

		onViewModeChange: function (oEvent) {
			this.getModel("view").setProperty("/viewMode", oEvent.getParameter("item").getKey());
		},

		onGroupByChange: function (oEvent) {
			this.getModel("view").setProperty("/groupBy", oEvent.getParameter("item").getKey());
			this._applyGrouping();
		},

		onSearch: function (oEvent) {
			this._sSearchQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
			this._applyGrouping();
		},

		onOpenIntegration: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("integrationGroups") ||
				oEvent.getSource().getBindingContext("integrations");
			if (!oCtx) {
				return;
			}
			this.navTo("integrationDetail", { id: oCtx.getProperty("id") });
		},

		onDeployFromCard: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("integrationGroups") ||
				oEvent.getSource().getBindingContext("integrations");
			if (!oCtx) {
				return;
			}

			var oIntegration = oCtx.getObject();
			MessageBox.confirm(this.getText("quickDeployConfirmText", [oIntegration.name]), {
				title: this.getText("deployConfirmTitle"),
				icon: MessageBox.Icon.WARNING,
				actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.OK,
				onClose: function (sAction) {
					if (sAction === MessageBox.Action.OK) {
						this._deployFromCard(oIntegration);
					}
				}.bind(this)
			});
		},

		_deployFromCard: function (oIntegration) {
			var oViewModel = this.getModel("view");
			oViewModel.setProperty("/deployingId", oIntegration.id);
			MessageToast.show(this.getText("deployStarted", [oIntegration.name]));

			BackendClient.deployIntegration(oIntegration.id, []).then(function (oRes) {
				oViewModel.setProperty("/deployingId", "");
				this._updateIntegrationStatus(oIntegration.id, oRes && oRes.status);
				MessageBox.success(this.getText("deploySuccess", [oIntegration.name]));
			}.bind(this)).catch(function (oErr) {
				oViewModel.setProperty("/deployingId", "");
				MessageBox.error(this.getText("deployError", [oErr.message]));
			}.bind(this));
		},

		_updateIntegrationStatus: function (sId, sStatus) {
			if (!sStatus) {
				return;
			}
			this._aAllItems.some(function (oItem) {
				if (oItem.id === sId) {
					oItem.status = sStatus;
					return true;
				}
				return false;
			});
			this._applyGrouping();
		}
	});
});
