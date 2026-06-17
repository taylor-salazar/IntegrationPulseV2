sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "../model/formatter",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "../service/IntegrationApi",
    "sap/m/MessageToast"
],

function (Controller, JSONModel, formatter, Filter, FilterOperator, IntegrationApi, MessageToast) {
    "use strict";
    return Controller.extend("ui5.walkthrough.controller.IntegrationList", {
        
        formatter: formatter,
        
        async onInit() {
            var oViewModel =new JSONModel({
                currency: "USD"
            });
            this.getView().setModel(oViewModel, "view");

            var oModel = new JSONModel({items: []});
            this.getView().setModel(oModel, "integrations")

            try{
                const res = await fetch("/api/v1/IntegrationRuntimeArtifacts", {
                                  method: "GET",
                                  headers: { "Accept": "application/json" }
                                  });
                
                if(!res.ok){
                    throw new Error('HTTP ${res.status}');
                }
                
                //await will wait for the parsing to complete. res returns a promise
                const data = await res.json();
                
                // items becomes the array that the List binds to. Comes from d/results from the API response format
                const results = (data?.d?.results || []).map(o => ({ ...o, _expanded: false }));
                oModel.setProperty("/items", results.slice(0, 5));
                


                console.log("Integrations loaded:", oModel.getProperty("/items"));
            }
            catch(e){
                console.error("Failed to load integrations", e);
            }
        },

        onFilterIntegrations: function (oEvent) {

            //build filter array
            var aFilter = [];
            var sQuery = oEvent.getParameter("query");
            if (sQuery) {
                aFilter.push(new Filter("Name", FilterOperator.Contains, sQuery));
            }

            //filter binding.
            /*
            UI5 data display involves 3 layers: 
            Model   →   Binding   →   Control
            (JSON)      (logic)       (List)

            Model is your JSON data, Binding is the intermediary connecting data to control, and control is UI element itself.

            The below code shows the binding between the JSON data model (the integration list denoted by 'items'), and the control.
            */
            var oList = this.byId("integrationList");
            var oBinding = oList.getBinding("items");
            oBinding.filter(aFilter);

        },

        onDeployIntegrationBtnPress: function(oEvent) {

            //Context aware (by List Items)
            const oCtx = oEvent.getSource().getBindingContext("integrations");
            if (!oCtx) { return; }

            // assuming you created this._oDeployDialog = new DeployDialog(this.getView()) somewhere
            this.getOwnerComponent()._DeployDialog.open(oCtx,
                this._deployIntegration.bind(this)
            );

        },

        _deployIntegration: async function(oPayload){
            console.log("Deploy Payload: ", oPayload)
            try {
                await IntegrationApi.deployIntegration(oPayload);

                MessageToast.show(
                                    `Deployment triggered for ${oPayload.Name} (v${oPayload.Version})`
                                    );
            }
            catch (e) {
                console.error("Deploy failed:", e);

                MessageToast.show(
                            `Deployment failed for ${oPayload.Name}`
                            );
            }
        },

        onToggleExpand: function (oEvent) {
            const oItem = oEvent.getSource();                        // the ObjectListItem that was clicked
            const oCtx = oItem.getBindingContext("integrations");    //returns the binding context for the SPECIFIC row that was clicked
            if (!oCtx) {
                return;
            }

            const oModel = this.getView().getModel("integrations");
            const aItems = oModel.getProperty("/items") || [];

            const sPath = oCtx.getPath();        // e.g. "/items/3". This is how we know which array entry was clicked.
            const iIndex = Number(sPath.split("/").pop()); //Gets just the number so that it can be used as an index
            if (Number.isNaN(iIndex)) {
                return;
            }
            
            //saves 'expanded' state so that it collapse the rest
            const bNewState = !aItems[iIndex]._expanded;

            // collapse all
            aItems.forEach(o => { o._expanded = false; });

            // expand only clicked (or none if it was already open)
            aItems[iIndex]._expanded = bNewState;

            // trigger UI update
            oModel.setProperty("/items", aItems);
            }

    })

    }
    
    
);