# MCG IT Grid - ICT LMS

Vercel (static + serverless API) with a private GitHub repo as the database.

## Deploy
1. Create a PRIVATE GitHub repo for data (e.g. `lms-data`), initialised with a README.
2. GitHub > Settings > Developer settings > Fine-grained tokens: access to `lms-data` only, Contents = Read and write.
3. Push this folder to a separate code repo, then import it in Vercel (Framework: Other).
4. Vercel > Settings > Environment Variables:
   - `GITHUB_TOKEN`  token from step 2
   - `GITHUB_REPO`   `owner/lms-data`
   - `JWT_SECRET`    long random string
   - `TEACHER_CODE`  secret code teachers type when registering
5. Redeploy after adding the variables.
