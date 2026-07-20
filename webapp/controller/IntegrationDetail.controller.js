sap.ui.define([
	"integrationpulse/controller/BaseController",
	"sap/ui/model/json/JSONModel",
	"integrationpulse/service/BackendClient",
	"sap/ui/core/Fragment",
	"sap/ui/core/Item",
	"sap/m/Button",
	"sap/m/CheckBox",
	"sap/m/Dialog",
	"sap/m/HBox",
	"sap/m/Input",
	"sap/m/Label",
	"sap/m/Link",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"sap/m/MultiComboBox",
	"sap/m/ProgressIndicator",
	"sap/m/Select",
	"sap/m/Text",
	"sap/m/TextArea",
	"sap/m/VBox"
], function (
	BaseController,
	JSONModel,
	BackendClient,
	Fragment,
	Item,
	Button,
	CheckBox,
	Dialog,
	HBox,
	Input,
	Label,
	Link,
	MessageToast,
	MessageBox,
	MultiComboBox,
	ProgressIndicator,
	Select,
	Text,
	TextArea,
	VBox
) {
	"use strict";

	// Integration Detail controller: lets a user inspect one deployed
	// integration, edit supported externalized parameters, save configuration
	// changes, redeploy the integration, or trigger its separate HTTPS sender
	// endpoint for an immediate run without touching timer parameters.

	// Human labels for the enterprise parameter group prefixes.
	var GROUP_LABELS = {
		pulse: "Pulse",
		extract: "Extract",
		filter: "Filter",
		include: "Include",
		delivery: "Delivery",
		audit: "Audit",
		sftp: "SFTP",
		general: "General"
	};

	function pad2(v) {
		return String(Number(v) || 0).padStart(2, "0");
	}

	function cronStartValue(sField, sFallback) {
		if (!sField || sField === "*" || sField === "?") {
			return sFallback;
		}
		return String(sField).split("/")[0].split(",")[0];
	}

	function ordinal(i) {
		var j = i % 10;
		var k = i % 100;
		if (j === 1 && k !== 11) { return i + "st"; }
		if (j === 2 && k !== 12) { return i + "nd"; }
		if (j === 3 && k !== 13) { return i + "rd"; }
		return i + "th";
	}

	function range(iStart, iEnd, fnLabel) {
		var aItems = [];
		for (var i = iStart; i <= iEnd; i += 1) {
			aItems.push({ key: String(i), text: fnLabel ? fnLabel(i) : String(i) });
		}
		return aItems;
	}

	var MONTHS = [
		{ key: "JAN", text: "January" },
		{ key: "FEB", text: "February" },
		{ key: "MAR", text: "March" },
		{ key: "APR", text: "April" },
		{ key: "MAY", text: "May" },
		{ key: "JUN", text: "June" },
		{ key: "JUL", text: "July" },
		{ key: "AUG", text: "August" },
		{ key: "SEP", text: "September" },
		{ key: "OCT", text: "October" },
		{ key: "NOV", text: "November" },
		{ key: "DEC", text: "December" }
	];

	var WEEKDAYS = [
		{ key: "MON", text: "Monday" },
		{ key: "TUE", text: "Tuesday" },
		{ key: "WED", text: "Wednesday" },
		{ key: "THU", text: "Thursday" },
		{ key: "FRI", text: "Friday" },
		{ key: "SAT", text: "Saturday" },
		{ key: "SUN", text: "Sunday" }
	];

	var SF_SELECT_FIELDS = [
		{ key: "userId", text: "Employee ID" },
		{ key: "personIdExternal", text: "Person ID" },
		{ key: "firstName", text: "First name" },
		{ key: "lastName", text: "Last name" },
		{ key: "displayName", text: "Display name" },
		{ key: "email", text: "Email" },
		{ key: "company", text: "Company" },
		{ key: "businessUnit", text: "Business unit" },
		{ key: "division", text: "Division" },
		{ key: "department", text: "Department" },
		{ key: "location", text: "Location" },
		{ key: "jobCode", text: "Job code" },
		{ key: "jobTitle", text: "Job title" },
		{ key: "managerId", text: "Manager ID" },
		{ key: "emplStatus", text: "Employment status" },
		{ key: "employeeClass", text: "Employee class" },
		{ key: "employmentType", text: "Employment type" },
		{ key: "payGrade", text: "Pay grade" },
		{ key: "event", text: "Event" },
		{ key: "eventReason", text: "Event reason" },
		{ key: "startDate", text: "Start date" },
		{ key: "endDate", text: "End date" },
		{ key: "lastModifiedDateTime", text: "Last modified date/time" }
	];

	var mCommonSelectFields = SF_SELECT_FIELDS.reduce(function (mFields, oField) {
		mFields[oField.key] = true;
		return mFields;
	}, {});

	var FILTER_OPERATIONS = [
		{ key: "eq", text: "is equal to" },
		{ key: "ne", text: "is not equal to" },
		{ key: "gt", text: "is greater than" },
		{ key: "ge", text: "is greater than or equal to" },
		{ key: "lt", text: "is less than" },
		{ key: "le", text: "is less than or equal to" },
		{ key: "in", text: "is contained in" },
		{ key: "contains", text: "is like" },
		{ key: "startswith", text: "starts with" },
		{ key: "notstartswith", text: "does not start with" },
		{ key: "endswith", text: "ends with" },
		{ key: "notendswith", text: "does not end with" },
		{ key: "toupper_eq", text: "to upper case is equal to" },
		{ key: "tolower_eq", text: "to lower case is equal to" },
		{ key: "trim_eq", text: "trim is equal to" }
	];

	function stripNamespace(sName) {
		return String(sName || "").split(".").pop();
	}

	function xmlAttr(sTag, sName) {
		var oMatch = new RegExp("\\b" + sName + "\\s*=\\s*(['\"])(.*?)\\1", "i").exec(sTag || "");
		return oMatch ? oMatch[2] : "";
	}

	var EDMX_OPTIONS_CACHE_KEY = "integrationPulse.edmxOptions.v2";
	var mEdmxOptionsCache = {};

	function loadEdmxOptionsCache() {
		try {
			mEdmxOptionsCache = JSON.parse(window.localStorage.getItem(EDMX_OPTIONS_CACHE_KEY) || "{}") || {};
		} catch (e) {
			mEdmxOptionsCache = {};
		}
	}

	function persistEdmxOptionsCache() {
		try {
			window.localStorage.setItem(EDMX_OPTIONS_CACHE_KEY, JSON.stringify(mEdmxOptionsCache));
		} catch (e) {
			// Large tenant metadata can produce many options. The in-memory cache still helps
			// during this browser session if persistent storage is full or unavailable.
		}
	}

	loadEdmxOptionsCache();

	return BaseController.extend("integrationpulse.controller.IntegrationDetail", {

		onInit: function () {
			// integration: selected artifact details
			// parameters: grouped editable externalized parameters
			// payloads/payloadDetail: captured result payload previews
			// scheduleOptions: static select options for timer-like parameters
			// detailView: UI-only state such as busy/dirty
			this.setModel(new JSONModel({}), "integration");
			this.setModel(new JSONModel({ groups: [] }), "parameters");
			this.setModel(new JSONModel({ items: [] }), "payloads");
			this.setModel(new JSONModel({}), "payloadDetail");
			this.setModel(new JSONModel(this._createScheduleOptions()), "scheduleOptions");
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
				BackendClient.getConfigurations(this._sId)
			]).then(function (aRes) {
				var oIntegration = aRes[0] || {};
				var aConfigs = aRes[1] || [];
				that.getModel("integration").setData(oIntegration);
				that.getModel("parameters").setData({ groups: that._groupParams(aConfigs) });
				that.getModel("detailView").setProperty("/busy", false);
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageToast.show("Failed to load configuration: " + oErr.message);
			});
		},

		_loadPayloads: function () {
			BackendClient.getPayloads(this._sId).then(function (aPayloads) {
				this.getModel("payloads").setProperty("/items", aPayloads || []);
			}.bind(this)).catch(function () {
				this.getModel("payloads").setProperty("/items", []);
			}.bind(this));
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
					readOnly: !!oParam.readOnly,
					isTimer: this._isTimerParam(oParam),
					schedule: this._scheduleFromCron(oParam.value || oParam.defaultValue || "")
				});
			}.bind(this));
			// Stable, business-friendly order.
			var aOrder = ["pulse", "extract", "filter", "include", "delivery", "audit", "sftp", "general"];
			return Object.keys(mGroups).sort(function (a, b) {
				var ia = aOrder.indexOf(a); var ib = aOrder.indexOf(b);
				return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
			}).map(function (k) { return mGroups[k]; });
		},

		_collectParams: function () {
			var aOut = [];
			(this.getModel("parameters").getProperty("/groups") || []).forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					aOut.push({
						key: oParam.key,
						value: oParam.value,
						dataType: oParam.dataType || "xsd:string"
					});
				});
			});
			return aOut;
		},

		_findParamValue: function (sKey) {
			var oParam = this._findParam(sKey);
			return oParam ? (oParam.value || oParam.defaultValue || "") : "";
		},

		_findParam: function (sKey) {
			var sFound = "";
			var oFound = null;
			(this.getModel("parameters").getProperty("/groups") || []).some(function (oGroup) {
				return oGroup.params.some(function (oParam) {
					if (oParam.key === sKey) {
						sFound = oParam;
						oFound = oParam;
						return true;
					}
					return false;
				});
			});
			return oFound || sFound;
		},

		_splitQueryList: function (sValue) {
			return String(sValue || "")
				.replace(/^\s*\$?(select|expand)\s*=\s*/i, "")
				.split(",")
				.map(function (sItem) { return sItem.trim(); })
				.filter(Boolean);
		},

		_joinQueryList: function (aValues) {
			var mSeen = {};
			return (aValues || []).map(function (sValue) {
				return String(sValue || "").trim();
			}).filter(function (sValue) {
				if (!sValue || mSeen[sValue]) {
					return false;
				}
				mSeen[sValue] = true;
				return true;
			}).join(",");
		},

		_getSfResourcePath: function () {
			return this._findParamValue("SFResourcePath") ||
				this._findParamValue("pulse.entity") ||
				this._findParamValue("extract.entity") ||
				"";
		},

		_getPulseRunOptionsFromDialog: function () {
			var sEntity = this._getSfResourcePath();
			return {
				entity: sEntity,
				selectQuery: this._oPulseSelectTextArea ? this._oPulseSelectTextArea.getValue().trim() : "",
				expandQuery: this._oPulseExpandTextArea ? this._oPulseExpandTextArea.getValue().trim() : "",
				filterQuery: this._buildPulseFilterQuery()
			};
		},

		_formatPulseGeneratedQuery: function () {
			var oOptions = this._getPulseRunOptionsFromDialog();
			var aParts = [];
			if (oOptions.selectQuery) {
				aParts.push("$select=" + oOptions.selectQuery);
			}
			if (oOptions.expandQuery) {
				aParts.push("$expand=" + oOptions.expandQuery);
			}
			if (oOptions.filterQuery) {
				aParts.push("$filter=" + oOptions.filterQuery);
			}
			if (!aParts.length) {
				return this.getText("pulseDebugNoQuery");
			}
			return aParts.join("&");
		},

		_refreshPulseDebugQuery: function () {
			if (this._oPulseDebugTextArea) {
				this._oPulseDebugTextArea.setValue(this._formatPulseGeneratedQuery());
			}
		},

		_syncPulseTextAreasFromPickers: function () {
			if (this._oPulseSelectTextArea && this._oPulseSelectPicker) {
				this._oPulseSelectTextArea.setValue(this._joinQueryList(
					this._oPulseSelectPicker.getSelectedKeys().concat(Object.keys(this._mPulseAdvancedSelect || {}))
				));
			}
			if (this._oPulseExpandTextArea) {
				this._oPulseExpandTextArea.setValue(this._joinQueryList(Object.keys(this._mPulseAdvancedExpand || {})));
			}
			this._syncPulseFilterFieldOptions();
			this._refreshPulseDebugQuery();
		},

		_setPulsePickerItems: function (oPicker, aFields, aSelected) {
			oPicker.removeAllItems();
			(aFields || []).forEach(function (oField) {
				oPicker.addItem(new Item({ key: oField.key, text: oField.text + " (" + oField.key + ")" }));
			});
			oPicker.setSelectedKeys(aSelected || []);
		},

		_createPulseFieldPicker: function (aFields, aSelected, sPlaceholder) {
			var oPicker = new MultiComboBox({
				width: "100%",
				placeholder: sPlaceholder,
				selectedKeys: aSelected,
				selectionFinish: this._syncPulseTextAreasFromPickers.bind(this)
			});
			this._setPulsePickerItems(oPicker, aFields, aSelected);
			return oPicker;
		},

		_isCommonSelectField: function (sPath) {
			return !String(sPath || "").includes("/") && !!mCommonSelectFields[sPath];
		},

		_seedPulseAdvancedSelections: function (aSelectDefaults, aExpandDefaults) {
			this._mPulseAdvancedSelect = {};
			this._mPulseAdvancedExpand = {};
			(aSelectDefaults || []).forEach(function (sPath) {
				if (!this._isCommonSelectField(sPath)) {
					this._mPulseAdvancedSelect[sPath] = true;
				}
			}.bind(this));
			(aExpandDefaults || []).forEach(function (sPath) {
				if (sPath) {
					this._mPulseAdvancedExpand[sPath] = true;
				}
			}.bind(this));
		},

		_getPulseImmediateChildren: function (sBasePath) {
			var oOptions = this._oPulseEdmxOptions;
			var sPrefix = sBasePath ? sBasePath + "/" : "";
			if (oOptions && oOptions.entityTypes) {
				var sEntity = this._getPulseEntityForPath(oOptions, sBasePath);
				var oEntity = sEntity && oOptions.entityTypes[sEntity];
				if (!oEntity) {
					return [];
				}
				return (oEntity.properties || []).slice().sort().map(function (sProperty) {
					return {
						path: sPrefix + sProperty,
						text: sProperty,
						nav: false
					};
				}).concat((oEntity.navs || []).slice().sort(function (a, b) {
					return a.name.localeCompare(b.name);
				}).map(function (oNav) {
					return {
						path: sPrefix + oNav.name,
						text: oNav.name,
						nav: true
					};
				}));
			}
			return [];
		},

		_getPulseEntityForPath: function (oOptions, sBasePath) {
			var sEntity = oOptions.rootEntity;
			String(sBasePath || "").split("/").filter(Boolean).some(function (sNavName) {
				var oEntity = oOptions.entityTypes && oOptions.entityTypes[sEntity];
				var oNav = (oEntity && oEntity.navs || []).filter(function (oItem) {
					return oItem.name === sNavName;
				})[0];
				if (!oNav || !oNav.target) {
					sEntity = "";
					return true;
				}
				sEntity = oNav.target;
				return false;
			});
			return sEntity;
		},

		_setPulseAdvancedSelection: function (sPath, bNav, bSelected) {
			var mSelection = bNav ? this._mPulseAdvancedExpand : this._mPulseAdvancedSelect;
			if (bSelected) {
				mSelection[sPath] = true;
			} else {
				delete mSelection[sPath];
			}
			this._syncPulseTextAreasFromPickers();
		},

		_createPulseAdvancedRow: function (oNode, iLevel) {
			var oChildren = new VBox({ visible: false }).addStyleClass("ipPulseAdvancedChildren");
			var oToggle = new Button({
				icon: oNode.nav ? "sap-icon://navigation-right-arrow" : "",
				type: "Transparent",
				enabled: oNode.nav,
				width: "2rem"
			}).addStyleClass("ipPulseTreeToggle");
			var oCheckbox = new CheckBox({
				selected: oNode.nav ? !!this._mPulseAdvancedExpand[oNode.path] : !!this._mPulseAdvancedSelect[oNode.path],
				select: function (oEvent) {
					this._setPulseAdvancedSelection(oNode.path, oNode.nav, oEvent.getParameter("selected"));
				}.bind(this)
			});
			var oLabel = new Text({ text: oNode.text }).addStyleClass(oNode.nav ? "ipPulseAdvancedNavText" : "ipPulseAdvancedFieldText");
			var oRow = new HBox({
				alignItems: "Center",
				items: [
					oToggle,
					oCheckbox,
					oLabel
				]
			}).addStyleClass("ipPulseAdvancedRow");
			oRow.addStyleClass("ipPulseAdvancedLevel" + Math.min(iLevel, 5));
			if (oNode.nav) {
				var bLoaded = false;
				var fnToggle = function () {
					var bExpand = !oChildren.getVisible();
					if (bExpand && !bLoaded) {
						this._renderPulseAdvancedLevel(oChildren, oNode.path, iLevel + 1);
						bLoaded = true;
					}
					oChildren.setVisible(bExpand);
					oToggle.setIcon(bExpand ? "sap-icon://navigation-down-arrow" : "sap-icon://navigation-right-arrow");
				}.bind(this);
				oToggle.attachPress(fnToggle);
				oRow.addEventDelegate({
					onclick: function (oEvent) {
						var oTarget = oEvent.target;
						if (!oTarget.closest || (!oTarget.closest(".sapMCb") && !oTarget.closest(".sapMBtn"))) {
							fnToggle();
						}
					}
				});
			}
			return new VBox({ items: [oRow, oChildren] });
		},

		_renderPulseAdvancedLevel: function (oContainer, sBasePath, iLevel) {
			oContainer.removeAllItems();
			this._getPulseImmediateChildren(sBasePath).forEach(function (oNode) {
				oContainer.addItem(this._createPulseAdvancedRow(oNode, iLevel || 0));
			}.bind(this));
		},

		_renderPulseAdvancedTree: function () {
			if (!this._oPulseAdvancedTree) {
				return;
			}
			if (!this._oPulseEdmxOptions) {
				this._oPulseAdvancedTree.removeAllItems();
				this._oPulseAdvancedTree.addItem(new Text({ text: this.getText("pulseAdvancedNeedsMetadata") }));
				return;
			}
			this._renderPulseAdvancedLevel(this._oPulseAdvancedTree, "", 0);
			this._syncPulseTextAreasFromPickers();
		},

		_getPulseSelectedFilterFields: function () {
			return this._splitQueryList(this._oPulseSelectTextArea ? this._oPulseSelectTextArea.getValue() : "")
				.map(function (sPath) {
					return { key: sPath, text: sPath };
				});
		},

		_formatPulseFilterValue: function (sValue) {
			var sText = String(sValue || "").trim();
			if (/^-?\d+(\.\d+)?$/.test(sText) || /^(true|false|null)$/i.test(sText)) {
				return sText;
			}
			return "'" + sText.replace(/'/g, "''") + "'";
		},

		_buildPulseFilterExpression: function (sField, sOperation, sValue) {
			var sFormattedValue = this._formatPulseFilterValue(sValue);
			switch (sOperation) {
			case "ne":
			case "gt":
			case "ge":
			case "lt":
			case "le":
				return sField + " " + sOperation + " " + sFormattedValue;
			case "in":
				return String(sValue || "").split(",").map(function (sItem) {
					return sItem.trim();
				}).filter(Boolean).map(function (sItem) {
					return sField + " eq " + this._formatPulseFilterValue(sItem);
				}.bind(this)).join(" or ");
			case "contains":
				return "substringof(" + sFormattedValue + "," + sField + ")";
			case "startswith":
				return "startswith(" + sField + "," + sFormattedValue + ")";
			case "notstartswith":
				return "not startswith(" + sField + "," + sFormattedValue + ")";
			case "endswith":
				return "endswith(" + sField + "," + sFormattedValue + ")";
			case "notendswith":
				return "not endswith(" + sField + "," + sFormattedValue + ")";
			case "toupper_eq":
				return "toupper(" + sField + ") eq " + sFormattedValue;
			case "tolower_eq":
				return "tolower(" + sField + ") eq " + sFormattedValue;
			case "trim_eq":
				return "trim(" + sField + ") eq " + sFormattedValue;
			default:
				return sField + " eq " + sFormattedValue;
			}
		},

		_buildPulseFilterQuery: function () {
			return (this._aPulseFilters || []).map(function (oFilter) {
				if (!oFilter.field || !oFilter.operation || !String(oFilter.value || "").trim()) {
					return "";
				}
				var sExpression = this._buildPulseFilterExpression(oFilter.field, oFilter.operation, oFilter.value);
				return sExpression.indexOf(" or ") > -1 ? "(" + sExpression + ")" : sExpression;
			}.bind(this)).filter(Boolean).join(" and ");
		},

		_syncPulseFilterFieldOptions: function () {
			var aFields = this._getPulseSelectedFilterFields();
			(this._aPulseFilterFieldSelects || []).forEach(function (oSelect, iIndex) {
				var sCurrentKey = oSelect.getSelectedKey();
				oSelect.removeAllItems();
				aFields.forEach(function (oField) {
					oSelect.addItem(new Item({ key: oField.key, text: oField.text }));
				});
				if (sCurrentKey && aFields.some(function (oField) { return oField.key === sCurrentKey; })) {
					oSelect.setSelectedKey(sCurrentKey);
				} else if (aFields[0]) {
					oSelect.setSelectedKey(aFields[0].key);
					if (this._aPulseFilters[iIndex]) {
						this._aPulseFilters[iIndex].field = aFields[0].key;
					}
				} else if (this._aPulseFilters[iIndex]) {
					this._aPulseFilters[iIndex].field = "";
				}
			}.bind(this));
		},

		_addPulseFilterRow: function () {
			var aFields = this._getPulseSelectedFilterFields();
			this._aPulseFilters = this._aPulseFilters || [];
			this._aPulseFilters.push({
				field: aFields[0] ? aFields[0].key : "",
				operation: "eq",
				value: ""
			});
			this._renderPulseFilterRows();
			this._refreshPulseDebugQuery();
		},

		_removePulseFilterRow: function (iIndex) {
			this._aPulseFilters.splice(iIndex, 1);
			if (!this._aPulseFilters.length) {
				this._aPulseFilters.push({ field: "", operation: "eq", value: "" });
			}
			this._renderPulseFilterRows();
			this._refreshPulseDebugQuery();
		},

		_createPulseFilterRow: function (oFilter, iIndex) {
			var aFields = this._getPulseSelectedFilterFields();
			var oFieldSelect = new Select({
				width: "100%",
				selectedKey: oFilter.field,
				change: function (oEvent) {
					this._aPulseFilters[iIndex].field = oEvent.getSource().getSelectedKey();
					this._refreshPulseDebugQuery();
				}.bind(this)
			});
			aFields.forEach(function (oField) {
				oFieldSelect.addItem(new Item({ key: oField.key, text: oField.text }));
			});
			if (!oFilter.field && aFields[0]) {
				oFilter.field = aFields[0].key;
				oFieldSelect.setSelectedKey(oFilter.field);
			}
			this._aPulseFilterFieldSelects.push(oFieldSelect);

			var oOperationSelect = new Select({
				width: "100%",
				selectedKey: oFilter.operation || "eq",
				change: function (oEvent) {
					this._aPulseFilters[iIndex].operation = oEvent.getSource().getSelectedKey();
					this._refreshPulseDebugQuery();
				}.bind(this)
			});
			FILTER_OPERATIONS.forEach(function (oOperation) {
				oOperationSelect.addItem(new Item({ key: oOperation.key, text: oOperation.text }));
			});

			var oValueInput = new Input({
				width: "100%",
				value: oFilter.value,
				liveChange: function (oEvent) {
					this._aPulseFilters[iIndex].value = oEvent.getParameter("value");
					this._refreshPulseDebugQuery();
				}.bind(this)
			});

			return new HBox({
				alignItems: "Center",
				items: [
					oFieldSelect.addStyleClass("ipPulseFilterField"),
					oOperationSelect.addStyleClass("ipPulseFilterOperation"),
					oValueInput.addStyleClass("ipPulseFilterValue"),
					new Button({
						icon: "sap-icon://decline",
						type: "Transparent",
						tooltip: this.getText("pulseRemoveFilter"),
						press: function () {
							this._removePulseFilterRow(iIndex);
						}.bind(this)
					}),
					new Button({
						icon: "sap-icon://add",
						type: "Transparent",
						tooltip: this.getText("pulseAddFilter"),
						press: this._addPulseFilterRow.bind(this)
					})
				]
			}).addStyleClass("ipPulseFilterRow");
		},

		_renderPulseFilterRows: function () {
			if (!this._oPulseFilterRows) {
				return;
			}
			this._aPulseFilterFieldSelects = [];
			this._oPulseFilterRows.removeAllItems();
			(this._aPulseFilters || []).forEach(function (oFilter, iIndex) {
				this._oPulseFilterRows.addItem(this._createPulseFilterRow(oFilter, iIndex));
			}.bind(this));
		},

		_parseEdmxMetadata: function (sXml) {
			if (!/<(?:\w+:)?Edmx\b|<(?:\w+:)?Schema\b/i.test(sXml || "")) {
				throw new Error(this.getText("pulseEdmxInvalid"));
			}
			var mEntitySets = {};
			var mEntityTypes = {};
			var mAssociations = {};

			var oEntitySetMatch;
			var rEntitySet = /<(?:\w+:)?EntitySet\b([^>]*)\/?>/gi;
			while ((oEntitySetMatch = rEntitySet.exec(sXml))) {
				var sEntitySetName = xmlAttr(oEntitySetMatch[1], "Name");
				if (sEntitySetName) {
					mEntitySets[sEntitySetName] = stripNamespace(xmlAttr(oEntitySetMatch[1], "EntityType"));
				}
			}

			var oAssociationMatch;
			var rAssociation = /<(?:\w+:)?Association\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Association>/gi;
			while ((oAssociationMatch = rAssociation.exec(sXml))) {
				var sAssociationName = xmlAttr(oAssociationMatch[1], "Name");
				var mRoles = {};
				var oEndMatch;
				var rEnd = /<(?:\w+:)?End\b([^>]*)\/?>/gi;
				while ((oEndMatch = rEnd.exec(oAssociationMatch[2]))) {
					var sRole = xmlAttr(oEndMatch[1], "Role");
					if (sRole) {
						mRoles[sRole] = stripNamespace(xmlAttr(oEndMatch[1], "Type"));
					}
				}
				if (sAssociationName) {
					mAssociations[sAssociationName] = mRoles;
				}
			}

			var oEntityTypeMatch;
			var rEntityType = /<(?:\w+:)?EntityType\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?EntityType>/gi;
			while ((oEntityTypeMatch = rEntityType.exec(sXml))) {
				var sEntityName = xmlAttr(oEntityTypeMatch[1], "Name");
				if (!sEntityName) {
					continue;
				}
				var oEntity = { properties: [], navs: [] };
				var sBody = oEntityTypeMatch[2];
				var oPropertyMatch;
				var rProperty = /<(?:\w+:)?Property\b([^>]*)\/?>/gi;
				while ((oPropertyMatch = rProperty.exec(sBody))) {
					var sPropertyName = xmlAttr(oPropertyMatch[1], "Name");
					if (sPropertyName) {
						oEntity.properties.push(sPropertyName);
					}
				}
				var oNavMatch;
				var rNav = /<(?:\w+:)?NavigationProperty\b([^>]*)\/?>/gi;
				while ((oNavMatch = rNav.exec(sBody))) {
					var sNavName = xmlAttr(oNavMatch[1], "Name");
					var sRelationship = stripNamespace(xmlAttr(oNavMatch[1], "Relationship"));
					var mAssociation = mAssociations[sRelationship] || {};
					if (sNavName) {
						oEntity.navs.push({
							name: sNavName,
							target: mAssociation[xmlAttr(oNavMatch[1], "ToRole")] || ""
						});
					}
				}
				mEntityTypes[sEntityName] = oEntity;
			}

			return { entitySets: mEntitySets, entityTypes: mEntityTypes };
		},

		_getEdmxOptionsCacheKey: function (sResourcePath) {
			return String(sResourcePath || "").trim();
		},

		_getCachedEdmxOptions: function (sResourcePath) {
			var sCacheKey = this._getEdmxOptionsCacheKey(sResourcePath);
			var oCached = sCacheKey && mEdmxOptionsCache[sCacheKey];
			if (!oCached || !oCached.entityTypes) {
				return null;
			}
			return {
				rootEntity: oCached.rootEntity,
				entityTypes: oCached.entityTypes,
				selectFields: oCached.selectFields || [],
				expandFields: oCached.expandFields || [],
				truncated: !!oCached.truncated,
				cachedAt: oCached.cachedAt
			};
		},

		_storeEdmxOptions: function (sResourcePath, oOptions) {
			var sCacheKey = this._getEdmxOptionsCacheKey(sResourcePath);
			if (!sCacheKey || !oOptions) {
				return;
			}
			mEdmxOptionsCache[sCacheKey] = {
				rootEntity: oOptions.rootEntity,
				entityTypes: oOptions.entityTypes,
				selectFields: (oOptions.selectFields || []).slice(0, 5000),
				expandFields: (oOptions.expandFields || []).slice(0, 5000),
				truncated: !!oOptions.truncated,
				cachedAt: new Date().toISOString()
			};
			persistEdmxOptionsCache();
		},

		_applyEdmxOptionsToDialog: function (oOptions, mSettings) {
			var mOptions = mSettings || {};
			this._oPulseEdmxOptions = oOptions;
			this._renderPulseAdvancedTree();
			return Promise.resolve().then(function () {
				if (this._oPulseEdmxStatus && mOptions.statusText) {
					this._oPulseEdmxStatus.setText(mOptions.statusText);
				}
				this._refreshPulseDebugQuery();
			}.bind(this));
		},

		_buildEdmxQueryOptions: function (oMetadata, sResourcePath) {
			var sRootEntity = (oMetadata.entitySets && oMetadata.entitySets[sResourcePath]) || sResourcePath;
			if (!sRootEntity || !oMetadata.entityTypes[sRootEntity]) {
				throw new Error(this.getText("pulseEdmxEntityNotFound", [sResourcePath || "SFResourcePath"]));
			}
			var oRootEntity = oMetadata.entityTypes[sRootEntity] || {};
			return {
				rootEntity: sRootEntity,
				entityTypes: oMetadata.entityTypes,
				selectFields: (oRootEntity.properties || []).map(function (sProperty) {
					return { key: sProperty, text: sProperty };
				}),
				expandFields: (oRootEntity.navs || []).map(function (oNav) {
					return { key: oNav.name, text: oNav.name };
				}),
				truncated: false
			};
		},

		_openEdmxProgressDialog: function () {
			this._oEdmxProgressIndicator = new ProgressIndicator({
				width: "100%",
				percentValue: 0,
				displayValue: "0%"
			});
			this._oEdmxProgressText = new Text({ text: this.getText("pulseEdmxProgressStarting") });
			this._oEdmxProgressDialog = new Dialog({
				title: this.getText("pulseEdmxProgressTitle"),
				contentWidth: "24rem",
				content: [
					new VBox({
						items: [
							this._oEdmxProgressText,
							this._oEdmxProgressIndicator
						]
					}).addStyleClass("ipEdmxProgressContent")
				]
			});
			this.getView().addDependent(this._oEdmxProgressDialog);
			this._oEdmxProgressDialog.open();
		},

		_updateEdmxProgress: function (iPercent, sText) {
			var iValue = Math.max(0, Math.min(100, Math.round(iPercent || 0)));
			if (this._oEdmxProgressIndicator) {
				this._oEdmxProgressIndicator.setPercentValue(iValue);
				this._oEdmxProgressIndicator.setDisplayValue(iValue + "%");
			}
			if (this._oEdmxProgressText && sText) {
				this._oEdmxProgressText.setText(sText);
			}
		},

		_closeEdmxProgressDialog: function () {
			if (this._oEdmxProgressDialog) {
				this._oEdmxProgressDialog.close();
				this._oEdmxProgressDialog.destroy();
			}
			this._oEdmxProgressDialog = null;
			this._oEdmxProgressIndicator = null;
			this._oEdmxProgressText = null;
		},

		_uploadPulseEdmx: function () {
			var oInput = document.createElement("input");
			oInput.type = "file";
			oInput.accept = ".edmx,.xml,text/xml,application/xml";
			oInput.onchange = function () {
				var oFile = oInput.files && oInput.files[0];
				if (!oFile) {
					return;
				}
				this._openEdmxProgressDialog();
				var oReader = new FileReader();
				oReader.onprogress = function (oEvent) {
					if (oEvent.lengthComputable) {
						this._updateEdmxProgress(
							Math.min(70, (oEvent.loaded / oEvent.total) * 70),
							this.getText("pulseEdmxProgressReading")
						);
					}
				}.bind(this);
				oReader.onload = function (oEvent) {
					try {
						this._updateEdmxProgress(72, this.getText("pulseEdmxProgressParsing"));
						var sResourcePath = this._getSfResourcePath();
						if (!sResourcePath) {
							throw new Error(this.getText("pulseEdmxNoResourcePath"));
						}
						var oMetadata = this._parseEdmxMetadata(oEvent.target.result);
						this._updateEdmxProgress(86, this.getText("pulseEdmxProgressBuilding"));
						var oOptions = this._buildEdmxQueryOptions(oMetadata, sResourcePath);
						this._storeEdmxOptions(sResourcePath, oOptions);
						this._updateEdmxProgress(94, this.getText("pulseEdmxProgressPopulating"));
						this._applyEdmxOptionsToDialog(oOptions, {
							selectProgress: function (nProgress) {
								this._updateEdmxProgress(94 + (nProgress * 3), this.getText("pulseEdmxProgressPopulating"));
							}.bind(this),
							expandProgress: function (nProgress) {
								this._updateEdmxProgress(97 + (nProgress * 3), this.getText("pulseEdmxProgressPopulating"));
							}.bind(this),
							statusText: this.getText("pulseEdmxLoaded", [
									oFile.name,
									oOptions.rootEntity,
									oOptions.selectFields.length,
									oOptions.expandFields.length
								]) + (oOptions.truncated ? " " + this.getText("pulseEdmxTruncated") : "")
						}).then(function () {
							this._refreshPulseDebugQuery();
							this._updateEdmxProgress(100, this.getText("pulseEdmxProgressComplete"));
							setTimeout(this._closeEdmxProgressDialog.bind(this), 250);
						}.bind(this)).catch(function (oErr) {
							this._closeEdmxProgressDialog();
							MessageBox.error(this.getText("pulseEdmxLoadFailed", [oErr.message]));
						}.bind(this));
					} catch (oErr) {
						this._closeEdmxProgressDialog();
						MessageBox.error(this.getText("pulseEdmxLoadFailed", [oErr.message]));
					}
				}.bind(this);
				oReader.onerror = function () {
					this._closeEdmxProgressDialog();
					MessageBox.error(this.getText("pulseEdmxLoadFailed", [this.getText("pulseEdmxReadFailed")]));
				}.bind(this);
				oReader.readAsText(oFile);
			}.bind(this);
			oInput.click();
		},

		_togglePulseAdvancedBox: function (sType, oLink) {
			var oBox = sType === "select" ? this._oPulseSelectAdvancedBox : this._oPulseExpandAdvancedBox;
			if (!oBox) {
				return;
			}
			var bShow = !oBox.getVisible();
			oBox.setVisible(bShow);
			oLink.setText(bShow ?
				this.getText("pulseHideAdvancedQuery") :
				this.getText("pulseShowAdvancedQuery"));
		},

		_togglePulseDebugBox: function (oLink) {
			if (!this._oPulseDebugBox) {
				return;
			}
			var bShow = !this._oPulseDebugBox.getVisible();
			this._oPulseDebugBox.setVisible(bShow);
			oLink.setText(bShow ?
				this.getText("pulseHideGeneratedQuery") :
				this.getText("pulseShowGeneratedQuery"));
			if (bShow) {
				this._refreshPulseDebugQuery();
			}
		},

		_openPulseRunDialog: function (oIntegration, sName) {
			var sResourcePath = this._getSfResourcePath();
			var aSelectDefaults = this._splitQueryList(this._findParamValue("pulse.selectQuery"));
			var aExpandDefaults = this._splitQueryList(this._findParamValue("pulse.expandQuery"));
			this._seedPulseAdvancedSelections(aSelectDefaults, aExpandDefaults);
			this._oPulseSelectPicker = this._createPulseFieldPicker(
				SF_SELECT_FIELDS,
				aSelectDefaults.filter(this._isCommonSelectField),
				this.getText("pulseSelectPlaceholder")
			);
			this._oPulseSelectTextArea = new TextArea({
				width: "100%",
				rows: 3,
				value: this._joinQueryList(aSelectDefaults),
				placeholder: "userId,personIdExternal,firstName,lastName",
				liveChange: this._refreshPulseDebugQuery.bind(this)
			});
			this._oPulseExpandTextArea = new TextArea({
				width: "100%",
				rows: 3,
				value: this._joinQueryList(aExpandDefaults),
				placeholder: "employmentNav,personNav,emailNav",
				liveChange: this._refreshPulseDebugQuery.bind(this)
			});
			this._aPulseFilters = [{ field: "", operation: "eq", value: "" }];
			this._aPulseFilterFieldSelects = [];
			this._oPulseFilterRows = new VBox().addStyleClass("ipPulseFilterRows");
			this._oPulseDebugTextArea = new TextArea({
				width: "100%",
				rows: 3,
				editable: false,
				value: this._formatPulseGeneratedQuery()
			}).addStyleClass("ipPulseDebugTextArea");
			this._oPulseEdmxStatus = new Text({
				text: sResourcePath ?
					this.getText("pulseEdmxWaitingForUpload", [sResourcePath]) :
					this.getText("pulseEdmxNoResourcePath")
			}).addStyleClass("ipPulseEdmxStatus");
			this._oPulseSelectAdvancedBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseSelectAdvanced") }),
					this._oPulseSelectTextArea
				]
			}).addStyleClass("ipPulseAdvancedBox");
			this._oPulseExpandAdvancedBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseExpandAdvanced") }),
					this._oPulseExpandTextArea
				]
			}).addStyleClass("ipPulseAdvancedBox");
			this._oPulseAdvancedTree = new VBox().addStyleClass("ipPulseAdvancedTree");
			this._renderPulseAdvancedTree();
			this._renderPulseFilterRows();
			this._oPulseDebugBox = new VBox({
				visible: false,
				items: [
					new Label({ text: this.getText("pulseGeneratedQuery") }),
					this._oPulseDebugTextArea
				]
			}).addStyleClass("ipPulseDebugBox");

			var oEdmxTools = new VBox({
				items: [
					new HBox({
						alignItems: "Center",
						justifyContent: "SpaceBetween",
						items: [
							new VBox({
								items: [
									new Label({ text: this.getText("pulseMetadataTitle") }).addStyleClass("ipPulseFieldLabel"),
									this._oPulseEdmxStatus
								]
							}),
							new Button({
								text: this.getText("pulseUploadEdmx"),
								icon: "sap-icon://upload",
								type: "Transparent",
								press: this._uploadPulseEdmx.bind(this)
							})
						]
					})
				]
			}).addStyleClass("ipPulseMetadataBox");

			var oSelectGroup = new VBox({
				items: [
					new Label({ text: this.getText("pulseSelectFields") }).addStyleClass("ipPulseFieldLabel"),
					this._oPulseSelectPicker
				]
			}).addStyleClass("ipPulseFieldGroup");

			var oAdvancedGroup = new VBox({
				items: [
					new Label({ text: this.getText("pulseAdvancedFields") }).addStyleClass("ipPulseFieldLabel"),
					new Text({ text: this.getText("pulseAdvancedFieldsIntro") }).addStyleClass("ipPulseAdvancedIntro"),
					this._oPulseAdvancedTree,
					new Link({
						text: this.getText("pulseShowAdvancedQuery"),
						press: function (oEvent) {
							this._togglePulseAdvancedBox("select", oEvent.getSource());
							this._togglePulseAdvancedBox("expand", oEvent.getSource());
						}.bind(this)
					}).addStyleClass("ipPulseAdvancedLink"),
					this._oPulseSelectAdvancedBox,
					this._oPulseExpandAdvancedBox
				]
			}).addStyleClass("ipPulseFieldGroup");

			var oFilterGroup = new VBox({
				items: [
					new Label({ text: this.getText("pulseFilterFields") }).addStyleClass("ipPulseFieldLabel"),
					new Text({ text: this.getText("pulseFilterFieldsIntro") }).addStyleClass("ipPulseAdvancedIntro"),
					new HBox({
						items: [
							new Text({ text: this.getText("pulseFilterField") }).addStyleClass("ipPulseFilterHeaderField"),
							new Text({ text: this.getText("pulseFilterOperation") }).addStyleClass("ipPulseFilterHeaderOperation"),
							new Text({ text: this.getText("pulseFilterValue") }).addStyleClass("ipPulseFilterHeaderValue")
						]
					}).addStyleClass("ipPulseFilterHeader"),
					this._oPulseFilterRows,
					new Link({
						text: this.getText("pulseAddFilter"),
						press: this._addPulseFilterRow.bind(this)
					}).addStyleClass("ipPulseAdvancedLink")
				]
			}).addStyleClass("ipPulseFieldGroup");

			var oDialog = new Dialog({
				title: this.getText("pulseRunDialogTitle"),
				contentWidth: "46rem",
				content: [
					new VBox({
						items: [
							new Text({ text: this.getText("pulseRunDialogIntro") }).addStyleClass("ipPulseIntro"),
							oEdmxTools,
							oSelectGroup,
							oAdvancedGroup,
							oFilterGroup,
							new Link({
								text: this.getText("pulseShowGeneratedQuery"),
								press: function (oEvent) {
									this._togglePulseDebugBox(oEvent.getSource());
								}.bind(this)
							}).addStyleClass("ipPulseDebugLink"),
							this._oPulseDebugBox
						]
					}).addStyleClass("ipPulseRunContent")
				],
				beginButton: new Button({
					text: this.getText("deployImmediately"),
					type: "Emphasized",
					press: function () {
						var oRunOptions = this._getPulseRunOptionsFromDialog();
						oDialog.close();
						this._doDeployImmediately(oIntegration, sName, oRunOptions);
					}.bind(this)
				}),
				endButton: new Button({
					text: this.getText("cancel"),
					press: function () { oDialog.close(); }
				}),
				afterClose: function () {
					oDialog.destroy();
					this._oPulseSelectPicker = null;
					this._oPulseSelectTextArea = null;
					this._oPulseExpandTextArea = null;
					this._oPulseSelectAdvancedBox = null;
					this._oPulseExpandAdvancedBox = null;
					this._oPulseAdvancedTree = null;
					this._oPulseEdmxOptions = null;
					this._mPulseAdvancedSelect = null;
					this._mPulseAdvancedExpand = null;
					this._aPulseFilters = null;
					this._aPulseFilterFieldSelects = null;
					this._oPulseFilterRows = null;
					this._oPulseDebugTextArea = null;
					this._oPulseDebugBox = null;
					this._oPulseEdmxStatus = null;
				}.bind(this)
			});
			this.getView().addDependent(oDialog);
			oDialog.open();
			var oCachedOptions = this._getCachedEdmxOptions(sResourcePath);
			if (oCachedOptions) {
				this._applyEdmxOptionsToDialog(oCachedOptions, {
					statusText: this.getText("pulseEdmxCached", [
						oCachedOptions.rootEntity,
						oCachedOptions.selectFields.length,
						oCachedOptions.expandFields.length
					]) + (oCachedOptions.truncated ? " " + this.getText("pulseEdmxTruncated") : "")
				});
			}
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

		_scheduleModeFromIndex: function (iIndex) {
			return ["once", "day", "recur", "advanced"][Number(iIndex) || 0] || "advanced";
		},

		_scheduleModeToIndex: function (sMode) {
			var iIndex = ["once", "day", "recur", "advanced"].indexOf(sMode);
			return iIndex > -1 ? iIndex : 3;
		},

		onParamChange: function () {
			this._recomputeDirty();
		},

		_createScheduleOptions: function () {
			return {
				frequencyModes: [
					{ key: "once", text: "Run Once" },
					{ key: "day", text: "Schedule on Day" },
					{ key: "recur", text: "Schedule to Recur" },
					{ key: "advanced", text: "Advanced" }
				],
				secondModes: [
					{ key: "specific", text: "Specific seconds" },
					{ key: "every", text: "Every second" },
					{ key: "start", text: "Every 1 second starting at" }
				],
				minuteModes: [
					{ key: "specific", text: "Specific minutes" },
					{ key: "every", text: "Every minute" },
					{ key: "start", text: "Every 1 minute starting at" }
				],
				hourModes: [
					{ key: "specific", text: "Specific hours" },
					{ key: "every", text: "Every hour" },
					{ key: "start", text: "Every 1 hour starting at" }
				],
				dayModes: [
					{ key: "every", text: "Every day" },
					{ key: "specific", text: "Specific days" }
				],
				monthModes: [
					{ key: "every", text: "Every month" },
					{ key: "specific", text: "Specific months" }
				],
				yearModes: [
					{ key: "every", text: "Every year" },
					{ key: "specific", text: "Specific years" }
				],
				seconds: range(0, 59, function (i) { return ordinal(i); }),
				minutes: range(0, 59, function (i) { return ordinal(i) + " minute"; }),
				hours: range(0, 23, function (i) { return ordinal(i) + " hour"; }),
				days: range(1, 31, ordinal),
				months: MONTHS,
				years: range(new Date().getFullYear(), new Date().getFullYear() + 10),
				weekdays: WEEKDAYS,
				recurUnits: [
					{ key: "minutes", text: "Minutes" },
					{ key: "hours", text: "Hours" },
					{ key: "days", text: "Days" }
				],
				timeZones: [
					{ key: "America/Los_Angeles", text: "America/Los Angeles (PT)" },
					{ key: "America/New_York", text: "America/New York (ET)" },
					{ key: "UTC", text: "UTC" },
					{ key: "Europe/London", text: "Europe/London" }
				]
			};
		},

		_isTimerParam: function (oParam) {
			var sText = [oParam.key, oParam.label].join(" ").toLowerCase();
			return /\b(timer|cron|schedule|frequency)\b/.test(sText);
		},

		_scheduleFromCron: function (sValue) {
			var sCron = String(sValue || "").trim();
			var sTimeZone = "America/Los_Angeles";
			var aTz = sCron.match(/--tz=([^\s]+)/);
			if (aTz) {
				sTimeZone = aTz[1];
				sCron = sCron.replace(/\s*--tz=[^\s]+/, "");
			}
			var aParts = sCron.split(/\s+/);
			var sSeconds = aParts[0] || "0";
			var sMinutes = aParts[1] || "0";
			var sHours = aParts[2] || "0";
			var sDays = aParts[3] || "*";
			var sMonths = aParts[4] || "*";
			var sWeekdays = aParts[5] || "?";
			var sYears = aParts[6] || "*";
			var sToday = new Date().toISOString().slice(0, 10);
			var sDisplayHour = cronStartValue(sHours, "0");
			var sDisplayMinute = cronStartValue(sMinutes, "0");
			return {
				mode: "advanced",
				modeIndex: 3,
				onceDate: sToday,
				onceTime: pad2(sDisplayHour) + ":" + pad2(sDisplayMinute),
				dayWeekdays: sWeekdays && sWeekdays !== "?" && sWeekdays !== "*" ? sWeekdays.split(",") : ["MON"],
				dayTime: pad2(sHours === "*" ? 9 : sDisplayHour) + ":" + pad2(sDisplayMinute),
				recurEvery: "1",
				recurUnit: "hours",
				recurStartTime: "09:00",
				secondMode: sSeconds === "*" ? "every" : (sSeconds.indexOf("/") > -1 ? "start" : "specific"),
				minuteMode: sMinutes === "*" ? "every" : (sMinutes.indexOf("/") > -1 ? "start" : "specific"),
				hourMode: sHours === "*" ? "every" : (sHours.indexOf("/") > -1 ? "start" : "specific"),
				dayMode: sDays === "*" || sDays === "?" ? "every" : "specific",
				monthMode: sMonths === "*" ? "every" : "specific",
				yearMode: sYears === "*" ? "every" : "specific",
				seconds: this._cronFieldToKeys(sSeconds, "0"),
				minutes: this._cronFieldToKeys(sMinutes, "0"),
				hours: this._cronFieldToKeys(sHours, "0"),
				days: this._cronFieldToKeys(sDays, "1"),
				months: this._cronFieldToKeys(sMonths, "JAN"),
				years: this._cronFieldToKeys(sYears, String(new Date().getFullYear())),
				timeZone: sTimeZone
			};
		},

		_cronFieldToKeys: function (sField, sFallback) {
			if (!sField || sField === "*" || sField === "?") {
				return [sFallback];
			}
			if (sField.indexOf("/") > -1) {
				return [sField.split("/")[0]];
			}
			return sField.split(",");
		},

		_keysToCronField: function (sMode, aValues, sEvery, sPrefix) {
			var aKeys = aValues && aValues.length ? aValues : [sEvery];
			if (sMode === "every") {
				return "*";
			}
			if (sMode === "start") {
				return aKeys[0] + "/1";
			}
			if (sPrefix) {
				return aKeys.map(function (sKey) { return sPrefix + sKey; }).join(",");
			}
			return aKeys.join(",");
		},

		_scheduleToCron: function (oSchedule) {
			var sTz = oSchedule.timeZone ? " --tz=" + oSchedule.timeZone : "";
			if (oSchedule.mode === "once") {
				var aDate = (oSchedule.onceDate || "").split("-");
				var aTime = (oSchedule.onceTime || "00:00").split(":");
				var sMonth = MONTHS[Number(aDate[1] || 1) - 1].key;
				return "0 " + Number(aTime[1] || 0) + " " + Number(aTime[0] || 0) + " " +
					Number(aDate[2] || 1) + " " + sMonth + " ? " + (aDate[0] || "*") + sTz;
			}
			if (oSchedule.mode === "day") {
				var aDayTime = (oSchedule.dayTime || "09:00").split(":");
				return "0 " + Number(aDayTime[1] || 0) + " " + Number(aDayTime[0] || 0) +
					" ? * " + (oSchedule.dayWeekdays || ["MON"]).join(",") + " *" + sTz;
			}
			if (oSchedule.mode === "recur") {
				var nEvery = Math.max(Number(oSchedule.recurEvery || 1), 1);
				if (oSchedule.recurUnit === "minutes") {
					return "0 0/" + nEvery + " * ? * * *" + sTz;
				}
				if (oSchedule.recurUnit === "hours") {
					return "0 0 0/" + nEvery + " ? * * *" + sTz;
				}
				var aStartTime = (oSchedule.recurStartTime || "09:00").split(":");
				return "0 " + Number(aStartTime[1] || 0) + " " + Number(aStartTime[0] || 0) +
					" 1/" + nEvery + " * ? *" + sTz;
			}
			return [
				this._keysToCronField(oSchedule.secondMode, oSchedule.seconds, "0"),
				this._keysToCronField(oSchedule.minuteMode, oSchedule.minutes, "0"),
				this._keysToCronField(oSchedule.hourMode, oSchedule.hours, "0"),
				this._keysToCronField(oSchedule.dayMode, oSchedule.days, "*"),
				this._keysToCronField(oSchedule.monthMode, oSchedule.months, "*"),
				"?",
				this._keysToCronField(oSchedule.yearMode, oSchedule.years, "*")
			].join(" ") + sTz;
		},

		onTimerScheduleChange: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("parameters");
			var oParam = oCtx && oCtx.getObject();
			if (!oParam || !oParam.schedule) {
				return;
			}
			oParam.schedule.modeIndex = this._scheduleModeToIndex(oParam.schedule.mode);
			oParam.value = this._scheduleToCron(oParam.schedule);
			this.getModel("parameters").refresh(true);
			this._recomputeDirty();
		},

		onTimerModeSelect: function (oEvent) {
			var oCtx = oEvent.getSource().getBindingContext("parameters");
			var oParam = oCtx && oCtx.getObject();
			if (!oParam || !oParam.schedule) {
				return;
			}
			oParam.schedule.modeIndex = oEvent.getParameter("selectedIndex");
			oParam.schedule.mode = this._scheduleModeFromIndex(oParam.schedule.modeIndex);
			oParam.value = this._scheduleToCron(oParam.schedule);
			this.getModel("parameters").refresh(true);
			this._recomputeDirty();
		},

		onReset: function () {
			var oModel = this.getModel("parameters");
			var aGroups = oModel.getProperty("/groups") || [];
			aGroups.forEach(function (oGroup) {
				oGroup.params.forEach(function (oParam) {
					oParam.value = oParam.pristineValue;
					if (oParam.isTimer) {
						oParam.schedule = this._scheduleFromCron(oParam.pristineValue);
					}
				}.bind(this));
			}.bind(this));
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

		onDeployImmediately: function () {
			var oIntegration = this.getModel("integration").getData() || {};
			var sName = oIntegration.name || oIntegration.id || this._sId;
			this._openPulseRunDialog(oIntegration, sName);
		},

		_doDeployImmediately: function (oIntegration, sName, oRunOptions) {
			var that = this;
			this.getModel("detailView").setProperty("/busy", true);
			MessageToast.show(this.getText("deployImmediatelyStarted", [sName]));
			BackendClient.triggerImmediateRun(oIntegration, oRunOptions).then(function () {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.success(that.getText("deployImmediatelySuccess", [sName]));
			}).catch(function (oErr) {
				that.getModel("detailView").setProperty("/busy", false);
				MessageBox.error(that.getText("deployImmediatelyError", [oErr.message]));
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
