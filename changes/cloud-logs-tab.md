---
type: added
---

Cloud Logs: a Logs tab in the sidebar reads Google Cloud Logging for all your GCP projects with your own `gcloud` sign-in. It opens on Error Reporting's error groups, leaves load balancer and system noise out, lets you explore entries by service, field and trace, and answers questions in a conversation that cites the entries it used and can start a session to fix an error; set it up in the tab, picking projects from a list filtered as you type and envs suggested from your GKE clusters and Cloud Run services, or with `mesa logs setup`. When gcloud needs you to sign in again, the tab's Sign in to Google Cloud button runs `gcloud auth login` for you and reads again once you finish in the browser. Explorer's fields pane lists your app's own fields first, with search, value bars, include and exclude, and up to two fields pinned as columns.
