sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/resource/ResourceModel",
    "./controller/DeployDialog"
], 



function (UIComponent, JSONModel, ResourceModel, DeployDialog) {
    "use strict";

    //Component is the main entry point of the application. It is responsible for initializing the application and setting up the models.
    return UIComponent.extend("ui5.walkthrough.Component", {
        metadata : {
            manifest: "json"
         },

         init : function() {
            //call the init function of the parent
            UIComponent.prototype.init.apply(this, arguments);

            var oData = {
                integrationName : {
                    name : "EC to UKG"
                }
            };

            //Bind the default model to the view
            var oModel = new JSONModel(oData);
            this.setModel(oModel);

            //set dialog when component initializes 
            this._DeployDialog = new DeployDialog(this.getRootControl());
        

         },
        
         //App wide exit function 
         exit: function() {

            //Destroy the dialog when the component is destroyed to prevent memory leaks
            this._DeployDialog.destroy();
            delete this._DeployDialog;
         },

         openDeployDialog: function() {
            this._DeployDialog.open();
         }


        });
    
}
)