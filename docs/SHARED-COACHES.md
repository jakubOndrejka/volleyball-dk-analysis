# Shared setter choices — Google setup

Keep GitHub Pages for results and PDF analysis. Store only coach setter choices in a Google Sheet. Coaches need the shared coach code, not a Google account. Only the owner needs a Google account to set it up.

No paid API, billing project or extra hosting server is required for this design. Google Apps Script usage limits still apply; this is a small-club tool, not an unlimited or guaranteed service.

## 1. Create the Sheet and script

1. Create a blank Google Sheet named **KSV coach choices**. Leave it private; do not publish it to the web or share it with all coaches.
2. In the Sheet choose **Extensions → Apps Script**. Name the script **KSV shared coaches**.
3. Replace the default `Code.gs` contents with the complete contents of this repository's `apps-script/Code.gs`. Save.
4. Open the script's **Project Settings** (gear icon). Under **Script properties**, add property **COACH_PASSWORD** with your agreed coach code as its value. Save the property. This is a project setting, not a line in the public JavaScript. [Google's property instructions](https://developers.google.com/apps-script/guides/properties#manage_script_properties_manually).
5. Return to the editor. Select the **setup** function beside Run, then click **Run**. Review and grant the Google permissions for your own project. If Google warns that this is an unverified personal app, check that it is the project you just created and inspect its requested permissions before continuing. Do not run `doPost` manually.
6. Return to the Sheet. There should be a **Setters** tab with headings. No match rows is normal. The script saves the Sheet ID automatically, so you do not paste a Sheet ID anywhere.

## 2. Deploy the web app

1. In Apps Script choose **Deploy → New deployment**.
2. Under Select type choose **Web app** (use the gear if needed).
3. Set **Execute as: Me**.
4. Set **Who has access: Anyone**. Do not choose “Anyone with Google account”; coaches must be able to use it without signing in. Some managed accounts may not offer public access because of their administrator's policy.
5. Click **Deploy**, finish any owner authorization, and copy the **Web app URL** ending in `/exec`.

Use the deployed `/exec` URL, not the `/dev` editor test URL. The app runs as you and writes only the configured spreadsheet through this code. [Google's web-app deployment documentation](https://developers.google.com/apps-script/guides/web).

Open the `/exec` URL in a private/incognito window without signing in. It should show JSON containing `"ok":true` and `"service":"KSV shared coach choices"`. Then append `?action=read`: an empty installation should return `{"ok":true,"version":1,"records":[]}`. This second check verifies that setup and Sheet access work, not just that deployment exists.

## 3. Connect the existing website

Edit the root `shared-coaches-config.json` file:

```json
{
  "endpoint": "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
}
```

Replace the whole example URL with the copied Web app URL. Leave the quotes. Put neither the coach code nor the Sheet sharing URL here. The endpoint is public by design.

Upload the changed files into the existing repository at their original paths. Preserve `scripts/`, `tests/`, `apps-script/` and `docs/` folders. Do not replace match data, logos or GitHub workflows. `scripts/build-site.js` must be included: it adds the new client and endpoint configuration to the published site.

Commit on the branch your Pages workflow publishes. Wait for **Refresh and publish volleyball** to succeed, or run that workflow manually. Reload the website; use Ctrl+Shift+R / Cmd+Shift+R if old files remain cached.

## 4. Test one real save

1. Open **Team analysis**, choose the league/team, then **Who was setting?**
2. Choose a match with a readable PDF. Mark setters, backup setters and the two-setter rule if applicable.
3. Enter your name or nickname and the shared coach code. Click **Save for all coaches**.
4. Wait for **Saved for everyone. Tables updated.** There may be a few seconds' delay. Do not close the page while it says it is waiting for confirmation.
5. Check the Sheet: one row should appear for this league/team/match, including the setter numbers and your name.
6. Open the website in a fresh private/incognito window. The same choices should load without entering a code. Entering the code is necessary only to save changes.

An already-open page does not receive push updates: click **Refresh shared choices**. Refresh discards any unsaved selections in that form. No recurring polling or Apps Script trigger needs to be installed.

## Existing choices and backups

- Old browser choices are retained. If the match has never been shared, they are shown initially. Click **Save for all coaches** to publish that match.
- If the match already has shared choices, those take priority. **Review my browser choices** explicitly loads an older local copy as a draft. Nothing is uploaded until you review and save it.
- An exported JSON backup can still be imported. Import stages choices locally only; it does not bulk-overwrite shared choices. Review and save each relevant match. This one-time migration is deliberate so old files cannot quietly undo other coaches' work.
- Coaches do not need to export files or edit GitHub during normal use. **Export setter choices** remains a manual backup of the choices loaded in the page. Refresh shared choices before exporting a current backup.
- A shared clear is saved as an empty choice record. This keeps an old browser/committed setter from reappearing. Missing or cleared setters remain **Unconfirmed** in the rotation table.
- Closing the browser, restarting a computer or clearing browser storage does not erase saved Sheet records. A coach's name is stored locally as a convenience. The entered code is kept only in page memory, not app localStorage; a browser/password manager may separately offer to remember it.

## Safe editing and privacy

One row represents one league + team + match. Per-set overrides are stored inside that match row. The server uses a script lock and revision check; a stale edit is rejected instead of overwriting a newer edit. An intentional new edit is possible after loading the latest choices. Updating another team or match does not replace your records.

This is shared-code access, not individual accounts. Anyone who knows the code can change any team's setter choices. The name is a self-entered label, not verified identity. **Setter numbers, team/match IDs, the coach display name and save time are publicly readable through the endpoint.** Use nicknames if preferred. Do not put personal notes, emails or sensitive information into these fields. The Sheet itself can stay private, but the records returned by the script are public.

Keep the code in Script properties, never in GitHub, `shared-coaches-config.json`, URLs or a public README. If it leaks, change the property and privately tell the coaches. No new website deployment is needed for a password-only change. Use the website controls to edit choices; the human-readable Sheet columns are summaries of **Choices JSON** and are not a direct editing interface. Do not rename columns, delete match rows or alter revision values. To reset a match use **Clear this match's setters** in the website.

The Apps Script code is safe to store in the repository because it contains no live password. Only its deployment URL is copied into the site. The code does not expose your Google token, spreadsheet ID or password in read responses. Reads are public read-only JSONP; saves use a simple POST and a separate matching receipt. A completed opaque browser POST alone is never considered a confirmed save. [Google's Content Service/JSONP documentation](https://developers.google.com/apps-script/guides/content).

## Troubleshooting

| What you see | What to check |
| --- | --- |
| Still says “Save setters” / browser only | `endpoint` is blank or the old config is cached. Confirm the new config file was deployed. |
| “Shared choices unavailable” | Check the `/exec?action=read` URL in a signed-out window, the deployment access and the network. Stats remain visible; saves stay disabled until shared choices load. |
| Google asks a coach to sign in | Deployment must execute as Me with access Anyone. A `/dev` URL or Google-account-only access will not work. |
| “Owner needs to run setup” | Run `setup` from the Sheet-bound project, using the owner's account. |
| “Coach code is not correct” | Check `COACH_PASSWORD`, capitalization and spaces. Enter the exact value, without quotes, in the page. |
| “Another coach changed this match” | Click **Load latest choices (discard draft)**, review the newer selections, make any still-needed changes and save again. |
| Save cannot be confirmed | It may have reached Google. Refresh first and check the Sheet before retrying. Do not assume it failed just because the connection dropped. |
| Quota/Google service failure | Wait and retry. The owner can inspect **Executions** in Apps Script. The app does not promise success when Google is unavailable. |
| Script edits have no effect | Save the script, then **Deploy → Manage deployments → Edit → New version → Deploy**. Keep the existing deployment URL. |

Do not run `doGet` or `doPost` from the editor to test a save; they need an actual web request. Do not install triggers, enable a Sheets API, create a Cloud billing project or put a Google access token into the website.

## Developer notes

The GitHub scheduled PDF collection and serving calculations are unchanged. Rotation calculations in the browser combine match data with shared choices. `build-analysis.js` still generates `data/analysis/summary.json` from committed configuration only, not live Google data. Integrations reading that static summary will therefore not reflect Google setter edits automatically.

`npm test` includes an in-memory Apps Script service harness and DOM integration tests. They cover read/save, wrong passwords, distinct teams, revision conflicts, clear records, per-set overrides, browser migration, JSONP, receipt confirmation and unavailable Google reads. These tests simulate Google services; the real deployment still needs the signed-out read and cross-browser save checks above.
