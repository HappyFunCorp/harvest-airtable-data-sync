# Readme

Connects Harvest data stored in postgres and updates Airtable sheets for projects.

Assumes you've used StitchData to house the Harvest data into pg.

Requires a `.env` file with the following variables:

```
PGHOST=
PGUSER=
PGDATABASE=
PGPASSWORD=
PGPORT=5432
AIRTABLE_API_KEY=
```

# Get started

`npm install`

`node app.js`

# Credit to

* https://medium.com/@dannibla/connecting-nodejs-postgresql-f8967b9f5932
