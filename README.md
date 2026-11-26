# LexReply landing page

Run locally:
    npm install
    ADMIN_KEY=mysecret npm start
Open http://localhost:3000

- Edit the words in public/index.html
- Sign-ups are saved to signups.jsonl
- View them at /admin/signups?key=mysecret

Deploy: Render.com, Railway or Fly.io (set ADMIN_KEY as an environment variable).
NOTE: on free hosts the disk can be wiped on redeploy. Use a persistent disk,
or replace the fs.appendFile with a database / Google Sheets call.
