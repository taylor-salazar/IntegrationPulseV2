sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"integrationpulse/service/BackendClient",
	"sap/m/MessageToast",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, FilterOperator, BackendClient, MessageToast, MessageBox) {
	"use strict";

	return BaseController.extend("integrationpulse.controller.Integrations", {

		onInit: function () {
			this.setModel(new JSONModel({ items: [] }), "integrations");
			this.setModel(new JSONModel({
				viewMode: "cards",
				isMock: BackendClient.isMock(),
				busy: false,
				deployingId: ""
			}), "view");

			this.getRouter().getRoute("integrations").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			this._loadData();
		},

		_loadData: function () {
			var oData = this.getModel("integrations");
			this.getView().setBusy(true);
			BackendClient.getIntegrations().then(function (aItems) {
				oData.setProperty("/items", this._filterRuntimeArtifacts(aItems));
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

		onRefresh: function () {
			this._loadData();
		},

		onViewModeChange: function (oEvent) {
			this.getModel("view").setProperty("/viewMode", oEvent.getParameter("item").getKey());
		},

		onSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
			var aFilters = [];
			if (sQuery) {
				aFilters.push(new Filter({
					filters: [
						new Filter("name", FilterOperator.Contains, sQuery),
						new Filter("packageName", FilterOperator.Contains, sQuery),
						new Filter("id", FilterOperator.Contains, sQuery)
					],
					and: false
				}));
			}
			// Apply to whichever aggregation is visible.
			var oTable = this.byId("integrationsTable");
			if (oTable && oTable.getBinding("items")) {
				oTable.getBinding("items").filter(aFilters);
			}
			var oGrid = this.byId("cardsContainer");
			if (oGrid && oGrid.getBinding("items")) {
				oGrid.getBinding("items").filter(aFilters);
			}
		},

		onOpenIntegration: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("integrations");
			this.navTo("integrationDetail", { id: oCtx.getProperty("id") });
		},

		onDeployFromCard: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("integrations");
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
			var oModel = this.getModel("integrations");
			var aItems = oModel.getProperty("/items") || [];
			aItems.some(function (oItem, iIndex) {
				if (oItem.id === sId) {
					oModel.setProperty("/items/" + iIndex + "/status", sStatus);
					return true;
				}
				return false;
			});
		}
	});
});
