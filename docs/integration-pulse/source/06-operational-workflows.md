# Standard Operational Workflows

## A. Find an integration by Source or Target System

Purpose: Identify which integration supports a vendor, HR platform, payroll system, time system, or third-party service.

1. Select Integrations.
2. Choose Sort by Source System or Sort by Target System.
3. Use Search integrations if the list is large.
4. Select the system tile.
5. Review the integration cards or list for that system.

Expected result: The page displays deployed integrations associated with the selected system.

Technical note: Source and Target grouping is based on Sender and Receiver metadata from design-time artifacts where available, with cached metadata in local storage.

## B. Review deployed integration details

1. Open Integrations.
2. Select the relevant Source or Target System.
3. Select an integration card.
4. Review artifact metadata, version, package, status, and externalized parameters.

Expected result: The Integration Detail view opens for the selected runtime artifact.

## C. Review externalized parameters

1. Open the integration detail page.
2. Expand the parameter group if needed.
3. Review the displayed key, label, and current value.

## D. Edit a supported configuration value

1. Open an integration detail page.
2. Change the required value.
3. Confirm that the Save draft or Deploy controls become relevant to the workflow.
4. Review the change before saving or deploying.

Expected result: The value is collected for a configuration update request.

## E. Validate configuration before redeployment

The code validates dirty state and collects parameter values, but it does not implement a full business validation rules engine. Integration owners must confirm values against the expected iFlow configuration rules before redeployment.

## F. Redeploy an integration

1. Open the integration detail page.
2. Review changed parameters.
3. Select Deploy.
4. Confirm the deployment dialog.
5. Wait for confirmation or error feedback.

Caution: Redeployment affects a tenant runtime artifact. Use change control appropriate for the environment.

## G. Review or update a user-friendly schedule

1. Open an integration with a timer-like parameter.
2. Locate the schedule section.
3. Choose Run Once, Schedule on Day, Schedule to Recur, or Advanced.
4. Update time, frequency, day, month, year, and time zone fields as required.
5. Review the generated schedule value before deployment.

## H. Understand schedule mapping

Timer-like parameters are detected by key or label text containing timer, cron, schedule, or frequency. The UI maps schedule choices into cron-like expression strings, including a --tz= suffix when a time zone is selected.

## I. Monitor health by Source System

1. Select Monitoring.
2. Choose Sort by Source System.
3. Review Passed, Failed, and Warnings counts on each system tile.
4. Select a tile to open run history.

## J. Monitor health by Target System

1. Select Monitoring.
2. Choose Sort by Target System.
3. Review the target system tiles.
4. Select a tile to investigate logs.

## K. Drill into failed or warning runs

1. Open Monitoring.
2. Select a system with failed or warning count.
3. Review Message Processing Logs.
4. Select a failed row to view error details when present.

## L. Review message processing logs

The log table shows Status, Integration, Message ID, Results, Sender, Time, and Duration. Discarded entries are filtered out by the application.

## M. View a captured payload summary

1. Open Monitoring Detail.
2. Find a log row with View Results.
3. Select View Results.
4. Review the preview in the payload dialog.

## N. Download a downloadOnly payload

1. Select View Results for the row.
2. If the payload is too large to preview, read the download-only message.
3. Select Download.
4. Handle the downloaded file according to HR data handling policy.

## O. Escalate a failure

1. Capture integration name, system, Message ID, time, status, error details.
2. Confirm whether a payload summary is available.
3. Escalate to Integration Support or the integration owner.
4. Do not attach prohibited PII to tickets.
