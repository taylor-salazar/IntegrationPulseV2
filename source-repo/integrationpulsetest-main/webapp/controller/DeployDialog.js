sap.ui.define([
    "sap/ui/base/ManagedObject",
    "sap/ui/core/Fragment",

], function (ManagedObject, Fragment) {

        "use strict";

        return ManagedObject.extend("ui5.walkthrough.controller.DeployDialog", {
            
            //Will pass in a view to the constructor
            constructor : function (oView) {
                
                //Store the view in a private variable for later use
                this._oView = oView;
            },

            exit : function() {
                delete this._oView;
            },

            open: function (oCtx, fnOnConfirm) {
                this._oCtx = oCtx;          // store row context for later use
                var oView = this._oView;

                console.log("open() got callback:", typeof fnOnConfirm);  // <-- HERE
                this._fnOnConfirm =fnOnConfirm

                // IMPORTANT: fragment IDs are prefixed with viewId + "--"
                var oDialog = oView.byId("deployConfirmDialog");

                if (!oDialog) {
                    var oFragmentController = {
                    onCloseDialog: function () {
                        oView.byId("deployConfirmDialog").close();
                    },

                    onDeployDialog: function () {
                        console.log("has _fnOnConfirm:", !!this._fnOnConfirm);
                        console.log("onDeployDialog fired");
                        const oDialog = oView.byId("deployConfirmDialog");
                        const oCtx = oDialog.getBindingContext("integrations");
                        const oRow = oCtx && oCtx.getObject();

                        // Use these for your API call later:
                        const payload = {
                            Id: oRow?.Id,
                            Version: oRow?.Version,
                            Name: oRow?.Name
                        };
                        
                        
                        if (this._fnOnConfirm) {
                            this._fnOnConfirm(payload);
                        }

                        oDialog.close();
                    }.bind(this)
                    };

                    Fragment.load({
                        id: oView.getId(),
                        name: "ui5.walkthrough.view.DeployConfirm",
                        controller: oFragmentController
                    }).then(function (oDialog) {
                    oView.addDependent(oDialog);

                    // bind the dialog to the clicked row context (next change)
                    if (this._oCtx) {
                        oDialog.setBindingContext(this._oCtx, "integrations");
                    }

                    oDialog.open();
                    }.bind(this));
                } else {
                    // update binding every time you open (in case a different row is clicked)
                    if (this._oCtx) {
                        oDialog.setBindingContext(this._oCtx, "integrations");
                    }
                    oDialog.open();
                }
            }

        })
    


});