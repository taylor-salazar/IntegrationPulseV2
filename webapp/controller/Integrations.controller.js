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
			this.setModel(new JSONModel({ items: [] }), "selectedIntegrations");
			this.setModel(new JSONModel({
				viewMode: "cards",
				groupBy: "sender",
				isGroupSelected: false,
				selectedGroupKey: "",
				selectedGroupTitle: "",
				isMock: BackendClient.isMock(),
				busy: false,
				deployingId: ""
			}), "view");
			this._aAllItems = [];
			this._sSearchQuery = "";

			this.getRouter().getRoute("integrations").attachPatternMatched(this._onMatched, this);
		},

		_onMatched: function () {
			if (this._aAllItems.length) {
				this._applyGrouping();
				return;
			}
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
			var oViewModel = this.getModel("view");
			var sGroupBy = oViewModel.getProperty("/groupBy") || "sender";
			var sSelectedGroupKey = oViewModel.getProperty("/selectedGroupKey");
			var aFiltered = this._aAllItems.filter(function (oItem) {
				return this._matchesSearch(oItem, this._sSearchQuery);
			}.bind(this));
			var aGroups = this._groupItems(aFiltered, sGroupBy);
			var oSelectedGroup = sSelectedGroupKey && aGroups.filter(function (oGroup) {
				return oGroup.key === sSelectedGroupKey;
			})[0];

			this.getModel("integrations").setProperty("/items", aFiltered);
			this.getModel("integrationGroups").setProperty("/groups", aGroups);
			this.getModel("selectedIntegrations").setProperty("/items", oSelectedGroup ? oSelectedGroup.items : []);

			if (sSelectedGroupKey && !oSelectedGroup) {
				oViewModel.setProperty("/isGroupSelected", false);
				oViewModel.setProperty("/selectedGroupKey", "");
				oViewModel.setProperty("/selectedGroupTitle", "");
				this._showCategoryOverview();
			} else if (oSelectedGroup) {
				oViewModel.setProperty(
					"/selectedGroupTitle",
					oSelectedGroup.title + " (" + oSelectedGroup.count + ")"
				);
			}
		},

		onRefresh: function () {
			this._loadData();
		},

		onViewModeChange: function (oEvent) {
			this.getModel("view").setProperty("/viewMode", oEvent.getParameter("item").getKey());
		},

		onGroupByChange: function (oEvent) {
			var oViewModel = this.getModel("view");
			oViewModel.setProperty("/groupBy", oEvent.getParameter("item").getKey());
			oViewModel.setProperty("/isGroupSelected", false);
			oViewModel.setProperty("/selectedGroupKey", "");
			oViewModel.setProperty("/selectedGroupTitle", "");
			this._applyGrouping();
			this._showCategoryOverview();
		},

		onSearch: function (oEvent) {
			this._sSearchQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
			this._applyGrouping();
		},

		onOpenGroup: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("integrationGroups");
			var oViewModel = this.getModel("view");
			if (!oCtx) {
				return;
			}
			oViewModel.setProperty("/isGroupSelected", true);
			oViewModel.setProperty("/selectedGroupKey", oCtx.getProperty("key"));
			oViewModel.setProperty(
				"/selectedGroupTitle",
				oCtx.getProperty("title") + " (" + oCtx.getProperty("count") + ")"
			);
			this.getModel("selectedIntegrations").setProperty("/items", oCtx.getProperty("items") || []);
			this.byId("integrationCategoryNav").to(this.byId("categoryDetailPage"));
		},

		onBackToGroups: function () {
			var oViewModel = this.getModel("view");
			oViewModel.setProperty("/isGroupSelected", false);
			oViewModel.setProperty("/selectedGroupKey", "");
			oViewModel.setProperty("/selectedGroupTitle", "");
			this.getModel("selectedIntegrations").setProperty("/items", []);
			this._showCategoryOverview();
		},

		_showCategoryOverview: function () {
			var oNav = this.byId("integrationCategoryNav");
			var oOverviewPage = this.byId("categoryOverviewPage");
			if (oNav && oOverviewPage && oNav.getCurrentPage() !== oOverviewPage) {
				oNav.backToPage(oOverviewPage.getId());
			}
		},

		_getIntegrationContext: function (oSource) {
			var aModelNames = ["selectedIntegrations", "integrationGroups", "integrations"];
			var oControl = oSource;
			while (oControl) {
				for (var i = 0; i < aModelNames.length; i += 1) {
					var oCtx = oControl.getBindingContext && oControl.getBindingContext(aModelNames[i]);
					if (oCtx && oCtx.getProperty("id")) {
						return oCtx;
					}
				}
				oControl = oControl.getParent && oControl.getParent();
			}
			return null;
		},

		_getIntegrationIdFromCustomData: function (oSource) {
			var oControl = oSource;
			while (oControl) {
				if (oControl.data && oControl.data("integrationId")) {
					return oControl.data("integrationId");
				}
				oControl = oControl.getParent && oControl.getParent();
			}
			return "";
		},

		onOpenIntegration: function (oEvent) {
			var oCtx = this._getIntegrationContext(oEvent.getSource());
			var sId = oCtx ? oCtx.getProperty("id") : this._getIntegrationIdFromCustomData(oEvent.getSource());
			if (sId) {
				this.navTo("integrationDetail", { id: sId });
			}
		},

		onDeployFromCard: function (oEvent) {
			var oCtx = this._getIntegrationContext(oEvent.getSource());
			var sId = oCtx ? oCtx.getProperty("id") : this._getIntegrationIdFromCustomData(oEvent.getSource());
			var oIntegration = oCtx ? oCtx.getObject() : this._aAllItems.filter(function (oItem) {
				return oItem.id === sId;
			})[0];
			if (!oIntegration) {
				return;
			}

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
