# Readme

Connects Harvest data stored in postgres and updates Airtable sheets for projects.

Assumes you've used StitchData to house the Harvest data into postgres.

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

To install dependencies:
`npm install`

To run the script:
`node app.js`
