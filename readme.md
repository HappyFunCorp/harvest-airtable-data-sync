# Readme

Connects Harvest data stored in postgres and updates Airtable sheets for Clients and Projects.

Assumes you've used StitchData to house the Harvest data into postgres.

# What it  does

* pulls in and stores Clients and Projects based on SQL queries
* Updates specific fields for matching records for each table
* Creates new records in each table if not found

# Get started

Requires a `.env` file with the following variables:

```
PGHOST=
PGUSER=
PGDATABASE=
PGPASSWORD=
PGPORT=5432
AIRTABLE_API_KEY=
```

To install dependencies:
`npm install`

To run the script:
`node app.js`
