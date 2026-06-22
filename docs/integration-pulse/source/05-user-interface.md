# User Interface Overview

## Home

The Home page contains tiles for Integrations and Monitoring. The shell sidebar groups Integrations and Monitoring beneath Home. This provides a simple landing point for HR operations users.

[Screenshot needed: Home page showing Integrations and Monitoring tiles.]

## Integrations

The Integrations page displays deployed integration flows. Users can switch between Source System and Target System grouping. Category tiles show the system name and integration count. Selecting a category shows the integrations for that system without leaving the application shell.

[Screenshot needed: Integrations page grouped by Source System.]

## Integration Detail

The Integration Detail page shows metadata and externalized parameters. Parameters are grouped by prefix when possible. Timer-like parameters are rendered with a scheduling UI that supports Run Once, Schedule on Day, Schedule to Recur, and Advanced modes. Deploy actions are guarded by confirmation dialogs.

[Screenshot needed: Integration Detail externalized parameters and schedule controls.]

## Monitoring

The Monitoring page summarizes integration health by Source System or Target System. Tiles show Passed, Failed, and Warnings counts. Selecting a system tile opens run history for the related integrations.

[Screenshot needed: Monitoring grouped by Source System.]

## Run History and Message Processing Logs

The Monitoring Detail page displays Message Processing Logs. It filters out Discarded entries, formats SAP OData dates, and includes a Results column. When a captured payload is linked to a log row by Message ID, users can select View Results to preview or download the payload summary.

[Screenshot needed: Monitoring Detail page with Results link and payload dialog.]
