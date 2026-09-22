# Your volleyball project

This is the complete results website, extended with **Team analysis**.

## Try it on your computer

Install **Node.js 24 or newer**, then open a terminal inside this folder:

```bash
npm ci
npm run serve
```

Open **http://localhost:3000/?league=4125#analysis**. The included current-season KSV.3 match has real PDF-derived data. Nobody has been preselected as setter.

1. Choose your league and team.
2. Choose a match, or leave **All available matches** selected.
3. Open **Who was setting?** Choose the match to configure and mark each setter. Mark emergency setters as **Backup**.
4. Click **Save setters**. The rotation table updates immediately. Without a setter, rallies stay **Unconfirmed**.
5. Read the serving and rotation tables. Use **Download CSV** to take either table into a spreadsheet.

Setter choices are saved in this browser. **Export setter choices** downloads a backup. To share the choices with everyone visiting your site, replace `data/analysis-config.json` in your GitHub repository with that file.

## Put it on your own GitHub

Create an empty repository on GitHub. From this project folder:

```bash
git init -b main
git add .
git commit -m "Add volleyball results and team analysis"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the example username and repository name with yours. You can also import the extracted folder with GitHub Desktop.

In your repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Actions → General → Workflow permissions: Read and write permissions**, if your repository policy requires it for automated data commits.
3. Open **Actions → Refresh and publish volleyball → Run workflow**.
4. The successful deployment provides your website link.

The workflow checks results twice an hour, downloads newly published PDFs, calculates the statistics and republishes the website. GitHub scheduling and PDF publication can add delays; it is not an instant final-whistle feed.

Read **README.md** for commands and files, and **docs/METRICS.md** for the exact calculations.
