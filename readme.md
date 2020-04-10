# Readme

Connects Harvest data stored in postgres and updates Airtable sheets for Clients and Projects.

Assumes you've used StitchData to house the Harvest data into postgres.

# What it  does

* pulls in and stores Clients and Projects based on SQL queries
* Updates specific fields for matching records for each table
* Creates new records in each table if not found

# TODOS

* only change necessary fields that have changed
* when a new client is created, store its value `client_id` and Airtable ID so that any new projects can link to it without requiring a second script run

# Caveats

* If a client name has a '/' it will not be ingested by Stitchdata
* If a project is deleted from Harvest, it will not be removed

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
`node index.js`
